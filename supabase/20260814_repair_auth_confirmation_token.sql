-- ============================================================================
-- Repair Supabase Auth users with an invalid NULL confirmation_token.
--
-- Run this in Supabase Dashboard > SQL Editor only if Auth Logs report:
--   "confirmation_token": converting NULL to string is unsupported
--
-- This is intentionally limited to the malformed NULL values. An empty token
-- is the normal "no pending confirmation token" value expected by GoTrue.
-- ============================================================================

begin;

update auth.users
set confirmation_token = ''
where confirmation_token is null;

commit;

-- Verification: this must return 0.
select count(*) as invalid_null_confirmation_tokens
from auth.users
where confirmation_token is null;
