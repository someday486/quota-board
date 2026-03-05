begin;

drop policy if exists applications_live_insert_self_or_admin on public.applications_live;

create policy applications_live_insert_self_or_admin
on public.applications_live
for insert
to authenticated
with check (
  auth.uid() is not null
  and (
    exists (
      select 1
      from public.profiles a
      where a.user_id = auth.uid()
        and (a.role = 'admin' or coalesce(a.is_admin, false))
    )
    or (
      user_id = auth.uid()
      and not exists (
        select 1
        from public.profiles p
        where p.user_id = auth.uid()
          and p.participation_restricted_until is not null
          and p.participation_restricted_until > now()
      )
    )
  )
);

commit;
