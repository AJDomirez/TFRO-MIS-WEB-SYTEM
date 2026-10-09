-- Existing Staff all / Restricted Administrator insert policies already
-- authorize the roles allowed by create_manual_change_motor_request(). Keeping
-- a fourth permissive INSERT policy would add redundant policy evaluation.
drop policy if exists "TFRO staff create manual change motor"
  on public.change_motor_requests;

notify pgrst, 'reload schema';
