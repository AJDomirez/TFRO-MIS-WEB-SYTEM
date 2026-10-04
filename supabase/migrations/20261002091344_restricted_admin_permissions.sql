-- Restricted Administrators may perform normal operational work, while
-- destructive actions and account/system administration remain Head Admin-only.

begin;

create or replace function private.is_tfro_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role in ('admin', 'admin_viewer', 'staff')
    );
$$;

revoke all on function private.is_tfro_staff() from public, anon;
grant execute on function private.is_tfro_staff() to authenticated;

-- Existing operational policies use this helper. Account management and
-- system settings use is_head_admin() or a direct role='admin' check instead.
create or replace function private.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role in ('admin', 'admin_viewer')
    );
$$;

revoke all on function private.is_current_admin() from public, anon;
grant execute on function private.is_current_admin() to authenticated;

-- Allow the restricted Administrator to create attributable audit events.
drop policy if exists "Authenticated users create attributable audit events" on public.audit_logs;
create policy "Authenticated users create attributable audit events"
on public.audit_logs for insert to authenticated
with check (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('admin', 'admin_viewer', 'staff', 'operator', 'traffic_enforcer')
  )
);

-- Normal operational tables: restricted Administrators may add and update.
-- No DELETE policy is added.
do $$
declare
  table_name text;
  insert_policy text;
  update_policy text;
begin
  foreach table_name in array array[
    'change_motor_requests', 'driver_assignments', 'drivers',
    'franchise_applications', 'franchise_documents', 'franchise_renewals',
    'franchises', 'operators', 'payments', 'renewal_documents',
    'traffic_enforcers', 'tricycles', 'violation_catalog', 'violations'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      insert_policy := 'Restricted administrators add ' || table_name;
      update_policy := 'Restricted administrators update ' || table_name;
      execute format('drop policy if exists %I on public.%I', insert_policy, table_name);
      execute format('drop policy if exists %I on public.%I', update_policy, table_name);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check ((select private.is_admin_viewer()))',
        insert_policy, table_name
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using ((select private.is_admin_viewer())) with check ((select private.is_admin_viewer()))',
        update_policy, table_name
      );
      execute format('grant select, insert, update on table public.%I to authenticated', table_name);
    end if;
  end loop;
end;
$$;

grant insert on table public.audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- A DELETE policy elsewhere must never accidentally give a restricted Admin
-- destructive access. This trigger is a final server-side safeguard.
create or replace function private.prevent_restricted_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_admin_viewer()) then
    raise exception 'Only a Head Administrator can delete records.' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_restricted_admin_delete() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'change_motor_history', 'change_motor_requests', 'driver_assignments',
    'drivers', 'franchise_applications', 'franchise_documents',
    'franchise_renewals', 'franchises', 'operators', 'payments',
    'renewal_documents', 'traffic_enforcers', 'tricycles',
    'violation_catalog', 'violations'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists prevent_restricted_admin_delete on public.%I', table_name);
      execute format(
        'create trigger prevent_restricted_admin_delete before delete on public.%I for each row execute function private.prevent_restricted_admin_delete()',
        table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function private.prevent_restricted_admin_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_admin_viewer())
     and new.is_archived is distinct from old.is_archived then
    raise exception 'Only a Head Administrator can archive records.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_restricted_admin_archive() from public, anon, authenticated;
drop trigger if exists prevent_restricted_admin_archive on public.franchises;
create trigger prevent_restricted_admin_archive
before update of is_archived on public.franchises
for each row execute function private.prevent_restricted_admin_archive();

-- The current approval RPCs predate the restricted role and contain their own
-- role predicates. Preserve their full definitions and expand only that check.
do $$
declare
  function_oid regprocedure;
  definition text;
begin
  foreach function_oid in array array[
    'public.approve_franchise_application(bigint)'::regprocedure,
    'public.approve_change_motor_request(bigint)'::regprocedure,
    'private.send_operator_form(text,text,bigint)'::regprocedure,
    'private.send_franchise_expiry_reminder(bigint)'::regprocedure
  ] loop
    definition := pg_get_functiondef(function_oid::oid);
    definition := replace(definition, 'p.role in (''admin'', ''staff'')', 'p.role in (''admin'', ''admin_viewer'', ''staff'')');
    definition := replace(definition, 'role = ''admin''', 'role in (''admin'', ''admin_viewer'')');
    execute definition;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
