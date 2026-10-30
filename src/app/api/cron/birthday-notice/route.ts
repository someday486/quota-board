import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  BirthdayEvent,
  BirthdayNoticeGroup,
  BirthdayProfile,
  birthdayNoticeDatesForBusinessDay,
  birthdayNamesForDate,
  buildBirthdayMessage,
  seoulDate,
} from '@/lib/birthdayNotification';
import {
  HolidayOverrideRow,
  addDaysLocal,
  getHolidayDateSetBetween,
} from '@/lib/leaveHolidays';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationSetting = {
  value_json: unknown;
};

type PreviousNotification = {
  date?: unknown;
  covered_through?: unknown;
};

const LAST_SENT_SETTING_KEY = 'birthday_notice_last_sent';

function isMissingHolidayOverridesTableError(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return /42P01|PGRST/i.test(text) && /leave_holiday_overrides|does not exist|schema cache/i.test(text);
}

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
}

async function sendTeamroomMessage(webhookUrl: string, content: string) {
  const body = new URLSearchParams({ content });
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`NateOn Teamroom webhook failed with status ${response.status}`);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookUrl = process.env.NATEON_TEAMROOM_WEBHOOK_URL;
  if (!supabaseUrl || !serviceRoleKey || !webhookUrl) {
    return NextResponse.json({ error: 'Missing server environment variables' }, { status: 500 });
  }

  try {
    const today = seoulDate();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const holidayRangeEnd = addDaysLocal(today, 31);
    const [previousResult, overridesResult] = await Promise.all([
      supabase
        .from('app_settings')
        .select('value_json')
        .eq('key', LAST_SENT_SETTING_KEY)
        .maybeSingle(),
      supabase
        .from('leave_holiday_overrides')
        .select('holiday_date,name,is_holiday')
        .gte('holiday_date', today)
        .lte('holiday_date', holidayRangeEnd),
    ]);

    const { data: previous, error: previousError } = previousResult;
    if (previousError) throw new Error(previousError.message);
    if (overridesResult.error && !isMissingHolidayOverridesTableError(overridesResult.error)) {
      throw new Error(overridesResult.error.message);
    }

    const overrides = overridesResult.error
      ? []
      : ((overridesResult.data ?? []) as HolidayOverrideRow[]);
    const holidayDates = getHolidayDateSetBetween(today, holidayRangeEnd, overrides);
    const noticeDates = birthdayNoticeDatesForBusinessDay(today, holidayDates);
    if (noticeDates.length === 0) {
      return NextResponse.json({ ok: true, status: 'non_business_day', date: today });
    }

    const previousValue = (previous as NotificationSetting | null)?.value_json;
    const previousNotice = previousValue && typeof previousValue === 'object'
      ? previousValue as PreviousNotification
      : null;
    const previousDate = previousNotice?.date ? String(previousNotice.date) : null;
    const coveredThrough = previousDate === today
      ? String(previousNotice?.covered_through ?? today)
      : null;
    const pendingDates = coveredThrough
      ? noticeDates.filter((date) => date > coveredThrough)
      : noticeDates;
    if (pendingDates.length === 0) {
      return NextResponse.json({ ok: true, status: 'already_sent', date: today });
    }

    const [eventsResult, profilesResult] = await Promise.all([
      supabase
        .from('support_center_calendar_events')
        .select('id,title,start_date,description,recurs_annually,birthday_calendar_type,birthday_is_intercalation')
        .eq('category', 'birthday'),
      supabase.from('profiles').select('email,display_name,resigned_at'),
    ]);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const events = (eventsResult.data ?? []) as BirthdayEvent[];
    const profiles = (profilesResult.data ?? []) as BirthdayProfile[];
    const groups = pendingDates.reduce<BirthdayNoticeGroup[]>((rows, date) => {
      const names = birthdayNamesForDate(events, profiles, date);
      if (names.length > 0) rows.push({ date, names });
      return rows;
    }, []);
    if (groups.length === 0) {
      return NextResponse.json({ ok: true, status: 'no_birthdays', date: today, checkedThrough: pendingDates.at(-1) });
    }

    const content = buildBirthdayMessage(groups, today);
    await sendTeamroomMessage(webhookUrl, content);

    const recipientCount = groups.reduce((count, group) => count + group.names.length, 0);
    const { error: logError } = await supabase.from('app_settings').upsert(
      {
        key: LAST_SENT_SETTING_KEY,
        value_json: {
          date: today,
          covered_through: noticeDates.at(-1),
          recipient_count: recipientCount,
          sent_at: new Date().toISOString(),
        },
      },
      { onConflict: 'key' },
    );
    if (logError) throw new Error(logError.message);

    return NextResponse.json({
      ok: true,
      status: 'sent',
      date: today,
      coveredThrough: noticeDates.at(-1),
      recipients: recipientCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown birthday notification error';
    console.error('[birthday-notice]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
