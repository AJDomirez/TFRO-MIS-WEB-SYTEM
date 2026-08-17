-- =========================================================
-- TFRO-MIS Security Linter Remediation
-- Fixes the Supabase database linter warnings:
--   1. rls_policy_always_true  (audit_logs INSERT policy)
--   2. anon_security_definer_function_executable (is_tfro_staff)
--   3. authenticated_security_definer_function_executable (is_tfro_staff)
-- Run this once in the Supabase SQL Editor AFTER the other setup scripts.
-- =========================================================

-- =========================================================
-- 1) FIX: "Users can insert audit logs" uses WITH CHECK (true)
--    A user should only be allowed to insert audit log rows
--    that reference their own auth account. We add a user_id
--    column and restrict the policy accordingly.
-- =========================================================

-- Add a user_id column to audit_logs so entries can be tied to a user.
alter table public.audit_logs
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Recreate the insert policy so it only allows a user to insert
-- a row that belongs to them (or has no user_id for legacy/system rows).
drop policy if exists "Users can insert audit logs" on public.audit_logs;

create policy "Users can insert audit logs"
on public.audit_logs
for insert
to authenticated
with check (
  (user_id is null) or (user_id = (select auth.uid()))
);

-- =========================================================
-- 2) FIX: is_tfro_staff() is SECURITY DEFINER and executable by anon
--    anon role should NOT be able to call it. Revoke EXECUTE from anon.
-- =========================================================

revoke execute on function public.is_tfro_staff() from anon;

-- =========================================================
-- 3) is_tfro_staff() executable by authenticated (SECURITY DEFINER)
--    This function is REQUIRED by the app for role checks and by the
--    RLS policies themselves. It must remain callable by authenticated.
--    To reduce risk, we keep SECURITY DEFINER but ensure only the
--    authenticated role can call it (anon revoked above) and the
--    function only reads the profiles table (no writes).
--    Recommendation: keep it callable by authenticated only.
-- =========================================================

-- Ensure ONLY authenticated can execute (double-check anon/service_role).
revoke execute on function public.is_tfro_staff() from anon, public;
grant execute on function public.is_tfro_staff() to authenticated;

-- =========================================================
-- 4) NOTE: "Leaked Password Protection Disabled"
--    This is an Auth project setting, not a SQL change.
--    Enable it manually in Supabase Dashboard:
--    Authentication > Providers > Email > "Prevent an attacker from
--    using a password that has been exposed in a data breach"
--    (Leaked password protection). Toggle it ON.
-- =========================================================

-- Reload PostgREST schema cache.
notify pgrst, 'reload schema';
