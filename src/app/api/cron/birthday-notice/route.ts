import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  BirthdayEvent,
  BirthdayProfile,
  birthdayNamesForDate,
  buildBirthdayMessage,
  seoulDate,
} from '@/lib/birthdayNotification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationSetting = {
  value_json: unknown;
};

const LAST_SENT_SETTING_KEY = 'birthday_notice_last_sent';

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

    const { data: previous, error: previousError } = await supabase
      .from('app_settings')
      .select('value_json')
      .eq('key', LAST_SENT_SETTING_KEY)
      .maybeSingle();
    if (previousError) throw new Error(previousError.message);
    const previousValue = (previous as NotificationSetting | null)?.value_json;
    const previousDate = previousValue && typeof previousValue === 'object' && 'date' in previousValue
      ? String(previousValue.date)
      : null;
    if (previousDate === today) {
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

    const names = birthdayNamesForDate(
      (eventsResult.data ?? []) as BirthdayEvent[],
      (profilesResult.data ?? []) as BirthdayProfile[],
      today,
    );
    if (names.length === 0) {
      return NextResponse.json({ ok: true, status: 'no_birthdays', date: today });
    }

    const content = buildBirthdayMessage(names);
    await sendTeamroomMessage(webhookUrl, content);

    const { error: logError } = await supabase.from('app_settings').upsert(
      {
        key: LAST_SENT_SETTING_KEY,
        value_json: { date: today, recipient_count: names.length, sent_at: new Date().toISOString() },
      },
      { onConflict: 'key' },
    );
    if (logError) throw new Error(logError.message);

    return NextResponse.json({ ok: true, status: 'sent', date: today, recipients: names.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown birthday notification error';
    console.error('[birthday-notice]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
