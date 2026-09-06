-- TFRO-MIS secure access and accountability hardening.
-- Audit events are append-only. The database, rather than browser-supplied
-- values, owns actor identity and timestamps. Administrators may archive an
-- event, but nobody using the Data API may alter or delete its evidence.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.audit_logs enable row level security;

drop policy if exists "Users can insert audit logs" on public.audit_logs;
drop policy if exists "Allow authenticated insert into audit_logs" on public.audit_logs;
drop policy if exists "Users insert their own audit logs" on public.audit_logs;
drop policy if exists "Authenticated users create attributable audit events" on public.audit_logs;
create policy "Authenticated users create attributable audit events"
on public.audit_logs for insert to authenticated
with check (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'staff', 'operator', 'traffic_enforcer')
  )
);

-- Replace broad audit mutation policies with one-way archival only.
drop policy if exists "Allow admins delete audit_logs" on public.audit_logs;
revoke delete on table public.audit_logs from anon, authenticated;

drop policy if exists "Allow admins update audit_logs" on public.audit_logs;
drop policy if exists "Administrators archive audit events" on public.audit_logs;
create policy "Administrators archive audit events"
on public.audit_logs for update to authenticated
using (
  is_archived = false
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
)
with check (
  is_archived = true
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
);

create or replace function private.protect_audit_log_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_jsonb(new) - 'is_archived' is distinct from to_jsonb(old) - 'is_archived' then
    raise exception 'Audit evidence is immutable; only archival is permitted.' using errcode = '42501';
  end if;
  if old.is_archived or not new.is_archived then
    raise exception 'Audit archival is one-way.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_audit_log_evidence() from public, anon, authenticated;
drop trigger if exists protect_audit_log_evidence on public.audit_logs;
create trigger protect_audit_log_evidence
before update on public.audit_logs
for each row execute function private.protect_audit_log_evidence();

-- Notifications are trusted system output. Existing SECURITY DEFINER trigger
-- functions can still create them, while browser clients cannot forge them.
drop policy if exists "User insert notification" on public.notifications;
drop policy if exists "System insert notification" on public.notifications;
revoke insert on table public.notifications from anon, authenticated;

-- A user may edit only non-authority profile fields. Role assignment remains
-- server/administrator controlled even if an older setup granted broad UPDATE.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, contact_number, profile_picture_path) on table public.profiles to authenticated;

notify pgrst, 'reload schema';

commit;

comment on function private.protect_audit_log_evidence() is
  'Makes audit records append-only and permits only a one-way is_archived transition.';
