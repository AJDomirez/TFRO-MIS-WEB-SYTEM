import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";

/* ROLE PROTECTION */
const role = localStorage.getItem("role");
if (role !== "operator") {
  alert("Access Denied");
  window.location.href = "index.html";
}

/* HELPERS */
function initials(name = "") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0].toUpperCase())
      .slice(0, 2)
      .join("") || "U"
  );
}

const DOC_TYPES = ["voters", "barangay", "cedula", "ohcr", "insurance", "pmbl"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

let currentUserId = null;
let fullName = "";

/* Track selected files */
const selectedFiles = {};

/* UI helpers */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function showStatus(message, type) {
  const card = document.getElementById("statusCard");
  if (!card) return;
  card.hidden = false;
  card.className = "app-status-card " + (type || "pending");
  card.innerHTML = `<i class="ri-information-line"></i><span>${message}</span>`;
}

function clearStatus() {
  const card = document.getElementById("statusCard");
  if (card) card.hidden = true;
}

/* Initialize sidebar user */
async function loadUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = "index.html";
    return;
  }
  currentUserId = user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  fullName = profile?.full_name || user.user_metadata?.full_name || "Operator";
  setText("userName", fullName);
  setText("userAvatar", initials(fullName));
  const nameInput = document.getElementById("operatorNameInput");
  if (nameInput) nameInput.value = fullName;
}

/* File selection handling */
function bindFileInputs() {
  document.querySelectorAll(".doc-file").forEach((input) => {
    input.addEventListener("change", () => {
      const docType = input.dataset.doc;
      const file = input.files[0];
      const nameEl = input.closest(".doc-upload").querySelector(".doc-name");
      const removeBtn = input.closest(".doc-upload").querySelector(".doc-remove");

      if (!file) {
        delete selectedFiles[docType];
        nameEl.textContent = "No file selected";
        if (removeBtn) removeBtn.hidden = true;
        return;
      }

      // Validate PDF
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        alert(`${docType}: Only PDF files are accepted.`);
        input.value = "";
        delete selectedFiles[docType];
        nameEl.textContent = "No file selected";
        return;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        alert(`${docType}: File is too large. Maximum size is 5 MB.`);
        input.value = "";
        delete selectedFiles[docType];
        nameEl.textContent = "No file selected";
        return;
      }

      selectedFiles[docType] = file;
      nameEl.textContent = file.name;
      if (removeBtn) removeBtn.hidden = false;
    });
  });

  document.querySelectorAll(".doc-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const docType = btn.dataset.doc;
      const input = document.querySelector(`.doc-file[data-doc="${docType}"]`);
      const nameEl = input.closest(".doc-upload").querySelector(".doc-name");
      delete selectedFiles[docType];
      input.value = "";
      nameEl.textContent = "No file selected";
      btn.hidden = true;
    });
  });
}

/* Read form data */
function readForm() {
  const form = document.getElementById("applicationForm");
  const data = Object.fromEntries(new FormData(form));
  return {
    franchise_number: (data.franchise_number || "").trim(),
    previous_registration: (data.previous_registration || "").trim(),
    operator_name: (data.operator_name || "").trim(),
    registration_month: data.registration_month ? Number(data.registration_month) : null,
    registration_day: data.registration_day ? Number(data.registration_day) : null,
    registration_year: data.registration_year ? Number(data.registration_year) : null,
    address: (data.address || "").trim(),
    engine_number: (data.engine_number || "").trim(),
    chassis_number: (data.chassis_number || "").trim(),
    plate_number: (data.plate_number || "").trim(),
    contact_number: (data.contact_number || "").trim(),
    route: (data.route || "").trim(),
  };
}

/* Validate all required fields */
function validateForm(entry) {
  const errors = [];
  if (!entry.franchise_number) errors.push("Franchise Number is required.");
  if (!entry.previous_registration) errors.push("Previous Registration is required.");
  if (!entry.operator_name) errors.push("Operator Name is required.");
  if (!entry.registration_month || !entry.registration_day || !entry.registration_year) {
    errors.push("Date of Registration (Month/Day/Year) is required.");
  }
  if (!entry.address) errors.push("Address is required.");
  if (!entry.engine_number) errors.push("Engine No. is required.");
  if (!entry.chassis_number) errors.push("Chassis No. is required.");
  if (!entry.plate_number) errors.push("Plate No. is required.");
  if (!entry.contact_number) errors.push("Contact Number is required.");
  return errors;
}

/* Missing documents checker */
function missingDocs() {
  return DOC_TYPES.filter((t) => !selectedFiles[t]);
}

/* Upload a single PDF to storage */
async function uploadDoc(docType, file, applicationId) {
  const path = `applications/${applicationId}/${docType}-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage
    .from("franchise-documents")
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return path;
}

/* Submit application */
async function submitApplication() {
  const entry = readForm();
  const errors = validateForm(entry);
  const missing = missingDocs();

  if (errors.length || missing.length) {
    let msg = "Please fix the following before submitting:\n\n";
    if (errors.length) msg += "• " + errors.join("\n• ") + "\n";
    if (missing.length) msg += "• Missing required document(s): " + missing.join(", ");
    alert(msg);
    return;
  }

  const btn = document.getElementById("submitApplicationBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Submitting...';

  try {
    // 1) Insert the application record (status pending_review)
    const { data: appData, error: appError } = await supabase
      .from("franchise_applications")
      .insert({
        operator_id: currentUserId,
        application_code: "APP-" + Date.now(),
        ...entry,
        status: "pending_review",
      })
      .select("id")
      .single();

    if (appError) throw appError;
    const applicationId = appData.id;

    // 2) Upload each PDF and record in franchise_documents
    for (const docType of DOC_TYPES) {
      const file = selectedFiles[docType];
      const storagePath = await uploadDoc(docType, file, applicationId);
      const { error: docError } = await supabase
        .from("franchise_documents")
        .insert({
          application_id: applicationId,
          doc_type: docType,
          file_name: file.name,
          storage_path: storagePath,
          file_size: file.size,
        });
      if (docError) throw docError;
    }

    // 3) Notify operator of successful submission
    clearStatus();
    showStatus("Your franchise application has been submitted successfully. It is now pending review by the TFRO.", "pending");

    // Disable the form and documents
    document.getElementById("applicationForm").querySelectorAll("input, select, button").forEach((el) => (el.disabled = true));
    document.querySelectorAll(".doc-file").forEach((el) => (el.disabled = true));
    document.querySelectorAll(".doc-remove").forEach((el) => (el.disabled = true));
    btn.innerHTML = '<i class="ri-check-line"></i> Application Submitted';
    btn.disabled = true;

alert("Application submitted successfully! Pending review by TFRO.");
    logAudit({
      action: "Submitted Franchise Application",
      actionType: "create",
      record: entry.franchise_number,
      description: `Submitted a new franchise application for ${entry.operator_name} (Franchise ${entry.franchise_number}).`,
    });
  } catch (err) {
    console.error("Submit error:", err);
    alert("Failed to submit application: " + err.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-send-plane-line"></i> Submit Application';
  }
}

/* Check if user already has a pending/approved application */
async function checkExistingApplication() {
  const { data: apps } = await supabase
    .from("franchise_applications")
    .select("*")
    .eq("operator_id", currentUserId)
    .order("created_at", { ascending: false });

  if (!apps || apps.length === 0) return;

  const latest = apps[0];
  if (latest.status === "pending_review" || latest.status === "reviewing") {
    showStatus("You already have an application under review. Please wait for the TFRO to process it.", "pending");
    document.getElementById("applicationFormCard").style.opacity = "0.5";
    document.getElementById("submitApplicationBtn").disabled = true;
  } else if (latest.status === "approved") {
    showStatus("Your franchise has been approved. You can view it in My Franchise.", "approved");
    document.getElementById("applicationFormCard").style.opacity = "0.5";
    document.getElementById("submitApplicationBtn").disabled = true;
  } else if (latest.status === "rejected" || latest.status === "needs_correction") {
    const reason = latest.rejection_reason || "Please review and correct your application.";
    showStatus(`Your application needs correction. Reason: ${reason}. You may resubmit a new application.`, "rejected");
  }
}

/* LOGOUT */
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  window.location.href = "index.html";
});

/* INIT */
document.getElementById("submitApplicationBtn").addEventListener("click", submitApplication);
bindFileInputs();
loadUser().then(() => checkExistingApplication());
