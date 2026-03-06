import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type LeaveType = 'annual' | 'half_am' | 'half_pm';

type WeeklyViewRow = {
  id: string;
  user_id: string;
  display_name: string;
  leave_type: LeaveType;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  created_at: string; // timestamptz
  iso_year: number;
  iso_week: number;
};

type AuthProfileRow = {
  role: string | null;
  is_admin: boolean | null;
};

type EmailProfileRow = {
  user_id: string;
  email: string | null;
};

function parseWeekKey(weekKey: string) {
  // "2026-W06"
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return null;
  return { iso_year: Number(m[1]), iso_week: Number(m[2]) };
}

function ymdKSTFromIso(iso: string) {
  // created_at(timestamptz) -> KST YYYY-MM-DD
  const d = new Date(iso);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
}

function csvEscape(v: unknown) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function getBearerToken(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(authz);
  return m?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anon) {
      return NextResponse.json(
        { error: 'Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 }
      );
    }
    if (!service) {
      return NextResponse.json({ error: 'Missing env: SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }

    // 1) week 파라미터
    const { searchParams } = new URL(req.url);
    const weekKey = searchParams.get('week') || '';
    const parsed = parseWeekKey(weekKey);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid week param. Use YYYY-WNN (e.g., 2026-W06)' },
        { status: 400 }
      );
    }
    const { iso_year, iso_week } = parsed;

    // 2) Authorization: Bearer <token> 기반 로그인 확인
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized', detail: 'Missing Authorization: Bearer token' },
        { status: 401 }
      );
    }

    const sbUser = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // ✅ 핵심: 토큰으로 유저 검증
    const { data: auth, error: authErr } = await sbUser.auth.getUser(token);
    if (authErr || !auth.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', detail: authErr?.message ?? 'Invalid token' },
        { status: 401 }
      );
    }

    const uid = auth.user.id;

    // 3) 관리자(role=admin) 체크는 service role로 (RLS 영향 X)
    const sbAdmin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: me, error: meErr } = await sbAdmin
      .from('profiles')
      .select('role,is_admin')
      .eq('user_id', uid)
      .single();

    if (meErr) {
      console.error(meErr);
      return NextResponse.json({ error: 'Failed to read profile(role)' }, { status: 500 });
    }
    const profile = me as AuthProfileRow | null;
    if (profile?.role !== 'admin' && !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4) 주간 데이터 조회 (service role)
    const { data: weekly, error: wErr } = await sbAdmin
      .from('v_leave_weekly_admin')
      .select('id,user_id,display_name,leave_type,start_date,end_date,created_at,iso_year,iso_week')
      .eq('iso_year', iso_year)
      .eq('iso_week', iso_week)
      .order('display_name', { ascending: true });

    if (wErr) {
      console.error(wErr);
      return NextResponse.json({ error: 'Failed to fetch weekly rows' }, { status: 500 });
    }

    const weeklyRows = (weekly ?? []) as WeeklyViewRow[];

    // 5) 프로필 email 조회 (service role)
    const header = 'name,email,leave_type,start_date,end_date,submitted_at\n';
    if (weeklyRows.length === 0) {
      const bom = '\ufeff';
      return new NextResponse(bom + header, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="weekly_leave_${weekKey}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const userIds = Array.from(new Set(weeklyRows.map((r) => r.user_id)));

    const { data: profs, error: pErr } = await sbAdmin
      .from('profiles')
      .select('user_id,email')
      .in('user_id', userIds);

    if (pErr) {
      console.error(pErr);
      return NextResponse.json({ error: 'Failed to fetch profiles(email)' }, { status: 500 });
    }

    const emailMap = new Map<string, string>(
      ((profs ?? []) as EmailProfileRow[]).map((p) => [p.user_id, p.email ?? '']),
    );

    // 6) CSV 생성
    const lines: string[] = [];
    lines.push('name,email,leave_type,start_date,end_date,submitted_at');

    for (const r of weeklyRows) {
      const name = r.display_name ?? '';
      const email = emailMap.get(r.user_id) ?? '';
      const submitted_at = ymdKSTFromIso(r.created_at);

      lines.push(
        [
          csvEscape(name),
          csvEscape(email),
          csvEscape(r.leave_type),
          csvEscape(r.start_date),
          csvEscape(r.end_date),
          csvEscape(submitted_at),
        ].join(',')
      );
    }

    const csv = lines.join('\n') + '\n';
    const bom = '\ufeff'; // 엑셀 한글 깨짐 방지

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="weekly_leave_${weekKey}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown error' },
      { status: 500 },
    );
  }
}
