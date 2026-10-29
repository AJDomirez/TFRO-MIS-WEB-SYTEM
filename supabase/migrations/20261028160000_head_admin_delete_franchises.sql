-- Only Head Administrators may permanently delete franchise records.
-- The browser confirmation is a usability safeguard; this RLS policy is the
-- authoritative database permission and cannot be bypassed by other users.

begin;

drop policy if exists "Head administrators delete franchises" on public.franchises;
create policy "Head administrators delete franchises"
on public.franchises
for delete
to authenticated
using ((select private.is_head_admin()));

commit;
