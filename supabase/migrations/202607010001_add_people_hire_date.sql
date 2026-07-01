begin;

alter table public.profiles
  add column if not exists hire_date date null;

comment on column public.profiles.hire_date
  is 'Hire date used by leave balance and admin people management.';

commit;
