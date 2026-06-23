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
  leaderName: string;
  regionName: string;
  companyName: string;
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
      leaderName: String(row.leaderName ?? '').trim(),
      regionName: String(row.regionName ?? '').trim(),
      companyName: String(row.companyName ?? '').trim(),
    }));

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

    return NextResponse.json(json);
  } catch (e: unknown) {
    console.error('[intranet-registration-check] failed:', e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
