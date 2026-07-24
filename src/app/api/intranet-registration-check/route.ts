import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export const runtime = 'nodejs';

type ActorProfile = {
  user_id: string;
  display_name: string | null;
  role: string | null;
  is_admin: boolean | null;
};

type CheckRow = {
  applicationId: string;
  appliedAt: string;
  appliedDate?: string;
  meetingTimeSlot?: string | null;
  leaderName: string;
  regionName: string;
  companyName: string;
};

type DataCenterResult = {
  ok: boolean;
  status: number;
  json: unknown;
};

type DataCenterSyncResponse = {
  result?: boolean;
  targetDate?: string;
  total?: number;
  inserted?: number;
  skippedRoute?: number;
  castTodayCount?: number;
  error?: string;
};

type IntranetCheckStatus =
  | 'registered'
  | 'missing'
  | 'date_mismatch'
  | 'time_mismatch'
  | 'multiple'
  | 'similar'
  | 'error';

type IntranetCheckResult = {
  applicationId: string;
  status: IntranetCheckStatus;
  expectedApDate?: string;
  appliedDate?: string;
  expectedTimeSlot?: MeetingTimeSlot;
  matchedTimeSlot?: MeetingTimeSlot;
  matchCount?: number;
  matches?: unknown[];
  reason?: string;
};

type MeetingTimeSlot = 'am' | 'pm';

const INTRANET_CHECK_STATUSES = new Set<IntranetCheckStatus>([
  'registered',
  'missing',
  'date_mismatch',
  'time_mismatch',
  'multiple',
  'similar',
  'error',
]);

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

function getBearerToken(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(authz);
  return m?.[1] ?? null;
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'unknown error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIntranetStatus(value: unknown): IntranetCheckStatus {
  return typeof value === 'string' && INTRANET_CHECK_STATUSES.has(value as IntranetCheckStatus)
    ? (value as IntranetCheckStatus)
    : 'error';
}

function normalizeTimeSlot(value: unknown): MeetingTimeSlot | undefined {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'am' || raw === '오전') return 'am';
  if (raw === 'pm' || raw === '오후') return 'pm';
  return undefined;
}

function timeSlotFromApTime(value: unknown): MeetingTimeSlot | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (raw.includes('오전') || lower.includes('am')) return 'am';
  if (raw.includes('오후') || lower.includes('pm')) return 'pm';

  const hourMatch = /(?:^|\D)(\d{1,2})(?::\d{2})?/.exec(raw);
  if (!hourMatch) return undefined;
  const hour = Number(hourMatch[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return undefined;
  return hour < 12 ? 'am' : 'pm';
}

function formatKstDate(value: string) {
  const d = new Date(value);
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(safe);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  return `${byType.get('year') ?? '0000'}-${byType.get('month') ?? '01'}-${byType.get('day') ?? '01'}`;
}

function postDataCenterJson(
  url: URL,
  token: string,
  payload: unknown,
  connectHost?: string,
  hostHeader?: string,
) {
  const body = JSON.stringify(payload);
  const isHttps = url.protocol === 'https:';
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const effectiveHost = connectHost || url.hostname;
  const effectiveHostHeader = hostHeader || url.hostname;
  const options = {
    method: 'POST',
    hostname: effectiveHost,
    port: url.port ? Number(url.port) : isHttps ? 443 : 80,
    path: `${url.pathname}${url.search}`,
    headers: {
      host: effectiveHostHeader,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      authorization: `Bearer ${token}`,
    },
    servername: isHttps ? effectiveHostHeader : undefined,
    timeout: 30000,
    // The data_center host currently serves a certificate chain that Node cannot verify.
    // Scope the workaround to this single server-to-server call instead of disabling TLS globally.
    rejectUnauthorized: false,
  };

  return new Promise<DataCenterResult>((resolve, reject) => {
    const req = requestFn(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = { error: text || 'Empty data_center response' };
        }
        const status = res.statusCode ?? 500;
        resolve({ ok: status >= 200 && status < 300, status, json });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('Data center request timed out.'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function syncCastTomorrowForBaseDates(baseDates: string[], token: string) {
  const syncUrl =
    env('DATA_CENTER_CAST_TOMORROW_SYNC_URL') ||
    'https://mega-info.re.kr/data_center/api/quota_cast_tomorrow_sync.php';
  const uniqueDates = Array.from(new Set(baseDates.filter(Boolean))).slice(0, 5);
  const summaries: DataCenterSyncResponse[] = [];

  for (const baseDate of uniqueDates) {
    const targetUrl = new URL(syncUrl);
    targetUrl.searchParams.set('t', token);
    targetUrl.searchParams.set('baseDate', baseDate);
    const dataCenterConnectHost =
      env('DATA_CENTER_INTRACHECK_CONNECT_HOST') ||
      (targetUrl.hostname === 'mega-info.re.kr' ? '112.175.184.33' : '');

    const dataCenter = await postDataCenterJson(
      targetUrl,
      token,
      { source: 'quota-board', baseDate },
      dataCenterConnectHost || undefined,
      targetUrl.hostname,
    );
    const json = dataCenter.json as DataCenterSyncResponse;
    if (!dataCenter.ok || json?.result === false) {
      throw new Error(json?.error || '데이터센터 추가DB등록에 실패했습니다.');
    }
    summaries.push(json);
  }

  return summaries;
}

function normalizeCheckResults(
  payloadRows: Array<{
    applicationId: string;
    appliedAt: string;
    appliedDate: string;
    meetingTimeSlot?: MeetingTimeSlot;
    leaderName: string;
    regionName: string;
    companyName: string;
  }>,
  responsePayload: Record<string, unknown>,
): IntranetCheckResult[] {
  const rawResults = Array.isArray(responsePayload.results) ? responsePayload.results : [];
  const resultsById = new Map<string, IntranetCheckResult>();

  for (const raw of rawResults) {
    if (!isRecord(raw)) continue;
    const applicationId = String(raw.applicationId ?? '').trim();
    if (!applicationId) continue;
    resultsById.set(applicationId, {
      ...(raw as Partial<IntranetCheckResult>),
      applicationId,
      status: normalizeIntranetStatus(raw.status),
    });
  }

  return payloadRows
    .filter((row) => row.applicationId)
    .map((row) => {
      const result = resultsById.get(row.applicationId);
      if (result) {
        const expectedTimeSlot = row.meetingTimeSlot ?? normalizeTimeSlot(result.expectedTimeSlot);
        const matches = Array.isArray(result.matches) ? result.matches : [];
        const matchedSlots = matches
          .map((match) => (isRecord(match) ? timeSlotFromApTime(match.apTime) : undefined))
          .filter((slot): slot is MeetingTimeSlot => Boolean(slot));

        if (
          expectedTimeSlot &&
          matchedSlots.length > 0 &&
          (result.status === 'registered' || result.status === 'multiple' || result.status === 'similar') &&
          !matchedSlots.includes(expectedTimeSlot)
        ) {
          return {
            ...result,
            status: 'time_mismatch',
            expectedTimeSlot,
            matchedTimeSlot: matchedSlots[0],
            reason: 'time_slot_mismatch',
          };
        }

        return {
          ...result,
          expectedTimeSlot,
          matchedTimeSlot: matchedSlots[0] ?? result.matchedTimeSlot,
        };
      }
      return {
        applicationId: row.applicationId,
        status: 'missing',
        expectedApDate: row.appliedDate,
        appliedDate: row.appliedDate,
        expectedTimeSlot: row.meetingTimeSlot,
        matchCount: 0,
        matches: [],
        reason: 'not_found_in_latest_check',
      };
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

    const sbAdmin = createClient(supabaseUrl, supabaseService, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: actor, error: actorErr } = await sbAdmin
      .from('profiles')
      .select('user_id,display_name,role,is_admin')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (actorErr || !actor) {
      return NextResponse.json({ error: 'Failed to load actor profile' }, { status: 500 });
    }

    const actorProfile = actor as ActorProfile;
    const isAdmin = actorProfile.role === 'admin' || Boolean(actorProfile.is_admin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { rows?: CheckRow[] } | null;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ result: true, results: [] });
    }
    if (rows.length > 300) {
      return NextResponse.json({ error: '한 번에 최대 300건까지 확인할 수 있습니다.' }, { status: 413 });
    }

    const dataCenterUrl =
      env('DATA_CENTER_INTRACHECK_URL') ||
      'https://mega-info.re.kr/data_center/api/quota_intranet_check.php';
    const dataCenterToken =
      env('DATA_CENTER_INTRACHECK_TOKEN') || env('DATA_CENTER_CRON_TOKEN');
    if (!dataCenterToken) {
      return NextResponse.json({ error: 'Missing DATA_CENTER_INTRACHECK_TOKEN env var' }, { status: 500 });
    }

    const payloadRows = rows.map((row) => ({
      applicationId: String(row.applicationId ?? ''),
      appliedAt: String(row.appliedAt ?? ''),
      appliedDate: row.appliedDate || formatKstDate(String(row.appliedAt ?? '')),
      meetingTimeSlot: normalizeTimeSlot(row.meetingTimeSlot),
      leaderName: String(row.leaderName ?? '').trim(),
      regionName: String(row.regionName ?? '').trim(),
      companyName: String(row.companyName ?? '').trim(),
    }));

    const syncResults = await syncCastTomorrowForBaseDates(
      payloadRows.map((row) => row.appliedDate),
      dataCenterToken,
    );

    const targetUrl = new URL(dataCenterUrl);
    targetUrl.searchParams.set('t', dataCenterToken);
    const dataCenterConnectHost =
      env('DATA_CENTER_INTRACHECK_CONNECT_HOST') ||
      (targetUrl.hostname === 'mega-info.re.kr' ? '112.175.184.33' : '');
    const dataCenter = await postDataCenterJson(
      targetUrl,
      dataCenterToken,
      { rows: payloadRows },
      dataCenterConnectHost || undefined,
      targetUrl.hostname,
    );
    const json = dataCenter.json;
    if (!dataCenter.ok) {
      const message =
        typeof json === 'object' && json !== null && 'error' in json
          ? String((json as { error?: unknown }).error ?? '')
          : '';
      throw new Error(message || '인트라넷 등록 확인에 실패했습니다.');
    }

    const responsePayload = isRecord(json) ? json : { result: true };
    const normalizedResults = normalizeCheckResults(payloadRows, responsePayload);
    return NextResponse.json({ ...responsePayload, results: normalizedResults, syncResults });
  } catch (e: unknown) {
    console.error('[intranet-registration-check] failed:', e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
