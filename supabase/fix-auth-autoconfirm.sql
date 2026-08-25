-- ============================================================================
-- TFRO-MIS: Optional — Disable email confirmation (autoconfirm signups)
--
-- Run this in Supabase Dashboard > SQL Editor ONLY if you want users to be
-- able to register and sign in immediately WITHOUT clicking an email
-- confirmation link.
--
-- This is the recommended fallback if ONE of these is true:
--   * You cannot configure custom SMTP yet (custom SMTP is supported on the
--     Supabase Free plan; no Pro subscription is required).
--   * The built-in Supabase email service is unreliable for your users.
--   * Your TFRO operators/drivers do not use email regularly and need to
--     access the portal immediately.
--
-- IMPORTANT
--   * This does NOT weaken password security — Supabase still stores
--     passwords with the same strong bcrypt hashing.
--   * This does NOT change any of your RLS policies, roles, or profiles.
--   * "Confirm email" can also be toggled in the Dashboard at:
--       Authentication  →  Providers  →  Email  →  "Confirm email"
--     Turning it OFF is equivalent to this SQL.
--   * To restore email confirmation later, turn "Confirm email" back ON in
--     the Dashboard — no SQL needed.
--
-- HOSTED SUPABASE NOTE
--   Do not run UPDATE auth.instance on a hosted project: auth.instance is not
--   exposed there. Change this setting in Authentication > Providers > Email.
--   The SQL below applies only to a self-hosted Supabase installation where
--   auth.instance exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Confirm the current value before changing it
--    true = new users are automatically confirmed (no confirmation email)
-- ---------------------------------------------------------------------------
select instance_id, config->>'mailer_autoconfirm' as current_autoconfirm
from auth.instance;

-- ---------------------------------------------------------------------------
-- 2) Turn off the confirmation requirement.
--    Existing unconfirmed users will be usable immediately; new signups are
--    created as confirmed automatically.
-- ---------------------------------------------------------------------------
update auth.instance
set config = jsonb_set(config, '{mailer_autoconfirm}', 'true')
where true;

-- ---------------------------------------------------------------------------
-- 3) Verify the new value (should now show 'true')
-- ---------------------------------------------------------------------------
select instance_id, config->>'mailer_autoconfirm' as new_autoconfirm
from auth.instance;

-- ---------------------------------------------------------------------------
-- 4) Informational message
-- ---------------------------------------------------------------------------
select 'Email confirmation is now DISABLED. Users can register and sign in immediately.'
  as autoconfirm_status;
