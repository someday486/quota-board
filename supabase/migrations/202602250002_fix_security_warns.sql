-- Fix Supabase linter WARN findings:
-- 1) function_search_path_mutable
-- 2) permissive RLS policy on leave_requests

begin;

-- -----------------------------------------------------------------------------
-- 1) Functions: pin search_path for listed public functions
-- -----------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'promote_reserve_on_delete',
        'promote_reserve',
        'apply_live_region',
        'weekdays_between',
        'request_leave_admin',
        'apply_region_quota',
        'admin_set_replenish_mode',
        'leader_my_region_counts_today',
        'leader_my_applications_today',
        'leader_team_matrix_today',
        'leader_board_today',
        'admin_create_today_board',
        'admin_set_region_capacity',
        'admin_delete_application',
        'set_updated_at',
        'admin_list_applications_today'
      ])
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp',
      fn.signature
    );
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2) leave_requests: replace overly-permissive admin update policy
-- -----------------------------------------------------------------------------
drop policy if exists "admin update leave" on public.leave_requests;
drop policy if exists admin_update_leave on public.leave_requests;

create policy admin_update_leave
on public.leave_requests
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

commit;
