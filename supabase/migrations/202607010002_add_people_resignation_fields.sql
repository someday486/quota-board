begin;

alter table public.profiles
  add column if not exists resigned_at date null,
  add column if not exists resignation_note text null;

comment on column public.profiles.resigned_at
  is 'Resignation date used by admin people management.';

comment on column public.profiles.resignation_note
  is 'Optional resignation memo used by admin people management.';

create index if not exists profiles_resigned_at_idx
  on public.profiles (resigned_at);

commit;
