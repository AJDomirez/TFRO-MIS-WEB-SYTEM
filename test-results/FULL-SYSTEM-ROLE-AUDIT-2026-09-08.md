# TFRO-IMIS Full-System Role Audit

Date: 2026-09-08
Environment: Linked Supabase project and GitHub Pages production build
Test data: `test-data-kit` fictional records only

## Result

Core four-role workflow: PASS after two database fixes.

## Passed checks

- Admin, Staff, Operator, and Traffic Enforcer authentication
- Server-controlled profile role resolution
- Admin operator and franchise creation/linking
- Operator driver-picture upload and driver submission
- Operator Change Motor picture and PDF uploads
- Operator Change Motor request submission
- Admin Change Motor approval
- Automatic franchise engine, chassis, and plate update
- Preservation of old motor details in `change_motor_history`
- Traffic Enforcer ticket-photo upload and ticket submission
- Operator Treasurer receipt upload and receipt submission
- Staff violation payment and release recording
- Operator eligible renewal submission
- Upload and storage of all nine renewal requirements
- Admin document, inspection, assessment, and payment verification
- Admin renewal approval
- Automatic Franchise Record expiry update
- Preservation of the previous MTOP expiry
- Operator isolation from Audit Log rows
- Traffic Enforcer denial from payment creation
- Project validation, production build, and database schema lint

## Defects found and fixed

1. `renewal_documents` rejected the UI's `payment_receipt` document type. The
   database constraint now accepts the current nine-document UI while retaining
   the legacy `certificate_registration` type for compatibility.
2. Renewal approval updated the new expiry but did not preserve the old expiry.
   The approved-renewal synchronization trigger now sets
   `previous_mtop_expiration` and keeps the Franchise Record synchronized.

## Notes

- The database intentionally allows TFRO Staff to insert/read/update franchise
  records through policies named `Staff can ...`; the current Staff UI does not
  expose the Franchise Records page.
- The test kit's `picture_2x2` renewal sample is a PDF, while the current UI
  correctly requires JPG or PNG. The fictional PNG evidence image was used for
  that test field.
- Supabase Advisor still reports two warnings: leaked-password protection is
  disabled, and the authenticated receipt RPC is a public `SECURITY DEFINER`
  function. Its ownership checks passed the tested Operator workflow, but it
  should remain on the security-review list.

## Test records retained

- Franchise: `TEST-FR-E2E-001`
- Driver license: `TEST-LIC-E2E-001`
- Change Motor request: `TEST-CM-E2E-001`
- Ticket: `TEST-E2E-2026-001`
- Renewal: `TEST-REN-E2E-001`
- MTOP: `TEST-MTOP-E2E-001`

These records are explicitly test-only and may be retained for demonstrations
or removed after acceptance testing.
