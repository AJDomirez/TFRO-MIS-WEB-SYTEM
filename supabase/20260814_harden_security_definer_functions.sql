-- ============================================================================
-- TFRO-MIS: harden SECURITY DEFINER functions exposed by the API
--
-- Run once in Supabase Dashboard > SQL Editor AFTER the existing setup scripts
-- and 20260813_security_and_integration_migration.sql.
--
-- This migration is safe to re-run. It keeps the RLS policies working: moving
-- a PostgreSQL function updates dependent policies by function OID, so policies
-- that call public.is_tfro_staff() continue to call the same function after it
-- is moved to the non-exposed private schema.
-- ============================================================================

begin;

-- The `private` schema is not exposed through Supabase's PostgREST API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Move RLS helper functions out of the exposed public schema. The staff helper
-- must remain executable by authenticated users because RLS policies invoke it.
-- current_role is not called by the browser or a policy, so it receives no
-- direct execute grant.
do $$
begin
  if to_regprocedure('public.is_tfro_staff()') is not null then
    execute 'alter function public.is_tfro_staff() set schema private';
  end if;

  if to_regprocedure('public.current_role()') is not null then
    execute 'alter function public.current_role() set schema private';
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('private.is_tfro_staff()') is not null then
    execute 'alter function private.is_tfro_staff() set search_path = public, pg_temp';
    execute 'revoke all on function private.is_tfro_staff() from public, anon';
    execute 'grant execute on function private.is_tfro_staff() to authenticated';
  end if;

  if to_regprocedure('private.current_role()') is not null then
    execute 'alter function private.current_role() set search_path = public, pg_temp';
    execute 'revoke all on function private.current_role() from public, anon, authenticated';
  end if;
end;
$$;

-- These are trigger functions. They must be SECURITY DEFINER so inserts and
-- updates can perform trusted work, but no API client should invoke them via
-- RPC. Triggers continue to execute after these grants are revoked.
do $$
declare
  trigger_function text;
begin
  foreach trigger_function in array array[
    'public.handle_new_user()',
    'public.notify_application_status_change()',
    'public.notify_change_motor_request()',
    'public.notify_change_motor_status_change()'
  ] loop
    if to_regprocedure(trigger_function) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', trigger_function);
    end if;
  end loop;
end;
$$;

-- Refresh PostgREST's schema cache. Only public functions are exposed by the
-- API, so the moved helpers and trigger functions no longer appear as RPCs.
notify pgrst, 'reload schema';

commit;

-- Optional verification: the first two rows should be in `private`; the
-- trigger functions should have no EXECUTE privilege for anon/authenticated.
select
  n.nspname as schema_name,
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in (
  'is_tfro_staff',
  'current_role',
  'handle_new_user',
  'notify_application_status_change',
  'notify_change_motor_request',
  'notify_change_motor_status_change'
)
order by p.proname;
