# TFRO Landing Page Redesign - Task Tracker

## Plan
1. Create `html/login.html` - move existing login form from `index.html`.
2. Create `css/landing.css` - green/yellow government MIS landing page styles.
3. Redesign `html/index.html` - homepage with hero slideshow, header, hero content.
4. Update `js/register.js` - redirect to `login.html`.
5. Update `html/register.html` - "Sign in here" link to `login.html`.

## Steps
- [x] Step 1: Create `html/login.html`
- [x] Step 2: Create `css/landing.css`
- [x] Step 3: Redesign `html/index.html`
- [x] Step 4: Update `js/register.js`
- [x] Step 5: Update `html/register.html`

## Additional System-Wide Theme Conversion
- [x] Create `css/tfro-theme.css` (green/yellow override loaded after each page CSS)
- [x] Add `tfro-theme.css` link + TFRO logo to all admin pages (dashboard, profile, franchise, operator, driver, violation, payment, report, notification, auditlog)
- [x] Add `tfro-theme.css` link + TFRO logo to portal pages (driverportal, operatorportal, driverprofile, operatorprofile)
- [x] Add TFRO logo to auth pages (login, register)

## Audit Logging Instrumentation
- [x] Add audit logging to `js/operator.js` (Added Operator)
- [x] Add audit logging to `js/violation.js` (Recorded Violation)
- [x] Add audit logging to `js/report.js` (Generated Report)
- [x] Add audit logging to `js/operatorapplication.js` (Submitted Franchise Application)
- [x] Add audit logging to `js/operatorportal.js` (Submitted Change Motor Request)
- [x] Verified existing audit logging in `js/franchise.js`, `js/driver.js`, `js/application.js`, `js/motorequests.js`
- [x] Verified `audit_logs` schema matches `logAudit` helper and `auditlog.js` page
