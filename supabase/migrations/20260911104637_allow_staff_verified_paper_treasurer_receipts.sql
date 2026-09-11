begin;

-- TFRO Staff may verify the original paper OR presented at the office. A
-- prior Operator upload remains useful evidence, but is not a prerequisite.
create or replace function private.prepare_violation_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  violation_row public.violations%rowtype;
  payer_address text;
  assessor_name text;
  net_amount numeric(12,2);
begin
  if new.violation_id is null then
    raise exception 'A violation is required for a penalty payment.';
  end if;
  if nullif(btrim(new.receipt), '') is null then
    raise exception 'Enter the official City Treasurer receipt number.';
  end if;

  select * into violation_row
  from public.violations
  where id = new.violation_id
  for update;

  if not found then raise exception 'The selected violation no longer exists.'; end if;
  if violation_row.status = 'paid' then raise exception 'This violation has already been paid.'; end if;

  net_amount := greatest(coalesce(violation_row.penalty, 0) - coalesce(violation_row.discounted, 0), 0);
  if net_amount <= 0 then raise exception 'The violation does not have a payable balance.'; end if;

  select d.address into payer_address from public.drivers d where d.id = violation_row.driver_id;
  select p.full_name into assessor_name from public.profiles p where p.id = auth.uid();

  new.receipt := btrim(new.receipt);
  new.amount := net_amount;
  new.payer := coalesce(nullif(btrim(violation_row.subject_name), ''), new.payer);
  new.payment_type := 'penalty';
  new.status := 'paid';
  new.recorded_by := auth.uid();
  new.paid_at := coalesce(new.paid_at, now());
  new.receipt_snapshot := jsonb_build_object(
    'receipt_number', new.receipt,
    'city_treasurer_receipt_number', coalesce(violation_row.treasurer_receipt_number, new.receipt),
    'city_treasurer_receipt_path', violation_row.treasurer_receipt_path,
    'receipt_source', case when violation_row.treasurer_receipt_path is null then 'paper_verified_by_tfro' else 'operator_upload_verified_by_tfro' end,
    'payer', new.payer,
    'address', coalesce(payer_address, ''),
    'ticket_number', violation_row.ticket_number,
    'code', violation_row.violation_code,
    'violation', violation_row.violation_type,
    'classification', violation_row.classification,
    'franchise_number', violation_row.franchise_number,
    'apprehending_officers', violation_row.apprehending_officers,
    'penalty', violation_row.penalty,
    'discounted', coalesce(violation_row.discounted, 0),
    'amount_paid', net_amount,
    'date_paid', new.paid_at,
    'assessed_by', coalesce(assessor_name, 'TFRO Personnel')
  );
  return new;
end;
$$;

revoke all on function private.prepare_violation_payment_receipt() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
