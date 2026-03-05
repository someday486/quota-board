-- Fix Supabase linter findings:
-- 1) SECURITY DEFINER views in public schema
-- 2) RLS disabled on public tables
--
-- This migration is designed to preserve current app behavior while enabling RLS.

begin;

-- -----------------------------------------------------------------------------
-- 1) Views: switch to SECURITY INVOKER
-- -----------------------------------------------------------------------------
alter view public.admin_applications_today_view set (security_invoker = true);
alter view public.leader_my_region_counts_today_view set (security_invoker = true);
alter view public.region_quotas_view_v2 set (security_invoker = true);
alter view public.v_leave_weekly_admin set (security_invoker = true);
alter view public.region_quotas_view set (security_invoker = true);
alter view public.region_status_view set (security_invoker = true);
alter view public.admin_applications_view set (security_invoker = true);

-- -----------------------------------------------------------------------------
-- 2) Tables: enable RLS
-- -----------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.region_totals enable row level security;
alter table public.applications_live enable row level security;

-- -----------------------------------------------------------------------------
-- 3) app_settings policies
-- - Read: authenticated users can read only common app keys; admin can read all.
-- - Write: admin only.
-- -----------------------------------------------------------------------------
drop policy if exists app_settings_read_common_or_admin on public.app_settings;
create policy app_settings_read_common_or_admin
on public.app_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or coalesce(p.is_admin, false))
  )
  or key = any (array[
    'apply_limit_per_user_per_day',
    'apply_limit_exempt_user_ids',
    'active_leader_group'
  ])
);

drop policy if exists app_settings_insert_admin on public.app_settings;
create policy app_settings_insert_admin
on public.app_settings
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

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin
on public.app_settings
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

drop policy if exists app_settings_delete_admin on public.app_settings;
create policy app_settings_delete_admin
on public.app_settings
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

-- -----------------------------------------------------------------------------
-- 4) region_totals policies
-- - Read: any authenticated user.
-- - Write: admin only.
-- -----------------------------------------------------------------------------
drop policy if exists region_totals_select_authenticated on public.region_totals;
create policy region_totals_select_authenticated
on public.region_totals
for select
to authenticated
using (true);

drop policy if exists region_totals_insert_admin on public.region_totals;
create policy region_totals_insert_admin
on public.region_totals
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

drop policy if exists region_totals_update_admin on public.region_totals;
create policy region_totals_update_admin
on public.region_totals
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

drop policy if exists region_totals_delete_admin on public.region_totals;
create policy region_totals_delete_admin
on public.region_totals
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

-- -----------------------------------------------------------------------------
-- 5) applications_live policies
-- - Read: any authenticated user (keeps region status aggregates working).
-- - Insert: own row or admin.
-- - Update/Delete: admin only.
-- -----------------------------------------------------------------------------
drop policy if exists applications_live_select_authenticated on public.applications_live;
create policy applications_live_select_authenticated
on public.applications_live
for select
to authenticated
using (true);

drop policy if exists applications_live_insert_self_or_admin on public.applications_live;
create policy applications_live_insert_self_or_admin
on public.applications_live
for insert
to authenticated
with check (
  auth.uid() is not null
  and (
    user_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and (p.role = 'admin' or coalesce(p.is_admin, false))
    )
  )
);

drop policy if exists applications_live_update_admin on public.applications_live;
create policy applications_live_update_admin
on public.applications_live
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

drop policy if exists applications_live_delete_admin on public.applications_live;
create policy applications_live_delete_admin
on public.applications_live
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

commit;
