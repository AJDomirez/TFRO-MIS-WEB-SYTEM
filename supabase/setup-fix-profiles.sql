-- ============================================================
-- Fix: Missing 'contact_number' column on public.profiles
-- Run this in Supabase Dashboard > SQL Editor.
--
-- The profile save fails with:
--   "Could not find the 'contact_number' column of 'profiles'
--    in the schema cache"
--
-- Cause: the profiles table was created before the contact_number
-- column existed, and PostgREST cached the old schema.
--
-- This script:
--   1. Adds the contact_number (and full_name) columns if missing
--   2. Reloads the PostgREST schema cache so the app can see them
-- ============================================================

-- 1) Ensure the columns exist.
alter table public.profiles
  add column if not exists full_name text;

alter table public.profiles
  add column if not exists contact_number text;

-- 2) Reload the PostgREST schema cache so the new column is
--    immediately visible to queries and updates.
--    (This is the key step that clears the "schema cache" error.)
notify pgrst, 'reload schema';
-- Equivalent alternative if the above is not supported:
-- select pg_notify('pgrst', 'reload schema');

-- 3) (Optional) Verify the columns now exist.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
