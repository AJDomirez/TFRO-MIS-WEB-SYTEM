# TFRO MIS Full-System Test Kit

All names, numbers, images, and documents in this folder are fictional. Every evidence document is marked **SAMPLE / FOR SYSTEM TESTING ONLY**.

## Test accounts

Use `csv/accounts.csv` as the account plan. Create the Administrator and Staff accounts internally, register the Traffic Enforcer only after adding its roster ID, and register the Operator with franchise number `TEST-FR-2026-001`. Replace the placeholder UUID values in relational CSV files with the UUIDs created by Supabase Auth.

The current system has four login roles: `admin`, `staff`, `operator`, and `traffic_enforcer`. A Driver is a managed record under an Operator and does not have a login portal.

## Recommended order

1. Create the Admin and Staff Auth users and assign their `profiles.role` values.
2. Import `csv/franchises-import.csv` using the Franchises page CSV importer.
3. Add the Traffic Enforcer roster entry from `csv/traffic-enforcers.csv`, then sign up using the matching Enforcer ID.
4. Sign up the Operator using franchise `TEST-FR-2026-001`; the existing franchise should link automatically.
5. As Operator, create the Driver using `csv/drivers.csv` as the field guide.
6. Test a new franchise application using the six files in `requirements/franchise-application/`.
7. Test a renewal using the nine files in `requirements/renewal/`.
8. As Traffic Enforcer, record the violation details in `csv/violations.csv` and upload `images/sample-tfro-violation-ticket.png`.
9. As Operator, submit `images/sample-city-treasurer-receipt.png` as payment evidence.
10. As Staff, record the payment/release information from `csv/payments.csv`.
11. As Admin, review TFRO-009 and TFRO-010, edit fields, generate PDFs, and send them to the Operator.
12. Test Change Motor using `requirements/change-motor/sample-change-motor-support.pdf`.

## Important CSV note

`franchises-import.csv` is formatted for the application's built-in Franchise CSV importer. The other CSV files are safe field guides or Supabase Table Editor templates; foreign-key IDs must be replaced with IDs from your own test records before importing.

## Sample credentials

The password in `accounts.csv` is deliberately fictional test data. Change it if these accounts are created on an internet-accessible project, and never reuse it for real accounts.
