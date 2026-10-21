# TFRO-IMIS Deployment and Two-Week Pilot Testing Plan

## 1. Project and Deployment Information

| Item | Details to complete |
|---|---|
| Capstone project | TFRO Integrated Management Information System (TFRO-IMIS) |
| Researchers | ______________________________ |
| Adviser | ______________________________ |
| End-user organization | Tricycle Franchising and Regulatory Office (TFRO), Lucena City |
| Deployment location | ______________________________ |
| End-user representative and designation | ______________________________ |
| Initial deployment date and time | ______________________________ |
| Two-week pilot period | __________________ to __________________ |
| Intended users | Head Administrator, Restricted Administrator, TFRO Staff, Traffic Enforcer, and selected Tricycle Operator(s) |
| Expected number of users per role | Head Admin: ___; Restricted Admin: ___; Staff: ___; Enforcer: ___; Operator: ___ |
| Production URL | ______________________________ |
| Technical support contacts | Primary: __________________; Backup: __________________ |

## 2. Purpose and Success Criteria

The pilot will determine whether TFRO-IMIS can support actual TFRO work in a controlled operational setting for two weeks. It will cover account access, franchise and driver records, applications, renewals, change-motor requests, traffic violations, payments and vehicle release, notifications, reports, and audit records.

The pilot is successful when:

1. Authorized users can sign in and are routed only to pages allowed for their roles.
2. At least one complete end-to-end transaction is performed for each workflow applicable during the pilot.
3. No critical security, privacy, data-loss, or workflow-blocking issue remains unresolved at pilot close.
4. Submitted and approved records remain linked to the correct operator, driver, franchise, tricycle, reviewer, and supporting files.
5. Users can complete their assigned core tasks after orientation and hands-on training.
6. Significant activities, problems, fixes, and feedback have dated evidence.
7. The end-user representative reviews the results and signs the Deployment/Pilot Testing Certification.

If no real case is available for a workflow during the two weeks, use an authorized, clearly labeled test record in a controlled test session. Do not create fake production records without the end-user representative's approval.

## 3. Pilot Scope and Role Assignment

| Role | Pilot responsibilities | Core functions to test |
|---|---|---|
| Head Administrator | Own pilot decisions, manage internal accounts, oversee records, reports, settings, and audit evidence | Dashboard, Admin Users, enforcer roster, reports, audit log, account history |
| Restricted Administrator | Review operational submissions without destructive/account-management authority | Applications, drivers, franchises, renewals, change-motor requests, notifications |
| TFRO Staff | Process violations, receipt verification, settlement, and release | Violations, payments, official receipt and release details, printouts |
| Traffic Enforcer | Perform field verification and issue tickets | Driver search/QR verification, violation ticket entry, ticket photograph upload |
| Operator | Submit and monitor self-service transactions | Registration/login, franchise application, driver submission, renewal, change motor, receipts, notifications |
| Researchers | Prepare, observe, support, document, triage, fix approved in-scope issues, and maintain logs | Monitoring log, issue log, evidence register, daily backup/health checks |
| End-user representative | Approve schedule and participants, validate office procedures, confirm feedback and completion | Daily coordination, issue priority, final evaluation and certification |

Drivers are managed records and do not need login accounts. Pilot accounts must be individual accounts; shared Head Administrator, Staff, or Enforcer credentials are not permitted.

## 4. Phase A — Pre-Deployment Readiness (Complete Before Day 1)

### A.1 Coordination and approvals

- Confirm the deployment location, two-week dates, operating hours, participating personnel, and end-user representative.
- Obtain permission for pilot use, screenshots, photographs, attendance records, and processing of test or real operational data.
- Explain the system's purpose, scope, known limitations, support process, feedback process, and the distinction between a pilot and final turnover.
- Identify which real workflows are expected during the pilot and which require approved test data.
- Prepare consent/privacy notices for identifiable photographs and avoid exposing passwords, private documents, QR tokens, or personal data in evidence.

### A.2 Technical readiness

- [ ] Run `npm test` and retain a dated screenshot or text result. Baseline on 21 October 2026: project validation passed for 43 JavaScript, 26 HTML, and 28 CSS files.
- [ ] Test the production build with `npm run build` and inspect the generated site.
- [ ] Confirm the production HTTPS URL, browser compatibility, internet stability, and all end-user devices.
- [ ] Verify the deployed version matches the approved pilot build; record the Git commit/version and deployment date.
- [ ] Verify Supabase authentication URLs, email-confirmation behavior, database migrations, storage buckets, Row Level Security, and server-side functions.
- [ ] Confirm that no service-role secret or private credential is present in client-side files or screenshots.
- [ ] Export or snapshot the database before pilot initialization; record who controls restoration and perform a recovery walkthrough or test where feasible.
- [ ] Verify audit logging, timestamps, notifications, file upload/download, PDF generation/printing, CSV export, and logout/session behavior.
- [ ] Prepare individual pilot accounts for every participating role and securely issue temporary credentials.
- [ ] Prepare approved sample PDFs/images and uniquely labeled pilot records; do not overwrite actual office records for testing.
- [ ] Define rollback: pause new entries, notify the representative, preserve logs/evidence, restore the last verified build or database backup, then revalidate before resuming.

### A.3 Pre-pilot acceptance test

Use `TEST-WORKFLOW.md` and the test-data kit to verify, at minimum:

- authentication, role routing, and denial of unauthorized pages/records;
- operator submission of a franchise application with six required PDFs;
- administrator document verification and approval/rejection with notification;
- franchise, tricycle, operator, and driver linkage and driver verification;
- renewal document review, inspection/assessment, approval, expiry update, and printable outputs;
- change-motor approval/rejection, preservation of old details, forms, and notification;
- enforcer driver verification and violation ticket/photo submission;
- Staff receipt verification, payment/commission recording, release, and printouts;
- dashboard totals, reports/CSV, audit entries, and account history.

Record each test as Pass, Fail, or Not Applicable. A failed critical control—login, role isolation, approval integrity, RLS, data persistence, backup/restore, or exposure of sensitive data—blocks the pilot until corrected and retested.

### A.4 Materials to prepare

- orientation slides covering objectives, schedule, roles, limitations, support, privacy, and evaluation;
- role-based quick guides for Administrator, Staff, Enforcer, and Operator;
- attendance sheet and photograph consent record;
- Pilot Monitoring Log, Issues and Corrective Actions Log, and Evidence Register;
- approved evaluation questionnaire and end-of-pilot interview guide;
- support contact card with reporting format: date/time, user role, page/workflow, record number, action attempted, exact message, screenshot, and operational impact.

## 5. Phase B — Deployment, Orientation, and Training

### Initial deployment procedure

1. Meet the end-user representative and confirm the approved pilot scope and participants.
2. Record the date/time, location, production URL, build/version, device/browser, database environment, and network used.
3. Publish or verify the approved build and perform a smoke test on the end-user's actual equipment.
4. Activate individual accounts and have each participant confirm correct role routing.
5. Verify a harmless create/read/update workflow using an approved pilot record; confirm notifications and audit entries.
6. Check upload, download, print, report, logout, and recovery procedures.
7. Record any deployment issue, action taken, owner, resolution time, status, and evidence reference.

### Orientation agenda (about 45 minutes)

1. TFRO-IMIS background and purpose.
2. Pilot objectives, boundaries, two-week schedule, and success criteria.
3. User roles, major modules, and workflow handoffs.
4. Known limitations and activities that remain outside the approved project scope.
5. Account security, personal-data handling, consent, and correct logout practice.
6. How to report errors, request assistance, and submit recommendations.
7. Daily monitoring and end-of-pilot evaluation procedure.

### Hands-on training (about 2–3 hours)

Use the participants' assigned accounts and let every user personally perform the relevant tasks:

- **All users:** sign in, recognize the correct portal, navigate, update permitted profile data, read notifications, report a problem, and sign out.
- **Operator:** submit/track an application, add a driver, upload requirements, start an eligible renewal or change-motor request, and respond to returned remarks.
- **Enforcer:** search/verify a driver, create a violation ticket, select involved enforcer(s), and upload ticket evidence.
- **TFRO Staff:** locate a violation, inspect receipt evidence, record payment/release details, and produce permitted printouts.
- **Administrator:** review documents, request correction or approve/reject, verify a driver, inspect notifications/audit entries, and generate a report.
- **Head Administrator:** create or inspect restricted accounts, maintain the enforcer roster, review account history, and exercise only authorized settings.

Use a short competency checklist. Retrain any participant who cannot complete a core task without step-by-step prompting. Collect the signed attendance sheet, training materials, screenshots, and clear activity photographs.

## 6. Phase C — Two-Week Pilot Schedule

“Day” means an office working day. Adjust dates for weekends and holidays while preserving ten operational monitoring days.

| Day | Operational focus | Researcher actions | Required evidence/output |
|---|---|---|---|
| 1 | Deployment, orientation, account activation, and baseline transactions | Observe first use closely; verify access, devices, logs, and support channel | Deployment photos, environment record, attendance, role/account checklist, Day 1 log |
| 2 | Operator registration/login, profile, franchise/driver records | Observe navigation and data-entry difficulties; verify ownership isolation | Usage screenshots, monitoring entries, user observation notes |
| 3 | Franchise application and Administrator review | Follow one submission through document review, decision, notification, and audit | Application/status evidence with personal data redacted; issue entries |
| 4 | Renewal workflow | Exercise eligibility, requirements, review, inspection/assessment, status, forms, and expiry behavior | Renewal checklist, screenshots, generated-output reference |
| 5 | Change-motor workflow and Week 1 review | Verify pending-state protection, approval/rejection, old-value history, notification; summarize Week 1 | Change-motor evidence, backup/health record, Week 1 issue summary |
| 6 | Enforcer field workflow | Observe driver search/QR verification and ticket/photo entry on the actual device/network | Activity photo, ticket reference, usability and connectivity observations |
| 7 | Violation-to-payment workflow | Verify separation of duties, receipt controls, settlement/release, commission, and printouts | Linked ticket/payment evidence, role-control results, monitoring entries |
| 8 | Reports, dashboard, notifications, and audit | Reconcile selected records against totals, CSV/report output, notification, and audit trail | Reconciliation sheet, redacted export/screenshot, discrepancy log |
| 9 | Corrective-action retest and normal use | Retest resolved issues with the reporting user; avoid disrupting normal work | Before/after evidence, retest result, updated issue status |
| 10 | Final utilization, evaluation, and closeout | Collect evaluation, interview representative, review open issues, confirm backup and continuity | Evaluation forms, completion photos, final logs, signed/queued certification |

### Daily monitoring routine

At the start of each day, check site availability, login, database/storage connectivity, known open issues, and the previous day's backup/restore point. During office use, observe without unnecessarily interfering. At the end of each day:

1. Record users/roles active and workflows/transaction references used.
2. Record each error, difficulty, request for help, observation, and recommendation.
3. Classify issues and assign an owner and target response time.
4. Confirm important records saved correctly and review relevant audit/notification entries.
5. Save evidence using the agreed file naming scheme and restrict access to sensitive files.
6. Brief the end-user representative on critical/high issues and any change to pilot operations.

## 7. Issue Handling and Change Control

| Severity | Definition | Target action |
|---|---|---|
| Critical | Data loss/corruption, unauthorized access, privacy/security exposure, or system unavailable for all users | Stop affected workflow immediately; notify representative; preserve evidence; rollback/contain; begin response at once |
| High | A core workflow cannot be completed and no safe workaround exists | Acknowledge immediately; prioritize same working day; retest before return to use |
| Medium | Function works with a safe workaround or causes material usability difficulty | Log, evaluate, and schedule during pilot if low-risk and in scope |
| Low | Cosmetic issue, minor inconvenience, or enhancement suggestion | Log for prioritization; may be deferred |

Every change must link to an issue number and record the affected files/database objects, approver, backup made, implementation time, test result, and deployment version. Apply only approved, in-scope, technically feasible changes needed for function, security, data integrity, or usability. Put out-of-scope suggestions in “Future Enhancements.” Do not make untracked production changes during active office transactions.

## 8. Logs and Evidence Templates

### Pilot Testing Monitoring Log (Annex E)

| Date/time | User role | Activity/system usage | Problem/observation | Action taken | Status | Evidence ID |
|---|---|---|---|---|---|---|
| | | | | | Open/Monitoring/Resolved/Deferred | |

### Issues and Corrective Actions Log (Annex G)

| No. | Issue/feedback | Date reported | Severity | Action/modification | Date resolved | Retest result | Status |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |

### Evidence Register

| Evidence ID | Date | Activity | File name/location | Caption/description | Consent/privacy checked by |
|---|---|---|---|---|---|
| | | | | | |

Use file names such as `YYYY-MM-DD_Day-03_Franchise-Review_Fig-05.jpg`. Each photograph or screenshot must have a figure number, date, meaningful caption, and brief description. Prefer candid activity evidence showing participation and actual use. Redact passwords, email links/tokens, identification numbers, addresses, receipts, licence details, faces without consent, and unrelated personal records.

## 9. End-of-Pilot Evaluation

On Day 10, administer the approved capstone evaluation instrument and conduct a short group or individual feedback session. Capture:

- overall experience and task completion confidence;
- strengths and useful features;
- errors, confusing steps, and usability concerns;
- accuracy and usefulness of records, reports, forms, and notifications;
- performance and reliability on actual devices/network;
- adequacy of orientation, training, and support;
- requested changes and their priority;
- readiness/willingness to continue using TFRO-IMIS.

Summarize quantitative results using the research methodology and anonymize qualitative comments where appropriate. Reconcile all monitoring and issue logs, list unresolved items with owners and planned disposition, and distinguish completed fixes from future enhancements.

## 10. Closeout and Final Documentation

Prepare a concise deployment narrative describing what was deployed, where and when, participants, orientation/training, actual use, major issues, corrective actions, feedback, and the overall pilot result. Before requesting certification, confirm that evidence supports the narrative and that open risks are disclosed.

Final submission package:

- **Annex A:** this Deployment/Implementation Plan, completed and approved;
- **Annex B:** numbered photographic documentation with captions and consent compliance;
- **Annex C:** signed orientation and training attendance sheet;
- **Annex D:** orientation slides, user manual, and role-based quick guides;
- **Annex E:** completed Pilot Testing Monitoring Log;
- **Annex F:** dated, captioned, and redacted system-usage screenshots;
- **Annex G:** completed Issues and Corrective Actions Log with retest results;
- **Annex H:** evaluation instruments, consolidated results, and feedback summary;
- **Annex I:** Deployment (Pilot Testing) Certification signed by the authorized representative;
- **Annex J:** technical readiness results, deployment/version record, backup record, permissions/consent, generated reports, and other supporting documents.

## 11. Approval and Sign-Off

| Role | Name and signature | Date |
|---|---|---|
| Researcher/Team Leader | | |
| Technical Lead | | |
| End-User Representative | | |
| Adviser | | |

Pilot status at close: **Successful / Successful with conditions / Extended / Unsuccessful**

Conditions, unresolved issues, or next actions:

______________________________________________________________________________

______________________________________________________________________________
