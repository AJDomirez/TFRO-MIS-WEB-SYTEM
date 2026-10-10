begin;

-- Keep the verified City Treasurer official receipt number on the violation
-- itself, whether TFRO Staff verifies an Operator upload or a paper receipt.
create or replace function private.capture_city_treasurer_or_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.violation_id is not null and nullif(btrim(new.receipt), '') is not null then
    update public.violations
    set
      treasurer_receipt_number = btrim(new.receipt),
      treasurer_receipt_submitted_at = coalesce(
        treasurer_receipt_submitted_at,
        new.paid_at,
        now()
      ),
      treasurer_receipt_submitted_by = coalesce(
        treasurer_receipt_submitted_by,
        new.recorded_by,
        auth.uid()
      )
    where id = new.violation_id;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_city_treasurer_or_on_payment()
from public, anon, authenticated;

drop trigger if exists capture_city_treasurer_or_on_payment on public.payments;
create trigger capture_city_treasurer_or_on_payment
before insert or update of receipt, violation_id on public.payments
for each row execute function private.capture_city_treasurer_or_on_payment();

-- Backfill the most recent verified payment OR into existing violation rows.
with latest_payment as (
  select distinct on (p.violation_id)
    p.violation_id,
    btrim(p.receipt) as receipt,
    p.paid_at,
    p.recorded_by
  from public.payments p
  where p.violation_id is not null
    and nullif(btrim(p.receipt), '') is not null
  order by p.violation_id, p.paid_at desc nulls last, p.id desc
)
update public.violations v
set
  treasurer_receipt_number = lp.receipt,
  treasurer_receipt_submitted_at = coalesce(
    v.treasurer_receipt_submitted_at,
    lp.paid_at,
    now()
  ),
  treasurer_receipt_submitted_by = coalesce(
    v.treasurer_receipt_submitted_by,
    lp.recorded_by
  )
from latest_payment lp
where v.id = lp.violation_id
  and v.treasurer_receipt_number is distinct from lp.receipt;

notify pgrst, 'reload schema';

commit;
