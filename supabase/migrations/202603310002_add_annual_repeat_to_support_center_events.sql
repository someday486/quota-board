begin;

alter table public.support_center_calendar_events
  add column if not exists recurs_annually boolean not null default false;

commit;
