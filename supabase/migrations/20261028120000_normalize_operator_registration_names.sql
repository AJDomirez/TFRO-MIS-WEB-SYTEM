-- Match operator registration names regardless of whether the official record
-- uses "LAST, FIRST MIDDLE" or the registration form uses "First Middle Last".
-- The exact franchise number is still required before an account is linked.

create or replace function public.normalize_person_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select string_agg(token, ' ' order by token)
  from regexp_split_to_table(lower(coalesce(p_name, '')), '[^[:alnum:]]+') as token
  where token <> '';
$$;

revoke all on function public.normalize_person_name(text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'operator');
  supplied_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  supplied_contact text := nullif(btrim(new.raw_user_meta_data ->> 'contact_number'), '');
  supplied_address text := nullif(btrim(new.raw_user_meta_data ->> 'address'), '');
  supplied_franchise text := nullif(upper(btrim(new.raw_user_meta_data ->> 'franchise_number')), '');
  supplied_enforcer_id text := nullif(upper(btrim(new.raw_user_meta_data ->> 'enforcer_id')), '');
  roster public.traffic_enforcers%rowtype;
  matched_operator public.operators%rowtype;
  matched_franchise public.franchises%rowtype;
begin
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

  perform pg_advisory_xact_lock(hashtextextended(coalesce(lower(supplied_name), '') || '|' || coalesce(supplied_franchise, ''), 0));
  select * into matched_franchise from public.franchises f
  where upper(btrim(f.franchise_number)) = supplied_franchise
    and public.normalize_person_name(f.operator_name) = public.normalize_person_name(supplied_name)
  order by f.id limit 1 for update;

  if found then
    select * into matched_operator from public.operators o
    where upper(btrim(o.franchise_number)) = supplied_franchise
      and public.normalize_person_name(o.full_name) = public.normalize_person_name(supplied_name)
    order by o.verified desc, o.id limit 1 for update;
    if matched_franchise.operator_id is not null and matched_franchise.operator_id <> new.id then
      raise exception 'This franchise is already linked to another account. Contact TFRO staff.' using errcode = '23505';
    end if;
    if matched_operator.id is not null and matched_operator.user_id is not null and matched_operator.user_id <> new.id then
      raise exception 'This operator record is already linked to another account. Contact TFRO staff.' using errcode = '23505';
    end if;

    insert into public.profiles (id, role, full_name, contact_number, account_status)
    values (new.id, 'operator', matched_franchise.operator_name,
            coalesce(matched_franchise.contact_number, supplied_contact), 'active')
    on conflict (id) do update set role = 'operator', full_name = excluded.full_name,
      contact_number = coalesce(excluded.contact_number, public.profiles.contact_number),
      account_status = 'active';

    if matched_operator.id is not null then
      update public.operators set user_id = new.id, email = coalesce(email, lower(new.email)), verified = true, status = 'active'
      where id = matched_operator.id;
    else
      insert into public.operators (user_id, full_name, email, address, contact_number, franchise_number, status, verified)
      values (new.id, matched_franchise.operator_name, lower(new.email), coalesce(matched_franchise.address, supplied_address, ''),
              coalesce(matched_franchise.contact_number, supplied_contact, ''), matched_franchise.franchise_number, 'active', true);
    end if;
    update public.franchises set operator_id = new.id where id = matched_franchise.id;
  else
    insert into public.profiles (id, role, full_name, contact_number, account_status)
    values (new.id, 'operator', supplied_name, supplied_contact, 'pending_verification')
    on conflict (id) do update set role = 'operator', full_name = coalesce(excluded.full_name, public.profiles.full_name),
      contact_number = coalesce(excluded.contact_number, public.profiles.contact_number),
      account_status = 'pending_verification';
    insert into public.operators (user_id, full_name, email, address, contact_number, franchise_number, status, verified)
    values (new.id, supplied_name, lower(new.email), coalesce(supplied_address, ''), coalesce(supplied_contact, ''),
            supplied_franchise, 'inactive', false);
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
