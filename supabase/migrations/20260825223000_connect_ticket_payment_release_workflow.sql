alter table public.violations
  add column if not exists treasurer_receipt_path text,
  add column if not exists treasurer_receipt_number text,
  add column if not exists treasurer_receipt_submitted_at timestamptz,
  add column if not exists treasurer_receipt_submitted_by uuid references public.profiles(id) on delete set null;

alter table public.payments
  add column if not exists unit_owner_name text,
  add column if not exists unit_owner_address text,
  add column if not exists unit_owner_contact text,
  add column if not exists driver_name text,
  add column if not exists driver_address text,
  add column if not exists driver_contact text,
  add column if not exists engine_number text,
  add column if not exists chassis_number text,
  add column if not exists release_date date,
  add column if not exists release_time time,
  add column if not exists released_by text,
  add column if not exists release_witness text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('treasurer-receipts', 'treasurer-receipts', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Operators upload Treasurer receipts" on storage.objects;
create policy "Operators upload Treasurer receipts" on storage.objects for insert to authenticated
with check (
  bucket_id='treasurer-receipts'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='operator')
);

drop policy if exists "Authorized users read Treasurer receipts" on storage.objects;
create policy "Authorized users read Treasurer receipts" on storage.objects for select to authenticated
using (
  bucket_id='treasurer-receipts'
  and (
    owner_id=(select auth.uid()::text)
    or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('admin','staff'))
  )
);

drop policy if exists "Operators remove unsubmitted Treasurer receipts" on storage.objects;
create policy "Operators remove unsubmitted Treasurer receipts" on storage.objects for delete to authenticated
using (bucket_id='treasurer-receipts' and owner_id=(select auth.uid()::text));

drop policy if exists "Operators read linked Driver tickets" on public.violations;
create policy "Operators read linked Driver tickets" on public.violations for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='operator')
  and (
    subject_name=(select p.full_name from public.profiles p where p.id=(select auth.uid()))
    or exists (
      select 1 from public.drivers d join public.operators o on o.id=d.operator_id
      where d.id=driver_id and o.user_id=(select auth.uid())
    )
  )
);

drop policy if exists "Operators read linked violation payments" on public.payments;
create policy "Operators read linked violation payments" on public.payments for select to authenticated
using (
  exists (
    select 1
    from public.violations v
    left join public.drivers d on d.id=v.driver_id
    left join public.operators o on o.id=d.operator_id
    where v.id=violation_id
      and (o.user_id=(select auth.uid()) or v.subject_name=(select p.full_name from public.profiles p where p.id=(select auth.uid())))
  )
);

create or replace function public.submit_city_treasurer_receipt(
  p_violation_id bigint,
  p_receipt_number text,
  p_storage_path text
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='operator') then
    raise exception 'Only the linked Operator can submit a City Treasurer receipt.' using errcode='42501';
  end if;
  if p_storage_path is null or split_part(p_storage_path,'/',1)<>auth.uid()::text then
    raise exception 'Invalid receipt storage path.' using errcode='42501';
  end if;
  update public.violations v set
    treasurer_receipt_path=p_storage_path,
    treasurer_receipt_number=nullif(btrim(p_receipt_number),''),
    treasurer_receipt_submitted_at=now(),
    treasurer_receipt_submitted_by=auth.uid()
  where v.id=p_violation_id and v.status='pending' and (
    v.subject_name=(select p.full_name from public.profiles p where p.id=auth.uid())
    or exists (
      select 1 from public.drivers d join public.operators o on o.id=d.operator_id
      where d.id=v.driver_id and o.user_id=auth.uid()
    )
  );
  if not found then raise exception 'The pending ticket is not linked to this Operator.' using errcode='42501'; end if;
  insert into public.notifications(title,message,type,user_id)
  select 'City Treasurer Receipt Submitted',
    'The Operator submitted City Treasurer receipt '||coalesce(nullif(btrim(p_receipt_number),''),'for ticket '||p_violation_id::text)||'. Payment may now be recorded.',
    'info',p.id from public.profiles p where p.role in ('admin','staff');
end;
$$;

revoke all on function public.submit_city_treasurer_receipt(bigint,text,text) from public,anon;
grant execute on function public.submit_city_treasurer_receipt(bigint,text,text) to authenticated;

create or replace function private.prepare_violation_payment_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
declare violation_row public.violations%rowtype; payer_address text; assessor_name text; net_amount numeric(12,2);
begin
  if new.violation_id is null then raise exception 'A violation is required for a penalty payment.'; end if;
  select * into violation_row from public.violations where id=new.violation_id for update;
  if not found then raise exception 'The selected violation no longer exists.'; end if;
  if violation_row.status='paid' then raise exception 'This violation has already been paid.'; end if;
  if violation_row.treasurer_receipt_path is null then raise exception 'The Operator must submit the City Treasurer receipt first.'; end if;
  net_amount:=greatest(coalesce(violation_row.penalty,0)-coalesce(violation_row.discounted,0),0);
  if net_amount<=0 then raise exception 'The violation does not have a payable balance.'; end if;
  select d.address into payer_address from public.drivers d where d.id=violation_row.driver_id;
  select p.full_name into assessor_name from public.profiles p where p.id=auth.uid();
  new.amount:=net_amount; new.payer:=coalesce(nullif(btrim(violation_row.subject_name),''),new.payer);
  new.payment_type:='penalty'; new.status:='paid'; new.recorded_by:=auth.uid(); new.paid_at:=coalesce(new.paid_at,now());
  new.receipt_snapshot:=jsonb_build_object(
    'receipt_number',new.receipt,'city_treasurer_receipt_number',violation_row.treasurer_receipt_number,
    'city_treasurer_receipt_path',violation_row.treasurer_receipt_path,'payer',new.payer,'address',coalesce(payer_address,''),
    'ticket_number',violation_row.ticket_number,'code',violation_row.violation_code,'violation',violation_row.violation_type,
    'classification',violation_row.classification,'franchise_number',violation_row.franchise_number,
    'apprehending_officers',violation_row.apprehending_officers,'penalty',violation_row.penalty,
    'discounted',coalesce(violation_row.discounted,0),'amount_paid',net_amount,'date_paid',new.paid_at,
    'assessed_by',coalesce(assessor_name,'TFRO Personnel')
  );
  return new;
end;
$$;

revoke all on function private.prepare_violation_payment_receipt() from public,anon,authenticated;

create or replace function private.notify_ticket_payment_release()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  select coalesce(o.user_id, direct_operator.user_id) into recipient
  from public.violations v
  left join public.drivers d on d.id=v.driver_id
  left join public.operators o on o.id=d.operator_id
  left join public.operators direct_operator on lower(direct_operator.full_name)=lower(v.subject_name)
  where v.id=new.violation_id limit 1;
  if recipient is not null then
    insert into public.notifications(title,message,type,user_id) values(
      'Payment Recorded and Unit Release Prepared',
      'TFRO Staff recorded receipt '||coalesce(new.receipt,'')||'. TFRO-009 and TFRO-010 are now available in your Operator portal.',
      'success',recipient
    );
  end if;
  return new;
end;
$$;
revoke all on function private.notify_ticket_payment_release() from public,anon,authenticated;
drop trigger if exists notify_ticket_payment_release on public.payments;
create trigger notify_ticket_payment_release after insert on public.payments for each row execute function private.notify_ticket_payment_release();
notify pgrst,'reload schema';
