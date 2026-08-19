+create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  supplied_contact text := nullif(btrim(new.raw_user_meta_data ->> 'contact_number'), '');
  supplied_address text := nullif(btrim(new.raw_user_meta_data ->> 'address'), '');
  supplied_franchise text := nullif(upper(btrim(new.raw_user_meta_data ->> 'franchise_number')), '');
begin
  insert into public.profiles (id, role, full_name, contact_number)
  values (new.id, 'operator', supplied_name, supplied_contact)
  on conflict (id) do update
  set full_name = coalesce(excluded.full_name, public.profiles.full_name),
      contact_number = coalesce(excluded.contact_number, public.profiles.contact_number);

  if supplied_name is not null and supplied_contact is not null
     and supplied_address is not null and supplied_franchise is not null then
    update public.operators
    set full_name = supplied_name, email = lower(new.email), address = supplied_address,
        contact_number = supplied_contact, franchise_number = supplied_franchise
    where user_id = new.id;

    if not found then
      insert into public.operators (
        user_id, full_name, email, address, contact_number,
        franchise_number, status, verified
      ) values (
        new.id, supplied_name, lower(new.email), supplied_address, supplied_contact,
        supplied_franchise, 'active', false
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
