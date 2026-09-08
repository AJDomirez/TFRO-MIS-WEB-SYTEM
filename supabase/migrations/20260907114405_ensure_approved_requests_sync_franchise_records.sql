-- Keep the master Franchise Records table authoritative for approved
-- renewals and Change Motor requests. Also assign a readable franchise
-- number whenever a new record is created without one.

create or replace function public.assign_franchise_number()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  next_number bigint;
begin
  if nullif(btrim(new.franchise_number), '') is not null then
    new.franchise_number := upper(btrim(new.franchise_number));
    return new;
  end if;

  -- Serialize number allocation so two approvals cannot receive one number.
  perform pg_advisory_xact_lock(hashtext('public.franchises.franchise_number'));

  select coalesce(max((substring(franchise_number from '([0-9]+)$'))::bigint), 0) + 1
    into next_number
  from public.franchises
  where franchise_number ~ '[0-9]+$';

  new.franchise_number := lpad(next_number::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists assign_franchise_number_before_write on public.franchises;
create trigger assign_franchise_number_before_write
before insert or update of franchise_number on public.franchises
for each row execute function public.assign_franchise_number();

create or replace function public.sync_approved_renewal_to_franchise()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    update public.franchises
       set status = 'active',
           application_type = 'renewal',
           application_date = current_date,
           previous_mtop_expiration = coalesce(new.current_expiration_date, previous_mtop_expiration),
           expiration_date = coalesce(new.new_expiration_date, expiration_date),
           operator_name = coalesce(nullif(btrim(new.operator_name), ''), operator_name),
           address = coalesce(nullif(btrim(new.operator_address), ''), address),
           contact_number = coalesce(nullif(btrim(new.operator_contact), ''), contact_number),
           is_archived = false
     where id = new.franchise_id;

    if not found then
      raise exception 'Approved renewal % has no linked Franchise Record', new.renewal_code;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_approved_renewal_to_franchise on public.franchise_renewals;
create trigger sync_approved_renewal_to_franchise
after update of status on public.franchise_renewals
for each row execute function public.sync_approved_renewal_to_franchise();

create or replace function public.sync_approved_motor_to_franchise()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    update public.franchises
       set status = 'active',
           engine_number = coalesce(nullif(btrim(new.new_engine_number), ''), engine_number),
           chassis_number = coalesce(nullif(btrim(new.new_chassis_number), ''), chassis_number),
           plate_number = coalesce(nullif(btrim(new.new_plate_number), ''), plate_number),
           motorcycle_brand = coalesce(nullif(btrim(new.new_motor_brand), ''), motorcycle_brand),
           is_archived = false
     where id = new.franchise_id;

    if not found then
      raise exception 'Approved Change Motor request % has no linked Franchise Record', coalesce(new.request_code, new.id::text);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_approved_motor_to_franchise on public.change_motor_requests;
create trigger sync_approved_motor_to_franchise
after update of status on public.change_motor_requests
for each row execute function public.sync_approved_motor_to_franchise();

revoke all on function public.assign_franchise_number() from public, anon;
revoke all on function public.sync_approved_renewal_to_franchise() from public, anon;
revoke all on function public.sync_approved_motor_to_franchise() from public, anon;
