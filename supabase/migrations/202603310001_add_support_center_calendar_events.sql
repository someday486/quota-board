begin;

create table if not exists public.support_center_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('birthday', 'award', 'dinner', 'meeting', 'notice')),
  start_date date not null,
  end_date date not null,
  description text,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint support_center_calendar_events_date_order check (end_date >= start_date)
);

create index if not exists support_center_calendar_events_date_idx
  on public.support_center_calendar_events (start_date, end_date);

alter table public.support_center_calendar_events enable row level security;

drop policy if exists support_center_calendar_events_select_authenticated on public.support_center_calendar_events;
create policy support_center_calendar_events_select_authenticated
on public.support_center_calendar_events
for select
to authenticated
using (true);

drop policy if exists support_center_calendar_events_insert_admin on public.support_center_calendar_events;
create policy support_center_calendar_events_insert_admin
on public.support_center_calendar_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or coalesce(p.is_admin, false))
  )
);

drop policy if exists support_center_calendar_events_update_admin on public.support_center_calendar_events;
create policy support_center_calendar_events_update_admin
on public.support_center_calendar_events
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or coalesce(p.is_admin, false))
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or coalesce(p.is_admin, false))
  )
);

drop policy if exists support_center_calendar_events_delete_admin on public.support_center_calendar_events;
create policy support_center_calendar_events_delete_admin
on public.support_center_calendar_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or coalesce(p.is_admin, false))
  )
);

drop trigger if exists set_support_center_calendar_events_updated_at on public.support_center_calendar_events;
create trigger set_support_center_calendar_events_updated_at
before update on public.support_center_calendar_events
for each row
execute function public.set_updated_at();

commit;
