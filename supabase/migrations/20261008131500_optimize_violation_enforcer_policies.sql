create index if not exists violation_enforcers_assigned_by_idx
  on public.violation_enforcers (assigned_by);

drop policy if exists "TFRO staff manage violation enforcers" on public.violation_enforcers;

create policy "TFRO staff insert violation enforcers"
on public.violation_enforcers for insert to authenticated
with check ((select private.is_tfro_staff()) and assigned_by = (select auth.uid()));

create policy "TFRO staff update violation enforcers"
on public.violation_enforcers for update to authenticated
using ((select private.is_tfro_staff()))
with check ((select private.is_tfro_staff()) and assigned_by = (select auth.uid()));

create policy "TFRO staff delete violation enforcers"
on public.violation_enforcers for delete to authenticated
using ((select private.is_tfro_staff()));

notify pgrst, 'reload schema';
