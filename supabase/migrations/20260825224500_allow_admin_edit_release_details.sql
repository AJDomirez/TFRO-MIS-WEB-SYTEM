drop policy if exists "Administrators update payment release details" on public.payments;
create policy "Administrators update payment release details"
on public.payments for update to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

comment on policy "Administrators update payment release details" on public.payments is
  'Admins may correct TFRO-010 descriptive/release fields. The immutable issued-receipt trigger still blocks changes to secured payment fields.';
