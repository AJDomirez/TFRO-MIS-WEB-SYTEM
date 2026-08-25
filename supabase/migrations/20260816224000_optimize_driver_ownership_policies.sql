-- Keep a single SELECT policy for the shared authenticated role so Postgres
-- evaluates one combined predicate instead of multiple permissive policies.
drop policy if exists "TFRO staff read Driver applications" on public.drivers;
drop policy if exists "Operators read their Driver applications" on public.drivers;

create policy "Authorized users read Driver applications"
on public.drivers for select to authenticated
using (
  (select private.is_tfro_staff())
  or exists (
    select 1
    from public.operators operator_record
    where operator_record.id = drivers.operator_id
      and operator_record.user_id = (select auth.uid())
  )
);

-- Cover the Driver relationships and Operator ownership lookup used by the
-- portal and RLS policies.
create index if not exists drivers_user_id_idx on public.drivers (user_id);
create index if not exists drivers_franchise_id_idx on public.drivers (franchise_id);
create index if not exists operators_user_id_idx on public.operators (user_id);
