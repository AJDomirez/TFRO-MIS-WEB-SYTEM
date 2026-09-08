begin;

-- The current renewal form uploads a payment receipt as one of its nine
-- requirements. Keep the legacy certificate_registration value readable for
-- existing records while allowing the value emitted by the live UI.
alter table public.renewal_documents
  drop constraint if exists renewal_documents_doc_type_check;

alter table public.renewal_documents
  add constraint renewal_documents_doc_type_check
  check (doc_type = any (array[
    'payment_receipt'::text,
    'official_receipt'::text,
    'voters_certificate'::text,
    'insurance'::text,
    'cedula'::text,
    'barangay_clearance'::text,
    'drivers_license'::text,
    'picture_2x2'::text,
    'pmbl_certification'::text,
    'certificate_registration'::text
  ]));

notify pgrst, 'reload schema';

commit;
