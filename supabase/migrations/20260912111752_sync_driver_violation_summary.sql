-- Keep the Driver registry summary derived from the authoritative violation rows.
-- A paid case remains part of the recorded history; dismissed cases do not count.
create or replace function private.refresh_driver_violation_summary(p_driver_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_driver_id is null then
    return;
  end if;

  update public.drivers as driver
     set violation_count = (
           select count(*)::integer
             from public.violations as violation
            where violation.driver_id = p_driver_id
              and violation.status <> 'dismissed'
         ),
         compliance = case
           when driver.license_status = 'verified'
            and not exists (
              select 1
                from public.violations as violation
               where violation.driver_id = p_driver_id
                 and violation.status = 'pending'
            )
           then 'compliant'
           else 'non-compliant'
         end
   where driver.id = p_driver_id;
end;
$$;

revoke all on function private.refresh_driver_violation_summary(bigint)
from public, anon, authenticated;

create or replace function private.sync_driver_violation_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_driver_violation_summary(old.driver_id);
    return old;
  end if;

  perform private.refresh_driver_violation_summary(new.driver_id);

  if tg_op = 'UPDATE' and old.driver_id is distinct from new.driver_id then
    perform private.refresh_driver_violation_summary(old.driver_id);
  end if;

  return new;
end;
$$;

revoke all on function private.sync_driver_violation_summary()
from public, anon, authenticated;

create or replace function private.enforce_driver_compliance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.compliance := case
    when new.license_status = 'verified'
     and not exists (
       select 1
         from public.violations as violation
        where violation.driver_id = new.id
          and violation.status = 'pending'
     )
    then 'compliant'
    else 'non-compliant'
  end;
  return new;
end;
$$;

revoke all on function private.enforce_driver_compliance()
from public, anon, authenticated;

drop trigger if exists enforce_driver_compliance on public.drivers;
create trigger enforce_driver_compliance
before insert or update of license_status
on public.drivers
for each row execute function private.enforce_driver_compliance();

drop trigger if exists sync_driver_violation_summary on public.violations;
create trigger sync_driver_violation_summary
after insert or delete or update of driver_id, status
on public.violations
for each row execute function private.sync_driver_violation_summary();

-- Connect older Staff-entered Driver violations that predate driver_id linking.
-- Only unambiguous, exact normalized name matches are repaired automatically.
with unique_driver_names as (
  select lower(btrim(full_name)) as normalized_name, min(id) as driver_id
    from public.drivers
   group by lower(btrim(full_name))
  having count(*) = 1
)
update public.violations as violation
   set driver_id = match.driver_id
  from unique_driver_names as match
 where violation.driver_id is null
   and violation.subject_type = 'driver'
   and lower(btrim(violation.subject_name)) = match.normalized_name;

-- Repair existing Driver summaries immediately when this migration is applied.
update public.drivers as driver
   set violation_count = (
         select count(*)::integer
           from public.violations as violation
          where violation.driver_id = driver.id
            and violation.status <> 'dismissed'
       ),
       compliance = case
         when driver.license_status = 'verified'
          and not exists (
            select 1
              from public.violations as violation
             where violation.driver_id = driver.id
               and violation.status = 'pending'
          )
         then 'compliant'
         else 'non-compliant'
       end;
