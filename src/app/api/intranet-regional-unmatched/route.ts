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

type QuotaApplyRow = {
  id: string;
  created_at: string;
  leader_name: string | null;
  company_name: string | null;
  is_reserve: boolean | null;
  is_excluded: boolean | null;
};

type IntranetRegionalRow = {
  id?: string;
  companyName?: string;
  apDate?: string;
  apTime?: string;
  castDate?: string;
  castMember?: string;
  pmName?: string;
  region1?: string;
  region2?: string;
  address?: string;
  dbRoute?: string;
  dbState?: string;
  contractCheck?: string;
  businessNumber?: string;
};

type DataCenterRegionalResponse = {
  result?: boolean;
  baseDate?: string;
  targetDate?: string;
  count?: number;
  rows?: IntranetRegionalRow[];
  error?: string;
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

type DataCenterResult = {
  ok: boolean;
  status: number;
  json: unknown;
};

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

function formatKstDate(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
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

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return formatKstDate(d);
}

function kstDayRangeIso(date: string) {
  const start = new Date(`${date}T00:00:00+09:00`);
  const endDate = addDays(date, 1);
  const end = new Date(`${endDate}T00:00:00+09:00`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function requestDataCenterJson(
  url: URL,
  token: string,
  connectHost?: string,
  hostHeader?: string,
) {
  const isHttps = url.protocol === 'https:';
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const effectiveHost = connectHost || url.hostname;
  const effectiveHostHeader = hostHeader || url.hostname;
  const options = {
    method: 'GET',
    hostname: effectiveHost,
    port: url.port ? Number(url.port) : isHttps ? 443 : 80,
    path: `${url.pathname}${url.search}`,
    headers: {
      host: effectiveHostHeader,
      authorization: `Bearer ${token}`,
    },
    servername: isHttps ? effectiveHostHeader : undefined,
    timeout: 30000,
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
    req.end();
  });
}

async function syncCastTomorrowForBaseDate(baseDate: string, token: string) {
  const syncUrl =
    env('DATA_CENTER_CAST_TOMORROW_SYNC_URL') ||
    'https://mega-info.re.kr/data_center/api/quota_cast_tomorrow_sync.php';
  const targetUrl = new URL(syncUrl);
  targetUrl.searchParams.set('t', token);
  targetUrl.searchParams.set('baseDate', baseDate);

  const dataCenterConnectHost =
    env('DATA_CENTER_INTRACHECK_CONNECT_HOST') ||
    (targetUrl.hostname === 'mega-info.re.kr' ? '112.175.184.33' : '');

  const dataCenter = await requestDataCenterJson(
    targetUrl,
    token,
    dataCenterConnectHost || undefined,
    targetUrl.hostname,
  );
  const json = dataCenter.json as DataCenterSyncResponse;
  if (!dataCenter.ok || json?.result === false) {
    throw new Error(json?.error || '데이터센터 추가DB등록에 실패했습니다.');
  }
  return json;
}

function decodeText(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeCompany(value: unknown) {
  let text = decodeText(String(value ?? '')).trim().toLowerCase();
  text = text.replace(/㈜|\(\s*주\s*\)|（\s*주\s*）|\[\s*주\s*\]|【\s*주\s*】/gu, '');
  text = text.replace(/\(유\)|（유）|유한회사|주식회사|농업회사법인|어업회사법인|사회적협동조합|협동조합/gu, '');
  text = text.replace(/[\s\p{P}\p{S}]+/gu, '');
  return text;
}

function normalizePerson(value: unknown) {
  let text = decodeText(String(value ?? '')).trim();
  text = text.replace(/\s+/gu, '');
  text = text.replace(/[-_]\d+$/gu, '');
  text = text.replace(/\(\d+\)$/gu, '');
  text = text.replace(/[^\p{L}\p{N}]+/gu, '');
  return text.toLowerCase();
}

function canonicalPerson(value: unknown) {
  const name = normalizePerson(value);
  const aliases: Record<string, string> = {
    이국주: '박태하',
  };
  return aliases[name] ?? name;
}

function personMatches(left: unknown, right: unknown) {
  const a = canonicalPerson(left);
  const b = canonicalPerson(right);
  return a !== '' && b !== '' && a === b;
}

function findQuotaMatch(row: IntranetRegionalRow, quotaRows: QuotaApplyRow[]) {
  const companyKey = normalizeCompany(row.companyName);
  const candidates = quotaRows.filter((item) => normalizeCompany(item.company_name) === companyKey);
  if (candidates.length === 0) {
    return { matched: false, reason: 'company_not_found', candidates };
  }
  if (candidates.length === 1) {
    return { matched: true, reason: 'company_match', candidates };
  }
  const named = candidates.filter((item) => personMatches(item.leader_name, row.castMember));
  if (named.length > 0) {
    return { matched: true, reason: 'company_cast_match', candidates: named };
  }
  return { matched: false, reason: 'company_duplicate_person_mismatch', candidates };
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

    const body = (await req.json().catch(() => null)) as { baseDate?: string; targetDate?: string } | null;
    const baseDate = isDateString(String(body?.baseDate ?? ''))
      ? String(body?.baseDate)
      : formatKstDate(new Date());
    const targetDate = isDateString(String(body?.targetDate ?? '')) ? String(body?.targetDate) : '';

    const dataCenterUrl =
      env('DATA_CENTER_REGIONAL_AP_URL') ||
      'https://mega-info.re.kr/data_center/api/quota_regional_ap_list.php';
    const dataCenterToken =
      env('DATA_CENTER_INTRACHECK_TOKEN') || env('DATA_CENTER_CRON_TOKEN');
    if (!dataCenterToken) {
      return NextResponse.json({ error: 'Missing DATA_CENTER_INTRACHECK_TOKEN env var' }, { status: 500 });
    }

    const targetUrl = new URL(dataCenterUrl);
    targetUrl.searchParams.set('t', dataCenterToken);
    targetUrl.searchParams.set('baseDate', baseDate);
    if (targetDate) targetUrl.searchParams.set('targetDate', targetDate);

    const dataCenterConnectHost =
      env('DATA_CENTER_INTRACHECK_CONNECT_HOST') ||
      (targetUrl.hostname === 'mega-info.re.kr' ? '112.175.184.33' : '');

    const { startIso, endIso } = kstDayRangeIso(baseDate);
    const quotaQuery = sbAdmin
      .from('applications_live')
      .select('id,created_at,leader_name,company_name,is_reserve,is_excluded')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .limit(5000);

    const syncResult = await syncCastTomorrowForBaseDate(baseDate, dataCenterToken);

    const [quotaResult, dataCenter] = await Promise.all([
      quotaQuery,
      requestDataCenterJson(
        targetUrl,
        dataCenterToken,
        dataCenterConnectHost || undefined,
        targetUrl.hostname,
      ),
    ]);

    if (quotaResult.error) {
      throw new Error(quotaResult.error.message);
    }

    const json = dataCenter.json as DataCenterRegionalResponse;
    if (!dataCenter.ok || json?.result === false) {
      throw new Error(json?.error || '인트라넷 지방 목록 조회에 실패했습니다.');
    }

    const quotaRows = (quotaResult.data ?? []) as QuotaApplyRow[];
    const intranetRows = Array.isArray(json.rows) ? json.rows : [];
    const unmatched = intranetRows.flatMap((row) => {
      const match = findQuotaMatch(row, quotaRows);
      if (match.matched) return [];
      return [{
        ...row,
        missingReason: match.reason,
        quotaCandidates: match.candidates.slice(0, 5).map((candidate) => ({
          id: candidate.id,
          leaderName: candidate.leader_name ?? '',
          companyName: candidate.company_name ?? '',
          isReserve: Boolean(candidate.is_reserve),
          isExcluded: Boolean(candidate.is_excluded),
        })),
      }];
    });

    return NextResponse.json({
      result: true,
      baseDate,
      targetDate: json.targetDate ?? targetDate,
      quotaCount: quotaRows.length,
      intranetRegionalCount: intranetRows.length,
      unmatchedCount: unmatched.length,
      syncResult,
      rows: unmatched,
    });
  } catch (e: unknown) {
    console.error('[intranet-regional-unmatched] failed:', e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
