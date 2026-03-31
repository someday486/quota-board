begin;

alter table public.support_center_calendar_events
  add column if not exists birthday_calendar_type text not null default 'solar';

alter table public.support_center_calendar_events
  add column if not exists birthday_is_intercalation boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_center_calendar_events_birthday_calendar_type_check'
  ) then
    alter table public.support_center_calendar_events
      add constraint support_center_calendar_events_birthday_calendar_type_check
      check (birthday_calendar_type in ('solar', 'lunar'));
  end if;
end
$$;

commit;
