drop policy if exists "Operators update own pending Driver applications" on public.drivers;
create policy "Operators update own pending Driver applications"
on public.drivers for update to authenticated
using (
  license_status = 'not_verified'
  and exists (select 1 from public.operators o where o.id = drivers.operator_id and o.user_id = (select auth.uid()) and o.verified and o.status = 'active')
)
with check (
  user_id is null and violation_count = 0 and compliance = 'non-compliant'
  and license_status = 'not_verified' and license_verified_at is null
  and exists (
    select 1 from public.operators o
    join public.franchises f on f.operator_id = o.user_id
    where o.id = drivers.operator_id and o.user_id = (select auth.uid())
      and o.verified and o.status = 'active' and o.full_name = drivers.operator_name
      and f.id = drivers.franchise_id
  )
);

drop policy if exists "Operators delete own pending Driver pictures" on storage.objects;
create policy "Operators delete own pending Driver pictures"
on storage.objects for delete to authenticated
using (
  bucket_id = 'franchise-documents' and name like 'driver-pictures/%/%'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (select 1 from public.operators o where o.id = split_part(storage.objects.name, '/', 2)::bigint and o.user_id = (select auth.uid()))
);
