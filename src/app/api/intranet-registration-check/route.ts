import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const res = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${dataCenterToken}`,
      },
      body: JSON.stringify({ rows: payloadRows }),
      cache: 'no-store',
    });

    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
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
