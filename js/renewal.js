import { supabase } from "./supabase.js";
import { requireRole, signOutAndRedirect } from "./auth-guard.js";
import { logAudit } from "./audit-helper.js";

async function openSavedSubmissionForm(options) {
  const { openRenewalPdfForm } = await import("./pdf-form.js?v=20260826-160000");
  openRenewalPdfForm(options);
}

const BASE_DOCUMENTS = [
  "payment_receipt", "voters_certificate", "cedula", "barangay_clearance", "drivers_license",
  "picture_2x2", "pmbl_certification",
];
const UPDATED_DOCUMENTS = ["official_receipt", "insurance"];
const TYPE_LABELS = { regular: "Regular renewal", expired_or: "Expired OR", change_motor: "Change Motor" };
let currentUser = null;
let currentProfile = null;
let currentFranchise = null;
let currentRenewal = null;
let operatorDrivers = [];
let changeMotorRequests = [];
let renewalHistoryRows = [];
let renewalPage = 1;
const RENEWAL_PAGE_COUNT = 4;
const RENEWAL_PAGE_TITLES = ["Renewal Details", "Operator Information", "Vehicle & Driver Information", "Required Documents"];

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" })[char]);

function setError(message) {
  const element = byId("renewalError");
  element.textContent = message || "";
  element.hidden = !message;
}

function showRenewalPage(page) {
  renewalPage = Math.min(RENEWAL_PAGE_COUNT, Math.max(1, page));
  document.querySelectorAll("[data-renewal-page]").forEach((element) => {
    element.hidden = Number(element.dataset.renewalPage) !== renewalPage;
  });
  byId("renewalBackBtn").disabled = renewalPage === 1;
  byId("renewalNextBtn").hidden = renewalPage === RENEWAL_PAGE_COUNT;
  byId("submitRenewalBtn").hidden = renewalPage !== RENEWAL_PAGE_COUNT;
  byId("renewalStepNumber").textContent = renewalPage;
  byId("renewalStepTitle").textContent = RENEWAL_PAGE_TITLES[renewalPage - 1];
  byId("renewalPageStatus").textContent = `Step ${renewalPage} of ${RENEWAL_PAGE_COUNT}`;
}

function pageIsValid() {
  const page = document.querySelector(`[data-renewal-page="${renewalPage}"]`);
  const invalid = [...page.querySelectorAll("input, select")].find((field) => !field.checkValidity());
  if (!invalid) return true;
  invalid.reportValidity();
  return false;
}

function statusLabel(status) {
  if (status === "needs_correction") return "Not Approved — Incomplete";
  return String(status || "pending_review").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status) {
  return status === "approved" ? "approved" : ["needs_correction", "rejected"].includes(status) ? "rejected" : "pending";
}

function updateCaseRequirements() {
  const type = byId("renewalType").value;
  const needsAllNow = type === "regular";
  document.querySelectorAll(".updated-document input").forEach((input) => { input.required = needsAllNow && !currentRenewal; });
  byId("orClass").value = type === "expired_or" ? "expired" : type === "change_motor" ? "private" : "for_hire";
  byId("crClass").value = type === "change_motor" ? "private" : "for_hire";
  byId("changeMotorRequestField").hidden = type !== "change_motor";
  byId("temporaryUntilDateField").hidden = type === "regular";
  byId("temporaryUntilDate").disabled = type === "regular";
  if (type === "regular") byId("temporaryUntilDate").value = "";
  if (type !== "regular" && !byId("temporaryUntilDate").value) {
    const until = new Date();
    until.setDate(until.getDate() + 15);
    byId("temporaryUntilDate").value = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")}`;
  }
  byId("changeMotorRequestId").required = type === "change_motor";
  byId("caseGuidance").textContent = type === "regular"
    ? "All documents, including current OR/CR registered as For Hire and liability insurance, are required before TFRO can approve renewal."
    : type === "expired_or"
      ? "TFRO may issue a Temporary MTOP. Renewal remains pending until updated OR, CR, and insurance are submitted and verified."
      : "TFRO may issue a Temporary MTOP. Renewal remains pending until OR and CR are updated to For Hire and valid insurance is submitted.";
  byId("documentNote").textContent = needsAllNow
    ? "Upload all nine clear PDF or image photocopies."
    : "Upload the six basic requirements now. Updated For Hire OR, CR, and insurance may follow, but approval remains pending until all are verified.";
}

async function loadChangeMotorRequests() {
  const { data, error } = await supabase.from("change_motor_requests")
    .select("id, request_code, status, franchise_id, new_engine_number, new_chassis_number, new_plate_number")
    .eq("operator_id", currentUser.id)
    .in("status", ["pending_review", "reviewing", "approved"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  changeMotorRequests = data || [];
  byId("changeMotorRequestId").innerHTML = '<option value="">Select a submitted Change Motor request</option>' +
    changeMotorRequests.map((request) => `<option value="${request.id}">${escapeHtml(request.request_code || `Request ${request.id}`)} — ${escapeHtml(statusLabel(request.status))}</option>`).join("");
}

function selectChangeMotorRequest() {
  const request = changeMotorRequests.find((item) => String(item.id) === byId("changeMotorRequestId").value);
  if (!request) return;
  byId("engineNumber").value = request.new_engine_number || currentFranchise?.engine_number || "";
  byId("chassisNumber").value = request.new_chassis_number || currentFranchise?.chassis_number || "";
  byId("plateNumber").value = request.new_plate_number || currentFranchise?.plate_number || "";
}

async function loadFranchise() {
  const { data, error } = await supabase.from("franchises").select("*").eq("operator_id", currentUser.id).order("id").limit(1).maybeSingle();
  if (error) throw error;
  currentFranchise = data;
  if (!data) {
    setError("No franchise is linked to your Operator account. Ask TFRO Staff to link and verify your franchise before applying for renewal.");
    byId("submitRenewalBtn").disabled = true;
    return;
  }
  byId("franchiseNumber").value = data.franchise_number || "";
  byId("currentExpiration").value = data.expiration_date || "";
  byId("assignedRoute").value = data.route || "";
  byId("operatorName").value = data.operator_name || currentProfile.full_name || "";
  byId("operatorContact").value = data.contact_number || currentProfile.contact_number || "";
  byId("operatorAddress").value = data.address || "";
  byId("plateNumber").value = data.plate_number || "";
  byId("engineNumber").value = data.engine_number || "";
  byId("chassisNumber").value = data.chassis_number || "";
  if (!data.expiration_date) {
    setError("The franchise has no expiration date. TFRO Staff must correct the franchise record before renewal.");
    byId("submitRenewalBtn").disabled = true;
  }
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (data.expiration_date && data.expiration_date > localToday) {
    setError(`This franchise is not yet due for renewal. It becomes eligible on ${data.expiration_date}.`);
    byId("submitRenewalBtn").disabled = true;
  }
  if (data.status === "revoked") {
    setError("This franchise is revoked and cannot be renewed. Contact TFRO Staff.");
    byId("submitRenewalBtn").disabled = true;
  }
}

async function loadDrivers() {
  const { data, error } = await supabase.from("drivers").select("id, full_name, license_number, license_status, operator_id").order("full_name");
  if (error) throw error;
  operatorDrivers = data || [];
  const select = byId("driverId");
  select.innerHTML = '<option value="">Select your Driver</option>' + operatorDrivers.map((driver) =>
    `<option value="${driver.id}">${escapeHtml(driver.full_name)} — ${escapeHtml(driver.license_number)}</option>`
  ).join("");
}

function selectDriver() {
  const driver = operatorDrivers.find((item) => String(item.id) === byId("driverId").value);
  byId("driverName").value = driver?.full_name || "";
  byId("driverLicense").value = driver?.license_number || "";
}

async function loadHistory() {
  const { data, error } = await supabase.from("franchise_renewals").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("Renewal history error:", error);
    return;
  }
  const renewals = data || [];
  renewalHistoryRows = renewals;
  currentRenewal = renewals.find((renewal) => !["approved", "rejected"].includes(renewal.status)) || null;
  const table = byId("renewalHistory");
  table.innerHTML = renewals.length ? renewals.map((renewal) => `
    <tr>
      <td>${escapeHtml(renewal.renewal_code)}</td>
      <td>${escapeHtml(TYPE_LABELS[renewal.renewal_type] || renewal.renewal_type)}</td>
      <td><span class="status-pill ${statusClass(renewal.status)}">${escapeHtml(statusLabel(renewal.status))}</span></td>
      <td>${escapeHtml(renewal.decision_reason || (renewal.status === "approved" ? `MTOP ${renewal.mtop_number || "for issuance"}; expected ${renewal.expected_release_date || "within 1–2 weeks"}` : "Awaiting TFRO processing"))}</td>
      <td>${new Date(renewal.created_at).toLocaleDateString()}</td>
      <td><div class="form-buttons"><button type="button" class="page-button page-button-back" data-pmbl-form="${renewal.id}"><i class="ri-file-text-line"></i><span>TFRO-003</span></button>${renewal.temporary_mtop_issued ? `<button type="button" class="page-button page-button-back" data-tfro001-form="${renewal.id}"><i class="ri-file-pdf-2-line"></i><span>TFRO-001</span></button>` : ""}${renewal.status === "approved" ? `<button type="button" class="page-button page-button-back" data-checklist-form="${renewal.id}"><i class="ri-checkbox-multiple-line"></i><span>TFRO-004</span></button><button type="button" class="page-button page-button-back" data-renewal-form="${renewal.id}"><i class="ri-file-pdf-2-line"></i><span>TFRO-005</span></button>` : ""}</div></td>
    </tr>`).join("") : '<tr><td colspan="6">No renewal requests yet.</td></tr>';

  if (!currentRenewal) return;
  const banner = byId("renewalStatus");
  banner.hidden = false;
  banner.className = `renewal-alert ${statusClass(currentRenewal.status)}`;
  banner.textContent = `${statusLabel(currentRenewal.status)}: ${currentRenewal.decision_reason || "Your renewal is being processed by TFRO Staff."}`;

  if (currentRenewal.status === "needs_correction") {
    document.querySelectorAll('#renewalForm input[type="file"]').forEach((input) => { input.required = false; });
    byId("submitRenewalBtn").innerHTML = '<i class="ri-refresh-line"></i> Resubmit Corrected Documents';
    prefillRenewal(currentRenewal);
  } else {
    byId("renewalFormCard").style.opacity = ".65";
    byId("renewalForm").querySelectorAll("input, select, button").forEach((element) => { element.disabled = true; });
  }
}

async function showRenewalSubmission(renewal) {
  const { data: documents } = await supabase.from("renewal_documents")
    .select("doc_type, storage_path").eq("renewal_id", renewal.id);
  const picture = (documents || []).find((document) => document.doc_type === "picture_2x2");
  let pictureUrl = "";
  if (picture?.storage_path) {
    const signed = await supabase.storage.from("franchise-documents").createSignedUrl(picture.storage_path, 600);
    pictureUrl = signed.data?.signedUrl || "";
  }
  let changeMotor = {};
  if (renewal.change_motor_request_id) {
    const result = await supabase.from("change_motor_requests")
      .select("new_motor_brand,new_motor_serial,new_engine_number,new_chassis_number,new_plate_number")
      .eq("id", renewal.change_motor_request_id).maybeSingle();
    if (result.error) return alert(`Could not load the Change Motor data: ${result.error.message}`);
    changeMotor = result.data || {};
  }
  await openSavedSubmissionForm({
    renewal, franchise: currentFranchise, pictureUrl,
    changeMotor,
    documentTypes: (documents || []).map((document) => document.doc_type),
  });
}

async function showPmblCertification(renewal) {
  const { openPmblPdfForm } = await import("./pdf-form.js?v=20260826-060000");
  openPmblPdfForm({ renewal, franchise: currentFranchise || {} });
}

async function showRenewalChecklist(renewal) {
  const { data: documents } = await supabase.from("renewal_documents").select("doc_type,status,verified").eq("renewal_id", renewal.id);
  const { openChecklistPdfForm } = await import("./pdf-form.js?v=20260826-093000");
  openChecklistPdfForm({ renewal, documents: documents || [] });
}

async function showTemporaryMtop(renewal) {
  if (!renewal.temporary_mtop_issued) return alert("TFRO-001 is available only after TFRO Admin sends it to your account.");
  let changeMotor = {};
  if (renewal.change_motor_request_id) {
    const { data, error } = await supabase.from("change_motor_requests")
      .select("new_motor_brand,new_motor_serial,new_engine_number,new_chassis_number,new_plate_number")
      .eq("id", renewal.change_motor_request_id).maybeSingle();
    if (error) return alert(`Could not load the Change Motor data: ${error.message}`);
    changeMotor = data || {};
  }
  const { openTemporaryMtopPdfForm } = await import("./pdf-form.js?v=20260826-150000");
  openTemporaryMtopPdfForm({ renewal, franchise: currentFranchise || {}, changeMotor });
}

function prefillRenewal(renewal) {
  byId("renewalType").value = renewal.renewal_type;
  byId("operatorName").value = renewal.operator_name;
  byId("operatorContact").value = renewal.operator_contact;
  byId("operatorAddress").value = renewal.operator_address;
  byId("votersNumber").value = renewal.voters_certificate_number || "";
  byId("cedulaNumber").value = renewal.cedula_number || "";
  byId("barangayNumber").value = renewal.barangay_clearance_number || "";
  byId("driverId").value = renewal.driver_id || "";
  byId("driverName").value = renewal.driver_name;
  byId("driverLicense").value = renewal.driver_license_number;
  byId("plateNumber").value = renewal.plate_number;
  byId("engineNumber").value = renewal.engine_number;
  byId("chassisNumber").value = renewal.chassis_number;
  byId("pmblNumber").value = renewal.pmbl_certificate_number || "";
  byId("orNumber").value = renewal.current_or_number || "";
  byId("crNumber").value = renewal.current_cr_number || "";
  byId("orClass").value = renewal.or_registration_class;
  byId("crClass").value = renewal.cr_registration_class;
  byId("changeMotorRequestId").value = renewal.change_motor_request_id || "";
  byId("temporaryUntilDate").value = renewal.temporary_mtop_expiration_date || "";
  updateCaseRequirements();
}

function getFiles() {
  return [...document.querySelectorAll("[data-doc]")].map((label) => ({
    docType: label.dataset.doc,
    input: label.querySelector("input[type=file]"),
    file: label.querySelector("input[type=file]").files[0],
  })).filter((item) => item.file);
}

function validateFiles(files, resubmitting) {
  const type = byId("renewalType").value;
  const required = resubmitting ? [] : type === "regular" ? [...BASE_DOCUMENTS, ...UPDATED_DOCUMENTS] : BASE_DOCUMENTS;
  const uploadedTypes = new Set(files.map((item) => item.docType));
  const missing = required.filter((docType) => !uploadedTypes.has(docType));
  if (missing.length) return "Please upload all required documents for this renewal case.";
  const invalid = files.find(({ file }) => file.size > 5 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type));
  if (invalid) return `${invalid.file.name} must be a PDF, JPG, or PNG no larger than 5 MB.`;
  const invalidPicture = files.find(({ docType, file }) => docType === "picture_2x2" && !["image/jpeg", "image/png"].includes(file.type));
  return invalidPicture ? "The 2×2 picture must be a JPG or PNG image." : "";
}

async function uploadDocuments(renewalId, files) {
  const uploadedPaths = [];
  for (const item of files) {
    const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `renewals/${renewalId}/${item.docType}-${Date.now()}-${safeName}`;
    const upload = await supabase.storage.from("franchise-documents").upload(path, item.file, { contentType: item.file.type, upsert: false });
    if (upload.error) throw upload.error;
    uploadedPaths.push(path);
    const save = await supabase.from("renewal_documents").upsert({
      renewal_id: renewalId, doc_type: item.docType, file_name: item.file.name,
      storage_path: path, file_size: item.file.size, verified: false, status: "pending", staff_note: null,
    }, { onConflict: "renewal_id,doc_type" });
    if (save.error) throw save.error;
  }
  return uploadedPaths;
}

async function submitRenewal(event) {
  event.preventDefault();
  setError("");
  if (!currentFranchise) return setError("A linked franchise is required.");
  const resubmitting = currentRenewal?.status === "needs_correction";
  const files = getFiles();
  const fileError = validateFiles(files, resubmitting);
  if (fileError) return setError(fileError);
  if (resubmitting && !files.length) return setError("Upload at least one corrected or missing document before resubmitting.");

  const button = byId("submitRenewalBtn");
  button.disabled = true;
  button.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Uploading and submitting...';
  let renewalId = currentRenewal?.id || null;
  let uploadedPaths = [];
  try {
    if (!resubmitting) {
      const record = {
        operator_id: currentUser.id, franchise_id: currentFranchise.id, driver_id: Number(byId("driverId").value),
        renewal_code: `REN-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        renewal_type: byId("renewalType").value, current_expiration_date: byId("currentExpiration").value,
        operator_name: byId("operatorName").value.trim(), operator_address: byId("operatorAddress").value.trim(),
        operator_contact: byId("operatorContact").value.trim(), voters_certificate_number: byId("votersNumber").value.trim() || null,
        cedula_number: byId("cedulaNumber").value.trim() || null, barangay_clearance_number: byId("barangayNumber").value.trim() || null,
        driver_name: byId("driverName").value, driver_license_number: byId("driverLicense").value,
        plate_number: byId("plateNumber").value.trim(), engine_number: byId("engineNumber").value.trim(), chassis_number: byId("chassisNumber").value.trim(),
        pmbl_certificate_number: byId("pmblNumber").value.trim() || null, current_or_number: byId("orNumber").value.trim() || null,
        current_cr_number: byId("crNumber").value.trim() || null, or_registration_class: byId("orClass").value,
        cr_registration_class: byId("crClass").value, status: "pending_review",
        change_motor_request_id: byId("renewalType").value === "change_motor" ? Number(byId("changeMotorRequestId").value) : null,
        temporary_mtop_expiration_date: byId("renewalType").value === "regular" ? null : (byId("temporaryUntilDate").value || null),
      };
      const insert = await supabase.from("franchise_renewals").insert(record).select("id, renewal_code").single();
      if (insert.error) throw insert.error;
      renewalId = insert.data.id;
    }
    uploadedPaths = await uploadDocuments(renewalId, files);
    if (resubmitting) {
      const update = await supabase.from("franchise_renewals").update({
        status: "pending_review",
        temporary_mtop_expiration_date: byId("renewalType").value === "regular" ? null : (byId("temporaryUntilDate").value || null),
      }).eq("id", renewalId);
      if (update.error) throw update.error;
    }
    await logAudit({ action: resubmitting ? "Resubmitted Renewal Requirements" : "Submitted Franchise Renewal", actionType: "create", record: String(renewalId), description: `${resubmitting ? "Resubmitted" : "Submitted"} franchise renewal documents for ${currentFranchise.franchise_number}.` });
    alert(resubmitting ? "Corrected requirements resubmitted to TFRO Staff." : "Renewal submitted. TFRO Staff will verify the documents and inspect your unit.");
    window.location.reload();
  } catch (error) {
    console.error("Renewal submission error:", error);
    if (!resubmitting && renewalId) {
      if (uploadedPaths.length) await supabase.storage.from("franchise-documents").remove(uploadedPaths);
      await supabase.from("franchise_renewals").delete().eq("id", renewalId);
    }
    setError(`Could not submit renewal: ${error.message}`);
    button.disabled = false;
    button.innerHTML = resubmitting ? '<i class="ri-refresh-line"></i> Resubmit Corrected Documents' : '<i class="ri-send-plane-line"></i> Submit Renewal';
  }
}

async function init() {
  const auth = await requireRole(["operator"]);
  if (!auth.user) return;
  currentUser = auth.user;
  currentProfile = auth.profile;
  byId("userName").textContent = currentProfile.full_name || "Operator";
  byId("userAvatar").textContent = (currentProfile.full_name || "OP").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  try {
    await Promise.all([loadFranchise(), loadDrivers(), loadChangeMotorRequests()]);
    await loadHistory();
    selectDriver();
    updateCaseRequirements();
  } catch (error) {
    console.error(error);
    setError(`Could not load renewal information: ${error.message}`);
  }
}

byId("renewalType").addEventListener("change", updateCaseRequirements);
byId("changeMotorRequestId").addEventListener("change", selectChangeMotorRequest);
byId("driverId").addEventListener("change", selectDriver);
byId("renewalBackBtn").addEventListener("click", () => showRenewalPage(renewalPage - 1));
byId("renewalNextBtn").addEventListener("click", () => {
  if (pageIsValid()) showRenewalPage(renewalPage + 1);
});
byId("renewalForm").addEventListener("submit", submitRenewal);
byId("renewalHistory").addEventListener("click", (event) => {
  const temporaryButton = event.target.closest("[data-tfro001-form]");
  if (temporaryButton) {
    const renewal = renewalHistoryRows.find((row) => String(row.id) === temporaryButton.dataset.tfro001Form);
    if (renewal) showTemporaryMtop(renewal);
    return;
  }
  const checklistButton = event.target.closest("[data-checklist-form]");
  if (checklistButton) {
    const renewal = renewalHistoryRows.find((row) => String(row.id) === checklistButton.dataset.checklistForm);
    if (renewal?.status === "approved") showRenewalChecklist(renewal);
    return;
  }
  const button = event.target.closest("[data-renewal-form]");
  if (!button) return;
  const renewal = renewalHistoryRows.find((row) => String(row.id) === button.dataset.renewalForm);
  if (renewal?.status === "approved") showRenewalSubmission(renewal);
});
byId("renewalHistory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-pmbl-form]");
  if (!button) return;
  const renewal = renewalHistoryRows.find((row) => String(row.id) === button.dataset.pmblForm);
  if (renewal) showPmblCertification(renewal);
});
byId("logoutBtn").addEventListener("click", () => signOutAndRedirect("index.html"));
showRenewalPage(1);
init();
