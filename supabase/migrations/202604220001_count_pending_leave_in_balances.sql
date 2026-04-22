begin;

create or replace function public.used_days(p_uid uuid, p_year integer)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(lr.days_count), 0)::numeric
  from public.leave_requests as lr
  where lr.user_id = p_uid
    and lr.status in ('pending', 'approved')
    and lr.start_date >= make_date(p_year, 1, 1)
    and lr.start_date < make_date(p_year + 1, 1, 1)
$$;

create or replace function public.remaining_days(p_uid uuid, p_year integer)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select public.earned_days(p_uid, p_year) - public.used_days(p_uid, p_year)
$$;

create or replace view public.v_leave_balance_admin_this_year
with (security_invoker = true)
as
with yearly_usage as (
  select
    lr.user_id,
    coalesce(sum(lr.days_count), 0)::numeric as used_days
  from public.leave_requests as lr
  where lr.status in ('pending', 'approved')
    and lr.start_date >= date_trunc('year', current_date)::date
    and lr.start_date < (date_trunc('year', current_date) + interval '1 year')::date
  group by lr.user_id
),
balances as (
  select
    p.user_id,
    p.display_name,
    p.role,
    case
      when p.hire_date is not null
        and p.hire_date >= date_trunc('year', current_date)::date
        and p.hire_date < (date_trunc('year', current_date) + interval '1 year')::date
        then greatest(0, 12 - extract(month from p.hire_date)::int)
      else 12
    end::numeric as earned_days,
    coalesce(yu.used_days, 0)::numeric as used_days
  from public.profiles as p
  left join yearly_usage as yu on yu.user_id = p.user_id
  where p.role = 'leader'
)
select
  user_id,
  display_name,
  role,
  earned_days,
  used_days,
  earned_days - used_days as remaining_days
from balances;

create or replace view public.v_my_leave_balance_this_year
with (security_invoker = true)
as
select
  user_id,
  earned_days,
  used_days,
  remaining_days
from public.v_leave_balance_admin_this_year
where user_id = auth.uid();

commit;
