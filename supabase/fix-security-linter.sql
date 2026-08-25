-- =========================================================
-- TFRO-MIS Security Linter Remediation
-- Fixes the Supabase database linter warnings:
--   1. rls_policy_always_true  (audit_logs INSERT policy)
--
-- SECURITY DEFINER function hardening is now handled comprehensively by
-- 20260814_harden_security_definer_functions.sql. Run that migration after
-- this file and the other setup scripts.
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
-- 2) NOTE: "Leaked Password Protection Disabled"
--    This is an Auth project setting, not a SQL change.
--    Enable it manually in Supabase Dashboard:
--    Authentication > Providers > Email > "Prevent an attacker from
--    using a password that has been exposed in a data breach"
--    (Leaked password protection). Toggle it ON.
-- =========================================================

-- Reload PostgREST schema cache.
notify pgrst, 'reload schema';
