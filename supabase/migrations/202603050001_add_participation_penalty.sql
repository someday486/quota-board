begin;

alter table public.profiles
  add column if not exists invalid_call_count integer not null default 0,
  add column if not exists participation_restricted_until timestamptz null,
  add column if not exists participation_restriction_note text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_invalid_call_count_non_negative'
  ) then
    alter table public.profiles
      add constraint profiles_invalid_call_count_non_negative
      check (invalid_call_count >= 0);
  end if;
end
$$;

comment on column public.profiles.invalid_call_count
  is '누적 무효콜 횟수';
comment on column public.profiles.participation_restricted_until
  is '참여 제한 종료 시각. 현재 시각보다 미래면 참여 제한 상태';
comment on column public.profiles.participation_restriction_note
  is '참여 제한 수동 사유/메모';

commit;
