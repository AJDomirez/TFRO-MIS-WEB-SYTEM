-- Link an imported franchise to an existing Operator account when the
-- administrator does not explicitly supply operator_id.
create or replace function public.link_franchise_to_operator_account()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.operator_id is null and nullif(btrim(new.franchise_number), '') is not null then
    select operator_record.user_id
      into new.operator_id
    from public.operators operator_record
    where operator_record.user_id is not null
      and upper(btrim(operator_record.franchise_number)) = upper(btrim(new.franchise_number))
    order by operator_record.verified desc, operator_record.id
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.link_franchise_to_operator_account() from public, anon, authenticated;

drop trigger if exists link_franchise_to_operator_account on public.franchises;
create trigger link_franchise_to_operator_account
before insert or update of franchise_number, operator_id on public.franchises
for each row execute function public.link_franchise_to_operator_account();

-- When an Operator signs up after the administrator imported the franchise,
-- make the imported record immediately visible in that Operator's portal.
create or replace function public.link_operator_account_to_franchise()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is not null and nullif(btrim(new.franchise_number), '') is not null then
    update public.franchises franchise_record
    set operator_id = new.user_id
    where upper(btrim(franchise_record.franchise_number)) = upper(btrim(new.franchise_number))
      and franchise_record.operator_id is null;
  end if;
  return new;
end;
$$;

revoke all on function public.link_operator_account_to_franchise() from public, anon, authenticated;

drop trigger if exists link_operator_account_to_franchise on public.operators;
create trigger link_operator_account_to_franchise
after insert or update of user_id, franchise_number on public.operators
for each row execute function public.link_operator_account_to_franchise();

-- Backfill any existing unlinked rows now that the relationship is available.
update public.franchises franchise_record
set operator_id = operator_record.user_id
from public.operators operator_record
where franchise_record.operator_id is null
  and operator_record.user_id is not null
  and upper(btrim(franchise_record.franchise_number)) = upper(btrim(operator_record.franchise_number));
