alter table if exists public.applications_live
  add column if not exists reviewed boolean not null default false,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

update public.applications_live as a
set
  reviewed = coalesce(c.reviewed, false),
  reviewed_at = c.reviewed_at,
  reviewed_by = c.reviewed_by
from public.call_recordings as c
where c.application_id = a.id
  and (
    a.reviewed is distinct from coalesce(c.reviewed, false)
    or a.reviewed_at is distinct from c.reviewed_at
    or a.reviewed_by is distinct from c.reviewed_by
  );
