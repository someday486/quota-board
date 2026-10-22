begin;

update public.support_center_calendar_events
set
  start_date = '1964-10-22'::date,
  end_date = '1964-10-22'::date,
  birthday_calendar_type = 'solar',
  birthday_is_intercalation = false,
  updated_at = timezone('utc', now())
where category = 'birthday'
  and coalesce(description, '') = '계정: mega4207@megainfo.co.kr';

commit;
