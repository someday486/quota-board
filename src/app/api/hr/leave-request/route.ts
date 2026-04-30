import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  countBusinessLeaveDays,
  getHolidayDateSetBetween,
  type HolidayOverrideRow,
  isWeekend,
} from '@/lib/leaveHolidays';

type LeaveType = 'annual' | 'half_am' | 'half_pm';

type ActorProfileRow = {
  user_id: string;
  role: string | null;
  is_admin: boolean | null;
};

type RequestBody = {
  user_id?: string | null;
  leave_type?: LeaveType;
  start_date?: string;
  end_date?: string;
  reason?: string | null;
};

function getBearerToken(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(authz);
  return m?.[1] ?? null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMissingHolidayOverridesTableError(error: { code?: string; message?: string }) {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.message?.includes('leave_holiday_overrides')
  );
}

async function loadActor(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    return { error: NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 }) };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const sbUser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error: authErr } = await sbUser.auth.getUser(token);
  if (authErr || !auth.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const sbAdmin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: actor, error: actorErr } = await sbAdmin
    .from('profiles')
    .select('user_id,role,is_admin')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (actorErr || !actor) {
    return { error: NextResponse.json({ error: 'Failed to load actor profile' }, { status: 500 }) };
  }

  return {
    actor: actor as ActorProfileRow,
    sbAdmin,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await loadActor(req);
    if ('error' in auth) return auth.error;

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    const leaveType = body?.leave_type;
    const startDate = body?.start_date;
    const endDate = body?.end_date;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : null;

    if (leaveType !== 'annual' && leaveType !== 'half_am' && leaveType !== 'half_pm') {
      return NextResponse.json({ error: 'leave_type is invalid' }, { status: 400 });
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json({ error: 'start_date and end_date are required in YYYY-MM-DD format' }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'end_date cannot be earlier than start_date' }, { status: 400 });
    }

    const targetUserId = typeof body?.user_id === 'string' && body.user_id.trim()
      ? body.user_id.trim()
      : auth.actor.user_id;
    const isAdmin = auth.actor.role === 'admin' || Boolean(auth.actor.is_admin);

    if (targetUserId !== auth.actor.user_id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: holidayOverrideRows, error: holidayOverrideErr } = await auth.sbAdmin
      .from('leave_holiday_overrides')
      .select('holiday_date,name,is_holiday')
      .gte('holiday_date', startDate)
      .lte('holiday_date', endDate)
      .order('holiday_date', { ascending: true });

    if (holidayOverrideErr && !isMissingHolidayOverridesTableError(holidayOverrideErr)) {
      return NextResponse.json({ error: holidayOverrideErr.message }, { status: 500 });
    }

    const holidayOverrides = isMissingHolidayOverridesTableError(holidayOverrideErr ?? {})
      ? []
      : ((holidayOverrideRows ?? []) as HolidayOverrideRow[]);
    const holidayDates = getHolidayDateSetBetween(startDate, endDate, holidayOverrides);

    let daysCount = 0;
    if (leaveType === 'half_am' || leaveType === 'half_pm') {
      if (startDate !== endDate) {
        return NextResponse.json({ error: 'Half-day leave must be requested for a single date' }, { status: 400 });
      }
      if (isWeekend(startDate) || holidayDates.has(startDate)) {
        return NextResponse.json({ error: 'Half-day leave cannot be requested on weekends or public holidays' }, { status: 400 });
      }
      daysCount = 0.5;
    } else {
      daysCount = countBusinessLeaveDays(startDate, endDate, holidayDates);
      if (daysCount <= 0) {
        return NextResponse.json({ error: 'There are no leave-countable business days in the selected period' }, { status: 400 });
      }
    }

    const { data: overlapRows, error: overlapErr } = await auth.sbAdmin
      .from('leave_requests')
      .select('id')
      .eq('user_id', targetUserId)
      .in('status', ['pending', 'approved'])
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .limit(1);

    if (overlapErr) {
      return NextResponse.json({ error: overlapErr.message }, { status: 500 });
    }
    if ((overlapRows ?? []).length > 0) {
      return NextResponse.json({ error: 'An overlapping leave request already exists' }, { status: 409 });
    }

    const leaveYear = Number(startDate.slice(0, 4));
    const { data: remainingDays, error: remainingErr } = await auth.sbAdmin.rpc('remaining_days', {
      p_uid: targetUserId,
      p_year: leaveYear,
    });

    if (remainingErr) {
      return NextResponse.json({ error: remainingErr.message }, { status: 500 });
    }
    if (Number(remainingDays ?? 0) < daysCount) {
      return NextResponse.json({ error: 'Not enough remaining leave balance' }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await auth.sbAdmin
      .from('leave_requests')
      .insert({
        user_id: targetUserId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        days_count: daysCount,
        reason,
        status: 'pending',
        approved_by: null,
        decided_at: null,
        reject_reason: null,
      })
      .select('id,user_id,leave_type,start_date,end_date,days_count,status,reason')
      .maybeSingle();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ row: inserted });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.error('[leave-request] failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
