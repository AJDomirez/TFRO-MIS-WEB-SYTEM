alter table public.operators
  add column if not exists email text;

update public.operators operator_record
set email = lower(auth_user.email)
from auth.users auth_user
where operator_record.user_id = auth_user.id
  and operator_record.email is distinct from lower(auth_user.email);

create index if not exists operators_email_idx
  on public.operators (lower(email));
