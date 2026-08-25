alter table public.payments
  add column if not exists receipt_snapshot jsonb,
  add column if not exists printed_at timestamptz,
  add column if not exists printed_by uuid references auth.users(id);

create unique index if not exists payments_receipt_unique_idx
  on public.payments (lower(receipt)) where receipt is not null;

create schema if not exists private;

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
begin
  if new.violation_id is null then
    raise exception 'A violation is required for a penalty payment.';
  end if;

  select * into violation_row
  from public.violations
  where id = new.violation_id
  for update;

  if not found then raise exception 'The selected violation no longer exists.'; end if;
  if violation_row.status = 'paid' then raise exception 'This violation has already been paid.'; end if;
  if coalesce(violation_row.penalty, 0) <= 0 then raise exception 'The violation does not have a valid penalty.'; end if;

  select d.address into payer_address from public.drivers d where d.id = violation_row.driver_id;
  select p.full_name into assessor_name from public.profiles p where p.id = auth.uid();

  new.amount := violation_row.penalty;
  new.payer := coalesce(nullif(btrim(violation_row.subject_name), ''), new.payer);
  new.payment_type := 'penalty';
  new.status := 'paid';
  new.recorded_by := auth.uid();
  new.paid_at := coalesce(new.paid_at, now());
  new.receipt_snapshot := jsonb_build_object(
    'receipt_number', new.receipt,
    'payer', new.payer,
    'address', coalesce(payer_address, ''),
    'ticket_number', violation_row.ticket_number,
    'code', violation_row.violation_code,
    'violation', violation_row.violation_type,
    'classification', violation_row.classification,
    'franchise_number', violation_row.franchise_number,
    'apprehending_officers', violation_row.apprehending_officers,
    'penalty', violation_row.penalty,
    'amount_paid', violation_row.penalty,
    'date_paid', new.paid_at,
    'assessed_by', coalesce(assessor_name, 'TFRO Personnel')
  );
  return new;
end;
$$;

revoke all on function private.prepare_violation_payment_receipt() from public, anon, authenticated;

drop trigger if exists prepare_violation_payment_receipt on public.payments;
create trigger prepare_violation_payment_receipt
before insert on public.payments
for each row execute function private.prepare_violation_payment_receipt();

create or replace function private.protect_issued_payment_receipt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'paid' then
    if new.receipt is distinct from old.receipt
      or new.payer is distinct from old.payer
      or new.payment_type is distinct from old.payment_type
      or new.amount is distinct from old.amount
      or new.paid_at is distinct from old.paid_at
      or new.violation_id is distinct from old.violation_id
      or new.recorded_by is distinct from old.recorded_by
      or new.receipt_snapshot is distinct from old.receipt_snapshot then
      raise exception 'Issued payment receipts cannot be changed.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_issued_payment_receipt() from public, anon, authenticated;

drop trigger if exists protect_issued_payment_receipt on public.payments;
create trigger protect_issued_payment_receipt
before update on public.payments
for each row execute function private.protect_issued_payment_receipt();

create or replace function public.claim_payment_receipt_print(payment_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed public.payments%rowtype;
  existing public.payments%rowtype;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and lower(role) = 'staff') then
    raise exception 'Only TFRO staff can print payment receipts.';
  end if;

  update public.payments
  set printed_at = now(), printed_by = auth.uid()
  where id = payment_id and status = 'paid' and printed_at is null
  returning * into claimed;

  if found then
    return jsonb_build_object('can_print', true, 'payment', to_jsonb(claimed));
  end if;

  select * into existing from public.payments where id = payment_id;
  if not found then raise exception 'Payment receipt not found.'; end if;
  return jsonb_build_object('can_print', false, 'payment', to_jsonb(existing));
end;
$$;

revoke all on function public.claim_payment_receipt_print(bigint) from public, anon;
grant execute on function public.claim_payment_receipt_print(bigint) to authenticated;

comment on column public.payments.receipt_snapshot is 'Immutable receipt data captured when payment is secured.';
comment on column public.payments.printed_at is 'Set atomically by claim_payment_receipt_print; a non-null value permanently locks reprinting.';
