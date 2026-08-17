alter table public.franchise_renewals
  add constraint franchise_renewals_approval_requirements_check
  check (
    status <> 'approved'
    or (
      franchise_check_status <> 'revoked'
      and documents_complete
      and inspection_passed
      and assessment_number is not null
      and assessed_amount is not null
      and payment_status = 'paid'
      and payment_or_number is not null
      and mtop_number is not null
      and new_expiration_date is not null
    )
  );
