-- Authorize Operator franchise access through the UUID relationship selected
-- by TFRO Staff, not a mutable display-name comparison.
drop policy if exists "Operators can read their own franchise" on public.franchises;
create policy "Operators read linked franchises"
on public.franchises for select to authenticated
using (operator_id = (select auth.uid()));

create index if not exists franchises_operator_id_idx
on public.franchises (operator_id);
