# TFRO-MIS Supabase deployment checklist

Repository code cannot change hosted Supabase project settings or execute SQL
without administrator access. Complete these steps after pulling the stabilized
code.

## 1. Configure authentication URLs

In **Supabase Dashboard → Authentication → URL Configuration**, set:

- Local Site URL: `http://127.0.0.1:5500/html/index.html`
- Local Redirect URL: `http://127.0.0.1:5500/html/login.html`
- If you open the app as `localhost`, also add
  `http://localhost:5500/html/login.html`.
- For production, replace the Site URL with the deployed HTTPS login page and
  add that same URL to Redirect URLs.

The URL must match the address shown in the browser exactly. A different host,
port, protocol, or path is a different redirect URL.

## 2. Apply the final migration

For project **E-TFRO**, Codex applied and verified these migrations on
2026-08-16:

- `project_stabilization_auth_and_rbac`
- `secure_approval_rpc_invoker`

Do not paste them into E-TFRO again. The instructions below are for a fresh
project or disaster recovery.

Open **Supabase Dashboard → SQL Editor**, paste the complete contents of
`supabase/20260816_project_stabilization.sql`, and select **Run**.

The final result should list these two functions with
`anon_can_execute = false` and `authenticated_can_execute = true`:

- `approve_change_motor_request`
- `approve_franchise_application`

The migration also reports `unlinked_operators`, `unlinked_drivers`, and
`unlinked_franchises`. Zero is ideal. A non-zero count means a legacy record
could not be matched safely to exactly one account. Link those records in the
Table Editor by setting:

- `operators.user_id` to the operator's `profiles.id`
- `drivers.user_id` to the driver's `profiles.id`
- `franchises.operator_id` to the operator's `profiles.id`

Do not guess when two accounts have the same name.

E-TFRO still needs manual linking for these legacy records:

- Operator `Johnny M. Tan` (operators.id `1`)
- Franchise `FR-2026-017` / `Joshua R.` (franchises.id `3`)
- Franchise `FR-2026-001` / `Aerol R. Domirez` (franchises.id `1`)

Set each UUID only after confirming which Auth account owns the legacy record.

This migration assumes the existing TFRO setup scripts have already created the
tables. For a brand-new Supabase project, run the setup scripts in this order:

1. `setup-auth.sql`
2. `setup-dashboard.sql`
3. `setup-drivers.sql`
4. `setup-operators.sql`
5. `setup-franchises.sql`
6. `setup-violations.sql`
7. `setup-franchise-records.sql`
8. `setup-admin.sql`
9. `setup-audit-logs.sql`
10. `setup-integration.sql`
11. `setup-portal-access.sql`
12. `setup-storage.sql`
13. `20260813_security_and_integration_migration.sql`
14. `20260814_harden_security_definer_functions.sql`
15. `20260816_project_stabilization.sql`

Do not run `fix-auth-registration.sql` or
`20260814_repair_auth_confirmation_token.sql` unless Supabase Auth logs
specifically report a null `confirmation_token` conversion error.

## 3. Verify confirmation email behavior

In **Authentication → Providers → Email**:

- Keep **Allow new users to sign up** enabled.
- Decide whether **Confirm email** is required. The application supports either
  setting. When enabled, the new user is sent to `login.html` after confirming.

If confirmation emails fail, inspect **Authentication → Logs** first. Configure
custom SMTP only when the logs show a mail delivery problem; see
`SMTP-SETUP-GUIDE.md`.

## 4. Create a Staff account

E-TFRO currently has an existing Administrator account. Public registration
creates Operator accounts only. Drivers are submitted and managed by a verified
Operator and do not receive Auth accounts or passwords. If no Staff profile
exists, create the Staff user in **Authentication > Users**, then assign the
role in the SQL Editor:

```sql
update public.profiles
set role = 'staff',
    full_name = 'STAFF FULL NAME'
where id = (
  select id from auth.users where email = 'STAFF EMAIL'
);
```

The update should report exactly one affected row. Public registration is
deliberately unable to grant Admin or Staff, and the existing Administrator
account remains unchanged.

## 5. Run acceptance checks

Before testing a renewal, sign in as Administrator/Staff and open
**Franchises > Franchise Records**. Edit the franchise and select its
**Linked Operator Portal Account**. Confirm that the record also has an expiry
date, plate, engine, and chassis number. The Operator must have at least one
verified Driver record.

The Operator can then use the three **Applications** buttons on the portal
homepage. TFRO Staff processes renewal requests from
**Franchises > Franchise Renewals** and records document verification, vehicle
inspection, Treasurer assessment/payment, and final MTOP approval.

From the project directory:

```powershell
npm install
npm test
npm start
```

Open `http://127.0.0.1:5500/html/index.html` and complete the workflow in
`TEST-WORKFLOW.md`. Use a new email address for the registration test.
