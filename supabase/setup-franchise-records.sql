-- =========================================================
-- TFRO-MIS Franchise Records — Official Franchise Fields
-- Adds the official franchise record columns to public.franchises.
-- Run this once in the Supabase SQL Editor.
-- =========================================================

alter table public.franchises
  add column if not exists previous_registration text;

alter table public.franchises
  add column if not exists registration_month integer;

alter table public.franchises
  add column if not exists registration_day integer;

alter table public.franchises
  add column if not exists registration_year integer;

alter table public.franchises
  add column if not exists address text;

alter table public.franchises
  add column if not exists engine_number text;

alter table public.franchises
  add column if not exists chassis_number text;

alter table public.franchises
  add column if not exists plate_number text;

alter table public.franchises
  add column if not exists contact_number text;

-- Archive soft-delete flag (admin "Delete/Archive" a franchise record)
alter table public.franchises
  add column if not exists is_archived boolean not null default false;

-- Reload PostgREST schema cache so the new columns are immediately queryable.
notify pgrst, 'reload schema';
