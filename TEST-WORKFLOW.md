# TFRO-MIS End-to-End Workflow Test (Phase 6)

This is the acceptance test for the fully integrated TFRO-MIS workflow.
Run the SQL scripts in the order listed in TODO.md first, then follow these
18 steps to verify the complete cross-portal integration.

## Prerequisites
1. Run all SQL scripts in order (see TODO.md "SQL Setup Order").
2. Create the `franchise-documents` Storage bucket via `setup-storage.sql`.
3. Create test accounts in Supabase Auth with roles added to `profiles`:
   - 1 admin, 1 operator, 1 driver.
4. Start the server: `npm start` (opens http://127.0.0.1:5500).

---

## Step-by-Step Test

### Setup / Login
- [ ] **1.** Open the landing page → header shows TFRO logo + Lucena City logo + "Login to System" button.
- [ ] **2.** Click "Login to System" → navigates to `login.html`.
- [ ] **3.** Log in as the **operator** → routed to `operatorportal.html`.

### Operator Application (Phase 2)
- [ ] **4.** Open "Apply for Franchise" / `operatorapplication.html`.
- [ ] **5.** Try to submit with a missing document → blocked with a message listing the missing required PDF(s).
- [ ] **6.** Try uploading a non-PDF file → rejected (PDF only), and a file larger than 5 MB → rejected.
- [ ] **7.** Upload all **6 required PDFs** (Voters Certificate, Barangay Clearance, Cedula, OHCR, Insurance, PMBL) + fill all fields.
- [ ] **8.** Submit → success message; a `franchise_applications` row is created with **status `pending_review`** (NOT an approved franchise). Verify in Supabase Table Editor that **no** `franchises` row was auto-created.

### Admin Review (Phase 3)
- [ ] **9.** Log in as **admin** → open "Franchise Applications" (`application.html`). The new application appears as **Pending Review**.
- [ ] **10.** Open the review modal → verify all operator info is displayed and all 6 documents are listed with links to open/download each PDF.
- [ ] **11.** Mark each document **Verified**. While any doc is unverified or info is not marked complete, the **Accept** button is disabled.
- [ ] **12.** Mark "Information Complete" → **Accept** button becomes enabled.
- [ ] **13.** Click **Accept** → application status becomes **Approved**; a `franchises` record is **auto-created** (with `operator_id` = operator's user id, `application_id` linked) and a `tricycles` row is created. Admin name/date recorded. Operator gets a **notification**.

### Driver Assignment + License (Phase 5)
- [ ] **14.** As admin, open **Drivers** → assign the driver to the approved operator/franchise (writes `driver_assignments` + driver FKs). Verify the driver's license shows **Not Verified** (not compliant).
- [ ] **15.** As admin, **Verify License** → driver license status becomes **Verified** and compliance becomes compliant; driver gets a notification.

### Cross-Portal Visibility
- [ ] **16.** Log in as the **operator** → verify the approved franchise shows in "My Franchise", the assigned driver appears in "Assigned Drivers", and the license/franchise link is via FK.
- [ ] **17.** Log in as the **driver** → verify they see their assigned operator and franchise (via FK), plus their own license info.

### Change Motor / MTOP (Phase 4)
- [ ] **18.** As operator, submit a **Change Motor/MTOP** request (new engine/chassis/plate + optional PDF). As admin, open **Change Motor Requests** → approve → franchise/tricycle updated with new details, **old info preserved** in `change_motor_history`, operator notified. (Or reject with a reason → request status `rejected`, operator notified.)

### Security (Role-Based Access)
- [ ] **Optional.** Verify a **driver** cannot open admin pages (`application.html`, `dashboard.html`, etc.) and is redirected/signed out. Verify RLS prevents an operator from reading another operator's applications/documents.

---

## Result
If all steps pass, the TFRO-MIS integrated workflow is complete and verified.
