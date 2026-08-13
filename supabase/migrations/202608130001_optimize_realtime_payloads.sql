begin;

alter table if exists public.applications_live replica identity full;
alter table if exists public.region_totals replica identity full;
alter table if exists public.regions replica identity full;
alter table if exists public.profiles replica identity full;
alter table if exists public.app_settings replica identity full;

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach table_name in array array[
    'applications_live',
    'region_totals',
    'regions',
    'profiles',
    'app_settings'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then
        null;
      when undefined_table then
        null;
    end;
  end loop;
end
$$;

comment on table public.applications_live
  is 'Live support applications. Realtime replica identity is full so clients can patch state from UPDATE/DELETE payloads without full reloads.';

commit;
