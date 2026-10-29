-- Keep the franchise ID year aligned with the year in which a renewal is
-- approved. The stable 3- or 4-digit serial is preserved, and any linked
-- operator account receives the same current ID.

create or replace function private.align_franchise_number_with_renewal_year()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  previous_franchise_number text;
  renewed_franchise_number text;
begin
  if new.status <> 'approved'
     or new.status is not distinct from old.status then
    return new;
  end if;

  select franchise_number into previous_franchise_number
  from public.franchises
  where id = new.franchise_id
  for update;

  if not found then
    raise exception 'The franchise record was not found';
  end if;
  if previous_franchise_number !~ '^FR-[0-9]{4}-[0-9]{3,4}$' then
    raise exception 'The franchise ID must use FR-YYYY-NNNN format before renewal approval';
  end if;

  renewed_franchise_number := regexp_replace(
    previous_franchise_number,
    '^FR-[0-9]{4}-',
    'FR-' || extract(year from current_date)::integer::text || '-'
  );

  if exists (
    select 1 from public.franchises
    where franchise_number = renewed_franchise_number
      and id <> new.franchise_id
  ) then
    raise exception 'The renewed franchise ID % is already assigned to another record', renewed_franchise_number;
  end if;

  update public.franchises
  set franchise_number = renewed_franchise_number
  where id = new.franchise_id;

  update public.operators
  set franchise_number = renewed_franchise_number
  where user_id = new.operator_id
     or upper(btrim(franchise_number)) = upper(btrim(previous_franchise_number));

  return new;
end;
$$;

revoke all on function private.align_franchise_number_with_renewal_year() from public, anon;
grant execute on function private.align_franchise_number_with_renewal_year() to authenticated;

drop trigger if exists align_franchise_number_with_renewal_year on public.franchise_renewals;
create trigger align_franchise_number_with_renewal_year
after update of status on public.franchise_renewals
for each row
execute function private.align_franchise_number_with_renewal_year();
