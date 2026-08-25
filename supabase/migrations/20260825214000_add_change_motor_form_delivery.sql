alter table public.change_motor_requests
  add column if not exists old_motor_brand text,
  add column if not exists old_motor_model text,
  add column if not exists forms_sent_to_operator_at timestamptz,
  add column if not exists forms_sent_by uuid references public.profiles(id) on delete set null;

comment on column public.change_motor_requests.old_motor_brand is
  'Motor make/brand captured before an approved Change Motor request updates the franchise.';
comment on column public.change_motor_requests.old_motor_model is
  'Motor model/year captured before an approved Change Motor request updates the franchise.';
comment on column public.change_motor_requests.forms_sent_to_operator_at is
  'Set by TFRO Admin only when TFRO-002 and TFRO-007 are released to the operator portal.';
