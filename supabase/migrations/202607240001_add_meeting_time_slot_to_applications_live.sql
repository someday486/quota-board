begin;

alter table public.applications_live
  add column if not exists meeting_time_slot text null;

alter table public.applications_live
  drop constraint if exists applications_live_meeting_time_slot_check;

alter table public.applications_live
  add constraint applications_live_meeting_time_slot_check
  check (
    meeting_time_slot is null
    or meeting_time_slot in ('am', 'pm')
  );

comment on column public.applications_live.meeting_time_slot
  is 'Requested meeting time slot from team leader applications: am or pm.';

create index if not exists applications_live_meeting_time_slot_idx
  on public.applications_live (meeting_time_slot);

commit;
