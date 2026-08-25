-- ============================================================================
-- TFRO-MIS: Fix Registration "Error sending confirmation email" (HTTP 500)
--
-- Run this in Supabase Dashboard > SQL Editor.
--
-- CAUSE
--   GoTrue (Supabase Auth) fails when auth.users contains a NULL
--   confirmation_token. When a new user signs up (or when Supabase attempts
--   to generate a confirmation email), the server hits:
--
--     "confirmation_token": converting NULL to string is unsupported
--
--   which surfaces to the browser as:
--
--     HTTP 500  {"code":500,"error_code":"unexpected_failure",
--               "msg":"Error sending confirmation email"}
--
-- THIS SCRIPT
--   1. Repairs every existing NULL confirmation_token to '' (the normal
--      "no pending confirmation" value expected by GoTrue), fixing users
--      who were partially created with a bad token.
--   2. Also repairs common related NULL token fields that can trigger the
--      same class of GoTrue bug.
--   3. Provides a diagnostic query so you can confirm the data is clean.
--
-- This script does NOT change email-confirmation policy and does NOT delete
-- or reset any user data. It is safe to re-run.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Repair malformed NULL confirmation tokens.
--    '' (empty string) is the normal value GoTrue uses for "no pending token".
-- ---------------------------------------------------------------------------
update auth.users
set confirmation_token = ''
where confirmation_token is null;

-- ---------------------------------------------------------------------------
-- 2) Also fix the recovery/invite/reauthentication tokens — they share the
--    same nullable-text column type and can trip the same GoTrue bug.
-- ---------------------------------------------------------------------------
update auth.users
set recovery_token = ''
where recovery_token is null;

update auth.users
set email_change_token_new = ''
where email_change_token_new is null;

update auth.users
set email_change_token_current = ''
where email_change_token_current is null;

update auth.users
set phone_change_token = ''
where phone_change_token is null;

update auth.users
set reauthentication_token = ''
where reauthentication_token is null;

-- ---------------------------------------------------------------------------
-- 3. Refresh the PostgREST / GoTrue schema caches so the repaired rows are
--    visible immediately.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- 4. Verification — every count below must return 0.
-- ---------------------------------------------------------------------------
select
  count(*) filter (where confirmation_token is null)         as null_confirmation_tokens,
  count(*) filter (where recovery_token is null)             as null_recovery_tokens,
  count(*) filter (where email_change_token_new is null)     as null_email_change_new,
  count(*) filter (where email_change_token_current is null) as null_email_change_current,
  count(*) filter (where phone_change_token is null)         as null_phone_change_tokens,
  count(*) filter (where reauthentication_token is null)     as null_reauthentication_tokens
from auth.users;