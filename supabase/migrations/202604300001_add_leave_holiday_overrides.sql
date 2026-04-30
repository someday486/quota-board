begin;

create table if not exists public.leave_holiday_overrides (
  holiday_date date primary key,
  name text,
  is_holiday boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.leave_holiday_overrides enable row level security;

drop policy if exists leave_holiday_overrides_select_authenticated on public.leave_holiday_overrides;
create policy leave_holiday_overrides_select_authenticated
on public.leave_holiday_overrides
for select
to authenticated
using (true);

drop policy if exists leave_holiday_overrides_insert_admin on public.leave_holiday_overrides;
create policy leave_holiday_overrides_insert_admin
on public.leave_holiday_overrides
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

drop policy if exists leave_holiday_overrides_update_admin on public.leave_holiday_overrides;
create policy leave_holiday_overrides_update_admin
on public.leave_holiday_overrides
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

drop policy if exists leave_holiday_overrides_delete_admin on public.leave_holiday_overrides;
create policy leave_holiday_overrides_delete_admin
on public.leave_holiday_overrides
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

drop trigger if exists set_leave_holiday_overrides_updated_at on public.leave_holiday_overrides;
create trigger set_leave_holiday_overrides_updated_at
before update on public.leave_holiday_overrides
for each row
execute function public.set_updated_at();

commit;
