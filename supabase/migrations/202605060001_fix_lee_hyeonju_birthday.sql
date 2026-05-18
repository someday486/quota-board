begin;

update public.support_center_calendar_events
set
  start_date = '1982-12-07'::date,
  end_date = '1982-12-07'::date,
  updated_at = timezone('utc', now())
where category = 'birthday'
  and coalesce(description, '') = '계정: mega3582@megainfo.co.kr';

commit;
