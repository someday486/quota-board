begin;

create or replace function public.apply_live_region_v2(
  p_region_id uuid,
  p_company_name text,
  p_meeting_time_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_leader text;
  v_company_name text;
  v_total integer := 0;
  v_count integer := 0;
  v_application_id uuid;
  v_created_at timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('status', 'NOT_LOGGED_IN');
  end if;

  v_company_name := btrim(coalesce(p_company_name, ''));
  if v_company_name = '' then
    return jsonb_build_object('status', 'NO_COMPANY_NAME');
  end if;

  if p_meeting_time_slot is null or p_meeting_time_slot not in ('am', 'pm') then
    return jsonb_build_object('status', 'INVALID_TIME_SLOT');
  end if;

  select btrim(coalesce(display_name, ''))
    into v_leader
  from public.profiles
  where user_id = v_uid;

  if v_leader is null or v_leader = '' then
    return jsonb_build_object('status', 'NO_NAME');
  end if;

  -- Serialize applications per region so simultaneous submissions cannot exceed capacity.
  perform pg_advisory_xact_lock(hashtextextended(p_region_id::text, 0));

  select coalesce((
    select capacity_total
    from public.region_totals
    where region_id = p_region_id
  ), 0)
    into v_total;

  select count(*)::integer
    into v_count
  from public.applications_live
  where region_id = p_region_id
    and coalesce(is_excluded, false) = false
    and coalesce(is_reserve, false) = false;

  if v_count >= v_total then
    return jsonb_build_object(
      'status', 'CLOSED',
      'region_id', p_region_id,
      'capacity_total', v_total,
      'applied_count', v_count,
      'capacity_remaining', greatest(v_total - v_count, 0),
      'is_closed', true
    );
  end if;

  insert into public.applications_live (
    region_id,
    user_id,
    leader_name,
    company_name,
    meeting_time_slot,
    is_excluded,
    is_reserve
  )
  values (
    p_region_id,
    v_uid,
    v_leader,
    v_company_name,
    p_meeting_time_slot,
    false,
    false
  )
  returning id, created_at
    into v_application_id, v_created_at;

  v_count := v_count + 1;

  return jsonb_build_object(
    'status', 'SUCCESS',
    'application_id', v_application_id,
    'created_at', v_created_at,
    'region_id', p_region_id,
    'leader_name', v_leader,
    'company_name', v_company_name,
    'meeting_time_slot', p_meeting_time_slot,
    'capacity_total', v_total,
    'applied_count', v_count,
    'capacity_remaining', greatest(v_total - v_count, 0),
    'is_closed', v_count >= v_total
  );
end;
$$;

revoke all on function public.apply_live_region_v2(uuid, text, text) from public;
revoke all on function public.apply_live_region_v2(uuid, text, text) from anon;
grant execute on function public.apply_live_region_v2(uuid, text, text) to authenticated;

comment on function public.apply_live_region_v2(uuid, text, text)
  is 'Atomically creates a live application with its meeting time slot and returns the created row metadata.';

create or replace function public.get_leader_dashboard_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_profile jsonb;
  v_today_start timestamptz;
  v_today_end timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('status', 'NOT_LOGGED_IN');
  end if;

  select jsonb_build_object(
    'user_id', p.user_id,
    'display_name', p.display_name,
    'role', p.role,
    'is_admin', p.is_admin,
    'leader_group', p.leader_group,
    'invalid_call_count', p.invalid_call_count,
    'participation_restricted_until', p.participation_restricted_until,
    'participation_restriction_note', p.participation_restriction_note
  )
    into v_profile
  from public.profiles p
  where p.user_id = v_uid;

  if v_profile is null then
    return jsonb_build_object('status', 'NO_PROFILE');
  end if;

  v_today_start := ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');
  v_today_end := v_today_start + interval '1 day';

  return jsonb_build_object(
    'status', 'SUCCESS',
    'profile', v_profile,
    'regions', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.sort_order, r.region_name)
      from (
        select id, region_name, sort_order
        from public.regions
        where is_active = true
      ) r
    ), '[]'::jsonb),
    'region_status', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.sort_order, s.region_name)
      from (
        select
          region_id,
          region_name,
          sort_order,
          capacity_total,
          applied_count,
          capacity_remaining,
          is_closed
        from public.region_status_view
      ) s
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', a.key,
        'value_int', a.value_int,
        'value_json', a.value_json
      ) order by a.key)
      from public.app_settings a
      where a.key = any (array[
        'apply_limit_per_user_per_day',
        'apply_limit_exempt_user_ids',
        'active_leader_group'
      ])
    ), '[]'::jsonb),
    'my_applications', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select
          id,
          created_at,
          region_id,
          leader_name,
          company_name,
          meeting_time_slot,
          is_reserve,
          is_excluded
        from public.applications_live
        where user_id = v_uid
        order by created_at desc
        limit 100
      ) a
    ), '[]'::jsonb),
    'my_today_count', (
      select count(*)::integer
      from public.applications_live
      where user_id = v_uid
        and created_at >= v_today_start
        and created_at < v_today_end
    )
  );
end;
$$;

revoke all on function public.get_leader_dashboard_bootstrap() from public;
revoke all on function public.get_leader_dashboard_bootstrap() from anon;
grant execute on function public.get_leader_dashboard_bootstrap() to authenticated;

comment on function public.get_leader_dashboard_bootstrap()
  is 'Returns the authenticated leader dashboard initial state in one request.';

commit;
