-- ============================================================
-- TFRO-MIS Create Test Accounts (Admin, Operator, Driver)
-- WHERE TO RUN THIS:
--   Go to your Supabase project in your browser
--     -> left sidebar: SQL Editor
--     -> click "+ New query"
--     -> paste this whole file
--     -> click "Run"
--
-- THIS VERSION NEEDS NO MANUAL UUID REPLACEMENT.
-- It finds each user by their EMAIL and assigns the role
-- automatically. Just make sure you created the 3 users in
-- Authentication -> Users first (before running this).
-- ============================================================

-- ------------------------------------------------------------
-- FIRST (UI step): create the 3 users BEFORE running this SQL:
--   Authentication -> Users -> Add user -> Create new user
--     admin@tfro.gov.ph    / Admin123!
--     operator@tfro.gov.ph / Operator123!
--     driver@tfro.gov.ph   / Driver123!
-- ------------------------------------------------------------

-- ============================================================
-- STEP 1: Assign roles + display names (by email, no UUIDs needed)
-- ============================================================
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@tfro.gov.ph');

update public.profiles
set role = 'operator'
where id = (select id from auth.users where email = 'operator@tfro.gov.ph');

update public.profiles
set role = 'driver'
where id = (select id from auth.users where email = 'driver@tfro.gov.ph');

update public.profiles
set full_name = 'System Administrator'
where id = (select id from auth.users where email = 'admin@tfro.gov.ph');

update public.profiles
set full_name = 'Juan Dela Cruz'
where id = (select id from auth.users where email = 'operator@tfro.gov.ph');

update public.profiles
set full_name = 'Pedro Santos'
where id = (select id from auth.users where email = 'driver@tfro.gov.ph');

-- Verify roles were assigned
select pr.id, au.email, pr.role, pr.full_name
from public.profiles pr
join auth.users au on au.id = pr.id
where au.email in ('admin@tfro.gov.ph','operator@tfro.gov.ph','driver@tfro.gov.ph')
order by pr.role;

-- ============================================================
-- STEP 2: Link operator & driver to their portal records
-- (also by email, no UUIDs needed)
-- ============================================================
-- Register the operator (linked to auth user)
insert into public.operators (user_id, full_name, address, contact_number, status, verified)
select id, 'Juan Dela Cruz', 'Barangay 1, Lucena City', '09171234567', 'active', true
from auth.users where email = 'operator@tfro.gov.ph'
on conflict do nothing;

-- Register the driver (linked to auth user)
insert into public.drivers (user_id, full_name, license_number, operator_name, contact_number, license_type, license_expiration, license_status)
select id, 'Pedro Santos', 'L01-2345-6789', 'Juan Dela Cruz', '09179876543', 'Professional', '2026-12-31', 'not_verified'
from auth.users where email = 'driver@tfro.gov.ph'
on conflict do nothing;

-- Verify portal-linked rows
select id, user_id, full_name from public.operators;
select id, user_id, full_name, license_number, license_status from public.drivers;
