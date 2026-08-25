import { supabase } from "./supabase.js";
import { requireRole, signOutAndRedirect } from "./auth-guard.js";
import { logAudit } from "./audit-helper.js";
import { bindDateCsvExport, isWithinDateRange } from "./csv-export.js";

async function openSavedSubmissionForm(options) {
  const { openRenewalPdfForm } = await import("./pdf-form.js?v=20260826-024500");
  openRenewalPdfForm(options);
}

const DOC_LABELS = {
  voters_certificate: "Latest Voter's Certificate", cedula: "Latest Cedula",
  barangay_clearance: "Barangay Clearance", drivers_license: "Driver's License",
  picture_2x2: "2×2 Picture", pmbl_certification: "PMBL Certification",
  official_receipt: "Official Receipt — For Hire", certificate_registration: "Certificate of Registration — For Hire",
  insurance: "Insurance — Third-Party & Passenger Liability",
};
delete DOC_LABELS.certificate_registration;
Object.assign(DOC_LABELS, {
  payment_receipt: "a) City Treasurer Payment Receipt",
  official_receipt: "b) Updated Motorcycle OR - For Hire",
  voters_certificate: "c) Latest Voter's Certificate",
  insurance: "d) Third-Party & Passenger Liability Insurance",
  cedula: "e) Latest Community Tax Certificate / Cedula",
  barangay_clearance: "f) Barangay Clearance",
  drivers_license: "g) Driver's License",
  picture_2x2: "h) 2x2 Picture",
  pmbl_certification: "i) PMBL Membership Certification",
});
const DOC_ORDER = [
  "payment_receipt", "official_receipt", "voters_certificate", "insurance",
  "cedula", "barangay_clearance", "drivers_license", "picture_2x2", "pmbl_certification",
];
const INSPECTION_KEYS = ["functional_horn", "signal_lights", "head_tail_lights", "sidecar_interior_light", "sidecar_light_kept_on", "anti_noise_muffler", "body_number_sticker", "garbage_receptacle", "clean_windshield"];
const TYPE_LABELS = { regular: "Regular", expired_or: "Expired OR", change_motor: "Change Motor" };
let renewals = [];
let currentRenewal = null;
let currentDocuments = [];
let currentProfile = null;
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" })[char]);

function labelStatus(status) {
  if (status === "needs_correction") return "Not Approved — Incomplete";
  return String(status || "pending_review").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function badge(status) {
  const cls = status === "approved" ? "approved" : ["needs_correction", "rejected"].includes(status) ? "rejected" : "pending";
  return `<span class="status-badge ${cls}">${escapeHtml(labelStatus(status))}</span>`;
}
function detail(label, value, html = false) {
  return `<div><label>${escapeHtml(label)}</label><strong>${html ? value : escapeHtml(value || "—")}</strong></div>`;
}

async function loadRenewals() {
  const { data, error } = await supabase.from("franchise_renewals").select("*, franchises(franchise_number, status, birth_date, birth_place, civil_status, motorcycle_brand, motorcycle_year_model, chassis_cr_number, route)").order("created_at", { ascending: false });
  if (error) return alert(`Could not load renewals: ${error.message}`);
  renewals = data || [];
  renderTable();
}

function filteredRenewals() {
  const term = byId("searchInput").value.trim().toLowerCase();
  const filter = byId("statusFilter").value;
  return renewals.filter((renewal) => isWithinDateRange(renewal.created_at) &&
    (filter === "all" || renewal.status === filter) &&
    [renewal.renewal_code, renewal.operator_name, renewal.franchises?.franchise_number]
      .some((value) => String(value || "").toLowerCase().includes(term)));
}

function renderTable() {
  const rows = filteredRenewals();
  byId("renewalsTable").innerHTML = rows.length ? rows.map((renewal) => `<tr>
    <td>${escapeHtml(renewal.renewal_code)}</td><td>${escapeHtml(renewal.franchises?.franchise_number)}</td>
    <td>${escapeHtml(renewal.operator_name)}</td><td>${escapeHtml(TYPE_LABELS[renewal.renewal_type])}</td>
    <td>${escapeHtml(renewal.current_expiration_date)}</td><td>${badge(renewal.status)}</td>
    <td>${new Date(renewal.created_at).toLocaleDateString()}</td>
    <td><button class="verify-btn" data-review-id="${renewal.id}"><i class="ri-eye-line"></i> View / Review</button></td>
  </tr>`).join("") : '<tr><td colspan="8">No renewal requests found.</td></tr>';
}

async function signedUrl(path) {
  const { data, error } = await supabase.storage.from("franchise-documents").createSignedUrl(path, 3600);
  if (error) { console.error(error); return null; }
  return data.signedUrl;
}

async function openReview(id) {
  currentRenewal = renewals.find((renewal) => String(renewal.id) === String(id));
  if (!currentRenewal) return;
  const docResult = await supabase.from("renewal_documents").select("*").eq("renewal_id", currentRenewal.id).order("doc_type");
  if (docResult.error) return alert(`Could not load documents: ${docResult.error.message}`);
  currentDocuments = docResult.data || [];

  byId("renewalDetails").innerHTML = [
    detail("Request", currentRenewal.renewal_code), detail("Franchise", currentRenewal.franchises?.franchise_number),
    detail("Operator", currentRenewal.operator_name), detail("Renewal Case", TYPE_LABELS[currentRenewal.renewal_type]),
    detail("Operator Address", currentRenewal.operator_address), detail("Operator Contact", currentRenewal.operator_contact),
    detail("Voter's Certificate", currentRenewal.voters_certificate_number), detail("Cedula", currentRenewal.cedula_number),
    detail("Barangay Clearance", currentRenewal.barangay_clearance_number), detail("PMBL Certificate", currentRenewal.pmbl_certificate_number),
    detail("Driver", currentRenewal.driver_name), detail("Driver License", currentRenewal.driver_license_number),
    detail("Plate Number", currentRenewal.plate_number), detail("Engine Number", currentRenewal.engine_number),
    detail("Chassis Number", currentRenewal.chassis_number), detail("Current OR", currentRenewal.current_or_number),
    detail("Current CR", currentRenewal.current_cr_number), detail("OR / CR Registration", `${labelStatus(currentRenewal.or_registration_class)} / ${labelStatus(currentRenewal.cr_registration_class)}`),
    detail("Change Motor Request", currentRenewal.change_motor_request_id || "Not applicable"),
    detail("Current Expiration", currentRenewal.current_expiration_date), detail("Submitted", new Date(currentRenewal.created_at).toLocaleString()),
    detail("Status", badge(currentRenewal.status), true),
  ].join("");

  const urls = new Map(await Promise.all(currentDocuments.map(async (doc) => [doc.id, await signedUrl(doc.storage_path)])));
  byId("renewalDocuments").innerHTML = DOC_ORDER.map((type) => {
    const label = DOC_LABELS[type];
    const doc = currentDocuments.find((item) => item.doc_type === type);
    if (!doc) return `<div class="renewal-doc-row"><strong>${escapeHtml(label)}</strong><span class="doc-missing">Missing document</span><span></span></div>`;
    return `<div class="renewal-doc-row" data-doc-id="${doc.id}">
      <strong>${escapeHtml(label)}</strong>
      <div class="renewal-doc-actions"><a class="doc-link" href="${escapeHtml(urls.get(doc.id) || "#")}" target="_blank" rel="noopener"><i class="ri-eye-line"></i> View</a>
        <select data-doc-status><option value="pending" ${doc.status === "pending" ? "selected" : ""}>Pending</option><option value="verified" ${doc.status === "verified" ? "selected" : ""}>Verified</option><option value="needs_correction" ${doc.status === "needs_correction" ? "selected" : ""}>Needs Correction</option></select></div>
      <input data-doc-note value="${escapeHtml(doc.staff_note || "")}" placeholder="Document remark">
    </div>`;
  }).join("");

  byId("franchiseCheck").value = currentRenewal.franchise_check_status;
  byId("verifiedOrClass").value = currentRenewal.or_registration_class;
  byId("verifiedCrClass").value = currentRenewal.cr_registration_class;
  byId("ltoForHireVerified").checked = currentRenewal.lto_lucena_for_hire_verified;
  const results = currentRenewal.inspection_results || {};
  document.querySelectorAll("[data-inspection]").forEach((input) => { input.checked = Boolean(results[input.dataset.inspection]); });
  byId("inspectionRemarks").value = currentRenewal.inspection_remarks || "";
  byId("assessmentNumber").value = currentRenewal.assessment_number || "";
  byId("assessmentDate").value = currentRenewal.assessment_date || "";
  byId("assessedAmount").value = currentRenewal.assessed_amount ?? "";
  byId("paymentStatus").value = currentRenewal.payment_status;
  byId("paymentOrNumber").value = currentRenewal.payment_or_number || "";
  byId("temporaryMtop").checked = currentRenewal.temporary_mtop_issued;
  byId("temporaryMtopNumber").value = currentRenewal.temporary_mtop_number || "";
  byId("temporaryMtopExpiration").value = currentRenewal.temporary_mtop_expiration_date || "";
  updateTemporaryMtopFields();
  byId("mtopNumber").value = currentRenewal.mtop_number || "";
  byId("expectedRelease").value = currentRenewal.expected_release_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  byId("decisionReason").value = currentRenewal.decision_reason || "";
  const final = ["approved", "rejected"].includes(currentRenewal.status);
  ["incompleteBtn", "saveProgressBtn", "approveRenewalBtn"].forEach((id) => { byId(id).disabled = final; });
  byId("reviewModal").hidden = false;
}

async function printCurrentRenewal() {
  if (!currentRenewal) return;
  const picture = currentDocuments.find((doc) => doc.doc_type === "picture_2x2");
  await openSavedSubmissionForm({
    renewal: currentRenewal, franchise: currentRenewal.franchises || {},
    pictureUrl: picture ? await signedUrl(picture.storage_path) : "",
    documentTypes: currentDocuments.map((document) => document.doc_type),
  });
}

async function printCurrentPmblCertification() {
  if (!currentRenewal) return;
  const { openPmblPdfForm } = await import("./pdf-form.js?v=20260826-024500");
  openPmblPdfForm({ renewal: currentRenewal, franchise: currentRenewal.franchises || {} });
}

async function printCurrentChecklist() {
  if (!currentRenewal) return;
  const { openRenewalChecklistForm } = await import("./submission-form.js?v=20260824-233000");
  openRenewalChecklistForm({ renewal: currentRenewal, franchise: currentRenewal.franchises || {}, documents: currentDocuments });
}

function inspectionResults() {
  return Object.fromEntries(INSPECTION_KEYS.map((key) => [key, document.querySelector(`[data-inspection="${key}"]`).checked]));
}

function updateTemporaryMtopFields() {
  const allowed = currentRenewal && ["expired_or", "change_motor"].includes(currentRenewal.renewal_type);
  const issued = allowed && byId("temporaryMtop").checked;
  byId("temporaryMtop").disabled = !allowed;
  byId("temporaryMtopNumber").disabled = !issued;
  byId("temporaryMtopExpiration").disabled = !issued;
  if (!issued) {
    byId("temporaryMtopNumber").value = "";
    byId("temporaryMtopExpiration").value = "";
  }
}

async function saveDocumentReviews() {
  const rows = [...document.querySelectorAll("[data-doc-id]")];
  for (const row of rows) {
    const status = row.querySelector("[data-doc-status]").value;
    const note = row.querySelector("[data-doc-note]").value.trim() || null;
    const { error } = await supabase.from("renewal_documents").update({ status, verified: status === "verified", staff_note: note }).eq("id", Number(row.dataset.docId));
    if (error) throw error;
  }
  return rows.length === 9 && rows.every((row) => row.querySelector("[data-doc-status]").value === "verified");
}

async function saveProgress(forcedStatus = null) {
  if (!currentRenewal) return;
  const documentsComplete = await saveDocumentReviews();
  const inspections = inspectionResults();
  const inspectionPassed = INSPECTION_KEYS.every((key) => inspections[key]);
  const temporaryMtopIssued = !byId("temporaryMtop").disabled && byId("temporaryMtop").checked;
  if (temporaryMtopIssued && (!byId("temporaryMtopNumber").value.trim() || !byId("temporaryMtopExpiration").value)) {
    throw new Error("Enter the Temporary MTOP number and expiration date.");
  }
  let status = forcedStatus || (documentsComplete ? (inspectionPassed ? "awaiting_payment" : "inspection_pending") : "pending_review");
  const payload = {
    franchise_check_status: byId("franchiseCheck").value,
    or_registration_class: byId("verifiedOrClass").value,
    cr_registration_class: byId("verifiedCrClass").value,
    lto_lucena_for_hire_verified: byId("ltoForHireVerified").checked,
    documents_complete: documentsComplete,
    inspection_results: inspections,
    inspection_passed: inspectionPassed,
    inspection_remarks: byId("inspectionRemarks").value.trim() || null,
    assessment_number: byId("assessmentNumber").value.trim() || null,
    assessment_date: byId("assessmentDate").value || null,
    assessed_amount: byId("assessedAmount").value === "" ? null : Number(byId("assessedAmount").value),
    payment_status: byId("paymentStatus").value,
    payment_or_number: byId("paymentOrNumber").value.trim() || null,
    temporary_mtop_issued: temporaryMtopIssued,
    temporary_mtop_issued_at: temporaryMtopIssued ? (currentRenewal.temporary_mtop_issued_at || new Date().toISOString()) : null,
    temporary_mtop_number: temporaryMtopIssued ? byId("temporaryMtopNumber").value.trim() : null,
    temporary_mtop_expiration_date: temporaryMtopIssued ? byId("temporaryMtopExpiration").value : null,
    decision_reason: byId("decisionReason").value.trim() || null,
    status,
    reviewed_at: new Date().toISOString(),
  };
  const { data: { user } } = await supabase.auth.getUser();
  payload.reviewed_by = user.id;
  const { error } = await supabase.from("franchise_renewals").update(payload).eq("id", currentRenewal.id);
  if (error) throw error;
  currentRenewal = { ...currentRenewal, ...payload };
  return { documentsComplete, inspectionPassed };
}

async function handleSaveProgress() {
  try {
    await saveProgress();
    await logAudit({ action: "Reviewed Franchise Renewal", actionType: "update", record: currentRenewal.renewal_code, description: `Saved review progress for ${currentRenewal.renewal_code}.` });
    byId("reviewModal").hidden = true;
    await loadRenewals();
  } catch (error) { alert(`Could not save review: ${error.message}`); }
}

async function markIncomplete() {
  const reason = byId("decisionReason").value.trim();
  if (!reason) return alert("Explain which requirements are incomplete.");
  try {
    await saveProgress("needs_correction");
    await logAudit({ action: "Marked Renewal Incomplete", actionType: "reject", record: currentRenewal.renewal_code, description: `Renewal ${currentRenewal.renewal_code} needs correction: ${reason}` });
    alert("Renewal marked Not Approved — Incomplete. The Operator has been notified.");
    byId("reviewModal").hidden = true;
    await loadRenewals();
  } catch (error) { alert(`Could not update renewal: ${error.message}`); }
}

async function approveRenewal() {
  if (!byId("mtopNumber").value.trim()) return alert("Enter the MTOP number.");
  if (!byId("expectedRelease").value) return alert("Enter the expected MTOP release date.");
  try {
    const documentsComplete = await saveDocumentReviews();
    const inspections = inspectionResults();
    const inspectionPassed = INSPECTION_KEYS.every((key) => inspections[key]);
    if (!documentsComplete) return alert("All nine documents must be verified before approval.");
    if (!inspectionPassed) return alert("All vehicle inspection items must pass before approval.");
    if (!byId("assessmentNumber").value.trim() || byId("assessedAmount").value === "") return alert("Enter the TFRO assessment number and assessed amount.");
    if (byId("paymentStatus").value !== "paid") return alert("Confirm Treasurer payment before approval.");
    if (!byId("paymentOrNumber").value.trim()) return alert("Enter the Treasurer's Office payment OR number.");
    if (byId("franchiseCheck").value === "revoked") return alert("A revoked franchise cannot be renewed.");
    if (!["up_to_date", "expired"].includes(byId("franchiseCheck").value)) return alert("Complete the franchise status check before approval.");
    if (!byId("ltoForHireVerified").checked || byId("verifiedOrClass").value !== "for_hire" || byId("verifiedCrClass").value !== "for_hire") return alert("Verify the LTO Lucena City For Hire OR and CR before approval.");
    if (currentRenewal.renewal_type === "change_motor" && !currentRenewal.change_motor_request_id) return alert("Case 3 requires a linked Change Motor request.");
    const releaseDays = Math.round((new Date(`${byId("expectedRelease").value}T00:00:00`) - new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`)) / 86400000);
    if (releaseDays < 7 || releaseDays > 14) return alert("Expected MTOP release must be 7 to 14 days from today.");
    await saveProgress("awaiting_payment");
    const { data, error } = await supabase.rpc("approve_franchise_renewal", {
      p_renewal_id: currentRenewal.id,
      p_mtop_number: byId("mtopNumber").value.trim(),
      p_expected_release_date: byId("expectedRelease").value,
    });
    if (error) throw error;
    const emailDelivery = await supabase.functions.invoke("send-renewal-approval", {
      body: { renewal_id: currentRenewal.id },
    });
    if (emailDelivery.error) console.warn("Approval email remains queued:", emailDelivery.error);
    await logAudit({ action: "Approved Franchise Renewal", actionType: "approve", record: currentRenewal.renewal_code, description: `Approved ${currentRenewal.renewal_code}; new expiration ${data}.` });
    alert(`Renewal approved. The Franchise Record now expires on ${data}. The Operator received an account notification${emailDelivery.error ? "; the approval email remains queued" : " and approval email"}. The Operator must bring all original requirements and valid ID to TFRO in person.`);
    byId("reviewModal").hidden = true;
    await loadRenewals();
  } catch (error) { alert(`Could not approve renewal: ${error.message}`); }
}

async function init() {
  const auth = await requireRole(["admin"]);
  if (!auth.user) return;
  currentProfile = auth.profile;
  await loadRenewals();
}

byId("searchInput").addEventListener("input", renderTable);
byId("statusFilter").addEventListener("change", renderTable);
bindDateCsvExport({
  getRows: filteredRenewals,
  render: renderTable,
  filename: "tfro_franchise_renewals",
  columns: [
    { header: "Request Number", value: (row) => row.renewal_code },
    { header: "Franchise Number", value: (row) => row.franchises?.franchise_number },
    { header: "Operator", value: (row) => row.operator_name },
    { header: "Operator Address", value: (row) => row.operator_address },
    { header: "Operator Contact", value: (row) => row.operator_contact },
    { header: "Renewal Type", value: (row) => TYPE_LABELS[row.renewal_type] || row.renewal_type },
    { header: "Current Expiration", value: (row) => row.current_expiration_date },
    { header: "Driver", value: (row) => row.driver_name },
    { header: "Driver License", value: (row) => row.driver_license_number },
    { header: "Plate Number", value: (row) => row.plate_number },
    { header: "Engine Number", value: (row) => row.engine_number },
    { header: "Chassis Number", value: (row) => row.chassis_number },
    { header: "Assessment Number", value: (row) => row.assessment_number },
    { header: "Assessed Amount", value: (row) => row.assessed_amount },
    { header: "Payment Status", value: (row) => row.payment_status },
    { header: "Payment OR Number", value: (row) => row.payment_or_number },
    { header: "MTOP Number", value: (row) => row.mtop_number },
    { header: "Status", value: (row) => labelStatus(row.status) },
    { header: "Decision / Remarks", value: (row) => row.decision_reason },
    { header: "Submitted At", value: (row) => row.created_at },
  ],
});
byId("renewalsTable").addEventListener("click", (event) => { const button = event.target.closest("[data-review-id]"); if (button) openReview(button.dataset.reviewId); });
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { byId(button.dataset.close).hidden = true; }));
byId("saveProgressBtn").addEventListener("click", handleSaveProgress);
byId("incompleteBtn").addEventListener("click", markIncomplete);
byId("approveRenewalBtn").addEventListener("click", approveRenewal);
byId("printRenewalBtn").addEventListener("click", printCurrentRenewal);
byId("printChecklistBtn").addEventListener("click", printCurrentChecklist);
byId("printPmblBtn").addEventListener("click", printCurrentPmblCertification);
byId("temporaryMtop").addEventListener("change", updateTemporaryMtopFields);
byId("logoutBtn").addEventListener("click", () => signOutAndRedirect("index.html"));
init();
