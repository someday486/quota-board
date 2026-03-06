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

type ActorProfile = {
  user_id: string;
  display_name: string | null;
  role: string | null;
  is_admin: boolean | null;
};

type SheetsClient = ReturnType<typeof google.sheets>;
type LogSheetRow = {
  rowNumber: number;
  values: string[];
  applicationId: string;
};

const SUPPORT_LOG_HEADERS = [
  'applied_at',
  'leader_name',
  'region_name',
  'company_name',
  'is_excluded',
  'is_deleted',
  'application_id',
];

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
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(sheetTab, 'A1:G1'),
    valueInputOption: 'RAW',
    requestBody: {
      values: [SUPPORT_LOG_HEADERS],
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

function toLogSheetRow(values: string[], rowNumber: number): LogSheetRow {
  return {
    rowNumber,
    values: [
      String(values[0] ?? ''),
      String(values[1] ?? ''),
      String(values[2] ?? ''),
      String(values[3] ?? ''),
      String(values[4] ?? ''),
      String(values[5] ?? ''),
      String(values[6] ?? ''),
    ],
    applicationId: normalize(values[6]),
  };
}

function findMatchingRow(
  rows: LogSheetRow[],
  applicationId: string,
  appliedAt: string,
  leaderName: string,
  regionName: string,
  companyName: string,
) {
  if (applicationId) {
    const byApplicationId = rows.find((row) => row.applicationId === applicationId);
    if (byApplicationId) return byApplicationId;
  }
  return rows.find((row) => sameRowKey(row.values, appliedAt, leaderName, regionName, companyName));
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
      .select('user_id,display_name,role,is_admin')
      .eq('user_id', actorUserId)
      .maybeSingle();
    if (actorErr || !actor) {
      return NextResponse.json({ error: 'Failed to load actor profile' }, { status: 500 });
    }
    const actorProfile = actor as ActorProfile;
    const isAdmin = actorProfile.role === 'admin' || Boolean(actorProfile.is_admin);

    const payload = (await req.json().catch(() => null)) as SupportLogPayload | null;
    if (!payload?.event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 });
    }
    if (!isAdmin && payload.event_type !== 'APPLY' && payload.event_type !== 'RESERVE_APPLY') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    const applicationId = normalize(payload.application_id);
    const leaderName = normalize(
      isAdmin ? payload.leader_name : (actorProfile.display_name ?? payload.leader_name),
    );
    const regionName = normalize(payload.region_name);
    const companyName = normalize(payload.company_name);
    if (!leaderName || !regionName || !companyName) {
      return NextResponse.json({ error: 'leader_name, region_name, company_name are required' }, { status: 400 });
    }
    let excluded = Boolean(payload.is_excluded);
    if (payload.event_type === 'EXCEPTION_ON') excluded = true;
    if (payload.event_type === 'EXCEPTION_OFF') excluded = false;
    const deleted = payload.event_type === 'DELETE';
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: sheetRange(sheetTab, 'A2:G'),
    });
    const rows = (existing.data.values ?? []).map((row, index) =>
      toLogSheetRow((row ?? []).map((cell) => String(cell ?? '')), index + 2),
    );
    const nextRow = [
      appliedAtLabel,
      leaderName,
      regionName,
      companyName,
      toYN(excluded),
      toYN(deleted),
      applicationId,
    ];

    const targetRow = findMatchingRow(
      rows,
      applicationId,
      appliedAtLabel,
      leaderName,
      regionName,
      companyName,
    );

    if (targetRow) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: sheetRange(sheetTab, `A${targetRow.rowNumber}:G${targetRow.rowNumber}`),
        valueInputOption: 'RAW',
        requestBody: { values: [nextRow] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: sheetRange(sheetTab, 'A2:G'),
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [nextRow] },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = errorMessage(e);
    console.error('[support-log] failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

