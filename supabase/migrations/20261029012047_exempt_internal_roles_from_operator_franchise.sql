-- Franchise qualification belongs only to public Operator registration.
-- Administrator and Staff identities are created by the authenticated Head
-- Administrator Edge Function, which sets protected app_metadata that public
-- browser registration cannot set. Enforcers continue to qualify by roster ID.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'operator');
  internal_account_type text := coalesce(new.raw_app_meta_data ->> 'account_type', '');
  is_head_admin_provisioned boolean :=
    internal_account_type in ('admin_viewer', 'staff')
    and coalesce(new.raw_app_meta_data ->> 'provisioned_by', '') = 'head_admin';
  supplied_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  supplied_contact text := nullif(btrim(new.raw_user_meta_data ->> 'contact_number'), '');
  supplied_address text := nullif(btrim(new.raw_user_meta_data ->> 'address'), '');
  supplied_franchise text := nullif(upper(btrim(new.raw_user_meta_data ->> 'franchise_number')), '');
  supplied_enforcer_id text := nullif(upper(btrim(new.raw_user_meta_data ->> 'enforcer_id')), '');
  roster public.traffic_enforcers%rowtype;
  matched_operator public.operators%rowtype;
  matched_franchise public.franchises%rowtype;
begin
  if is_head_admin_provisioned then
    insert into public.profiles (id, role, full_name, contact_number, account_status)
    values (new.id, internal_account_type, supplied_name, supplied_contact, 'active')
    on conflict (id) do update
      set role = excluded.role,
          full_name = coalesce(excluded.full_name, public.profiles.full_name),
          contact_number = coalesce(excluded.contact_number, public.profiles.contact_number),
          account_status = 'active';
    return new;
  end if;

  if requested_role = 'traffic_enforcer' then
    select * into roster from public.traffic_enforcers
    where enforcer_id = supplied_enforcer_id for update;
    if supplied_enforcer_id is null or not found or roster.status <> 'active' then
      raise exception 'Traffic Enforcer ID is not registered or active.' using errcode = 'P0001';
    end if;
    if roster.user_id is not null and roster.user_id <> new.id then
      raise exception 'Traffic Enforcer ID is already linked to an account.' using errcode = 'P0001';
    end if;
    insert into public.profiles (id, role, full_name, contact_number, account_status)
    values (new.id, 'traffic_enforcer', coalesce(roster.full_name, supplied_name), supplied_contact, 'pending_approval')
    on conflict (id) do update set role = 'traffic_enforcer', full_name = excluded.full_name,
      contact_number = coalesce(excluded.contact_number, public.profiles.contact_number),
      account_status = 'pending_approval';
    update public.traffic_enforcers set user_id = new.id, email = lower(new.email),
      contact_number = coalesce(supplied_contact, contact_number), updated_at = now()
    where id = roster.id;
    return new;
  end if;

  if requested_role <> 'operator' then
    requested_role := 'operator';
  end if;

  if supplied_franchise is null then
    raise exception 'A valid franchise number is required to create an operator account.' using errcode = 'P0001';
  end if;

  if supplied_franchise !~ '^FR-[0-9]{4}-[0-9]{3,4}$' then
    raise exception 'Use the current franchise ID in FR-YYYY-NNNN format.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(supplied_franchise, 0));

  select * into matched_franchise
  from public.franchises f
  where upper(btrim(f.franchise_number)) = supplied_franchise
    and coalesce(f.is_archived, false) = false
  order by f.id
  limit 1
  for update;

  if not found then
    raise exception 'This franchise number is not registered or is no longer active in TFRO records.' using errcode = 'P0001';
  end if;

  select * into matched_operator
  from public.operators o
  where upper(btrim(o.franchise_number)) = supplied_franchise
  order by o.verified desc, o.id
  limit 1
  for update;

  if matched_franchise.operator_id is not null and matched_franchise.operator_id <> new.id then
    raise exception 'This franchise number is already linked to another account. Contact TFRO staff.' using errcode = '23505';
  end if;
  if matched_operator.id is not null and matched_operator.user_id is not null and matched_operator.user_id <> new.id then
    raise exception 'This franchise number is already linked to another account. Contact TFRO staff.' using errcode = '23505';
  end if;

  insert into public.profiles (id, role, full_name, contact_number, account_status)
  values (
    new.id,
    'operator',
    coalesce(nullif(btrim(matched_franchise.operator_name), ''), supplied_name),
    coalesce(matched_franchise.contact_number, supplied_contact),
    'active'
  )
  on conflict (id) do update set role = 'operator', full_name = excluded.full_name,
    contact_number = coalesce(excluded.contact_number, public.profiles.contact_number),
    account_status = 'active';

  if matched_operator.id is not null then
    update public.operators
    set user_id = new.id,
        email = coalesce(email, lower(new.email)),
        verified = true,
        status = 'active'
    where id = matched_operator.id;
  else
    insert into public.operators (
      user_id, full_name, email, address, contact_number,
      franchise_number, status, verified
    ) values (
      new.id,
      coalesce(nullif(btrim(matched_franchise.operator_name), ''), supplied_name),
      lower(new.email),
      coalesce(matched_franchise.address, supplied_address, ''),
      coalesce(matched_franchise.contact_number, supplied_contact, ''),
      matched_franchise.franchise_number,
      'active',
      true
    );
  end if;

  update public.franchises
  set operator_id = new.id
  where id = matched_franchise.id;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
