import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

export const runtime = 'nodejs';

type SupportLogPayload = {
  event_type: 'APPLY' | 'RESERVE_APPLY' | 'DELETE' | 'EXCEPTION_ON' | 'EXCEPTION_OFF';
  applied_at?: string | null;
  application_id?: string | null;
  leader_name?: string | null;
  region_id?: string | null;
  region_name?: string | null;
  company_name?: string | null;
  is_reserve?: boolean | null;
  is_excluded?: boolean | null;
  note?: string | null;
};

type SheetsClient = ReturnType<typeof google.sheets>;

function getBearerToken(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(authz);
  return m?.[1] ?? null;
}

function sheetRange(sheetTab: string, a1: string) {
  const escaped = sheetTab.replace(/'/g, "''");
  return `'${escaped}'!${a1}`;
}

function resolveSheetTab() {
  const raw = env('GOOGLE_SHEET_TAB');
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\\/?*[\]:]/g, '')
    .trim();
  return cleaned || 'support_log';
}

function parseAppliedAt(value?: string | null) {
  if (!value) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function formatKst(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const y = byType.get('year') ?? '0000';
  const m = byType.get('month') ?? '01';
  const day = byType.get('day') ?? '01';
  const h = byType.get('hour') ?? '00';
  const min = byType.get('minute') ?? '00';
  const sec = byType.get('second') ?? '00';
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}

function toYN(value: boolean) {
  return value ? 'Y' : 'N';
}

function normalize(v: unknown) {
  return String(v ?? '').trim();
}

function parseAppliedLabelToEpoch(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(v.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const s = Number(m[6]);
    return Date.UTC(y, mo, d, h - 9, mi, s);
  }
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sameRowKey(
  row: string[],
  appliedAt: string,
  leaderName: string,
  regionName: string,
  companyName: string,
) {
  return (
    normalize(row[0]) === normalize(appliedAt) &&
    normalize(row[1]) === normalize(leaderName) &&
    normalize(row[2]) === normalize(regionName) &&
    normalize(row[3]) === normalize(companyName)
  );
}

async function ensureHeader(sheets: SheetsClient, spreadsheetId: string, sheetTab: string) {
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetTab, 'A1:F1'),
  });
  const hasAny = (check.data.values?.[0] ?? []).some((cell) => String(cell ?? '').trim() !== '');
  if (hasAny) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(sheetTab, 'A1:F1'),
    valueInputOption: 'RAW',
    requestBody: {
      values: [['applied_at', 'leader_name', 'region_name', 'company_name', 'is_excluded', 'is_deleted']],
    },
  });
}

async function ensureSheetTabExists(sheets: SheetsClient, spreadsheetId: string, sheetTab: string) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))',
  });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === sheetTab);
  if (exists) return;

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTab } } }],
      },
    });
  } catch {
    // Ignore race where another request creates the same sheet tab first.
  }
}

function errorMessage(e: unknown) {
  if (typeof e === 'object' && e !== null) {
    const withResponse = e as {
      response?: { data?: { error?: { message?: string } } };
      message?: string;
    };
    const apiMessage = withResponse.response?.data?.error?.message;
    if (apiMessage) return apiMessage;
    if (withResponse.message) return withResponse.message;
  }
  return e instanceof Error ? e.message : 'unknown error';
}

function env(name: string) {
  const raw = process.env[name];
  if (!raw) return '';
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function buildJwtAuth() {
  const clientEmail = env('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) return null;

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const supabaseService = env('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 });
    }

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sbUser = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authErr } = await sbUser.auth.getUser(token);
    if (authErr || !authData.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const actorUserId = authData.user.id;

    const sbAdmin = createClient(supabaseUrl, supabaseService, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: actor, error: actorErr } = await sbAdmin
      .from('profiles')
      .select('user_id,display_name,role')
      .eq('user_id', actorUserId)
      .maybeSingle();
    if (actorErr || !actor) {
      return NextResponse.json({ error: 'Failed to load actor profile' }, { status: 500 });
    }

    const payload = (await req.json().catch(() => null)) as SupportLogPayload | null;
    if (!payload?.event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 });
    }

    const sheetId = env('GOOGLE_SHEET_ID');
    const sheetTab = resolveSheetTab();
    const auth = buildJwtAuth();

    if (!sheetId || !auth) {
      return NextResponse.json(
        {
          ok: false,
          skipped: true,
          reason: 'Missing GOOGLE_SHEET_ID or service account env',
        },
        { status: 202 },
      );
    }

    const sheets = google.sheets({ version: 'v4', auth });
    await ensureSheetTabExists(sheets, sheetId, sheetTab);
    await ensureHeader(sheets, sheetId, sheetTab);

    const appliedAt = parseAppliedAt(payload.applied_at);
    const appliedAtLabel = formatKst(appliedAt);
    const leaderName = payload.leader_name ?? '';
    const regionName = payload.region_name ?? '';
    const companyName = payload.company_name ?? '';
    let excluded = Boolean(payload.is_excluded);
    if (payload.event_type === 'EXCEPTION_ON') excluded = true;
    if (payload.event_type === 'EXCEPTION_OFF') excluded = false;
    const deleted = payload.event_type === 'DELETE';
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: sheetRange(sheetTab, 'A2:F'),
    });
    const rows: string[][] = (existing.data.values ?? []).map((r) => [
      String(r?.[0] ?? ''),
      String(r?.[1] ?? ''),
      String(r?.[2] ?? ''),
      String(r?.[3] ?? ''),
      String(r?.[4] ?? ''),
      String(r?.[5] ?? ''),
    ]);

    const idx = rows.findIndex((row) =>
      sameRowKey(row, appliedAtLabel, leaderName, regionName, companyName),
    );
    const nextRow = [appliedAtLabel, leaderName, regionName, companyName, toYN(excluded), toYN(deleted)];

    if (idx >= 0) {
      rows[idx] = nextRow;
    } else {
      rows.push(nextRow);
    }

    rows.sort((a, b) => parseAppliedLabelToEpoch(a[0]) - parseAppliedLabelToEpoch(b[0]));

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: sheetRange(sheetTab, 'A2:F'),
    });
    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: sheetRange(sheetTab, 'A2:F'),
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = errorMessage(e);
    console.error('[support-log] failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

