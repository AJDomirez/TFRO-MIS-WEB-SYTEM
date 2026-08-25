-- Link legacy name-only Driver records to a verified Operator without relying
-- on generated IDs. If duplicate Operator rows exist, use the oldest verified
-- active record for the matching operator name.
with matched_operators as (
  select
    driver_record.id as driver_id,
    min(operator_record.id) as operator_id
  from public.drivers driver_record
  join public.operators operator_record
    on lower(trim(operator_record.full_name)) = lower(trim(driver_record.operator_name))
   and operator_record.verified
   and operator_record.status = 'active'
  where driver_record.operator_id is null
  group by driver_record.id
)
update public.drivers driver_record
set operator_id = matched_operators.operator_id
from matched_operators
where driver_record.id = matched_operators.driver_id;
