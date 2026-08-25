import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";

async function openSavedSubmissionForm(options) {
  const { openSubmissionForm } = await import("./submission-form.js");
  openSubmissionForm(options);
}

/* ROLE PROTECTION — server-verified, not localStorage */
let currentUser = null;
let currentProfile = null;
let currentOperatorRecord = null;
let editingDriver = null;
requireRole(["operator"]).then(({ user, profile }) => {
  if (!user) return;
  currentUser = user;
  currentProfile = profile;
  loadPortal();
});

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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value || "";
}

function money(value) {
  return value != null ? "₱" + Number(value).toLocaleString() : "—";
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function loadViolations(violations) {
  const table = document.getElementById("violationTable");
  if (!table) return;
  table.innerHTML = "";

  if (!violations.length) {
    table.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">No violations on record.</td></tr>';
    return;
  }

  violations.forEach((v) => {
    table.innerHTML += `
      <tr>
        <td>${escapeHTML(v.violation_type || "—")}</td>
        <td>${v.occurred_at ? new Date(v.occurred_at).toLocaleDateString() : "—"}</td>
        <td>${money(v.penalty)}</td>
        <td><span class="badge">${escapeHTML(v.status || "—")}</span></td>
      </tr>
    `;
  });
}

/* LOAD DATA */
async function loadPortal() {
  const user = currentUser;
  const profile = currentProfile;
  if (!user) return;

  const fullName = profile?.full_name || user.user_metadata?.full_name || "Operator";

  // Driver ownership is linked to the server-controlled operator record, not
  // to an operator name supplied by the browser.
  const { data: operatorRows, error: operatorError } = await supabase
    .from("operators")
    .select("id, user_id, full_name, address, contact_number, franchise_number, status, verified")
    .eq("user_id", user.id)
    .order("verified", { ascending: false })
    .order("id", { ascending: true });

  if (operatorError) console.error("Could not load operator record:", operatorError);
  currentOperatorRecord = (operatorRows || [])[0] || null;

  if (!currentOperatorRecord?.verified || currentOperatorRecord.status !== "active") {
    setDriverFormMessage(
      "Your Operator record is not ready yet. Ask TFRO Staff to approve and link your Operator account before submitting a Driver."
    );
    const submitDriverBtn = document.getElementById("submitDriverBtn");
    if (submitDriverBtn) submitDriverBtn.disabled = true;
  }

  /* Sidebar + welcome */
  setText("userName", fullName);
  setText("userAvatar", initials(fullName));
  setText("welcomeName", fullName);
  setValue("cmOperatorName", currentOperatorRecord?.full_name || fullName);
  setValue("driverOperatorName", currentOperatorRecord?.full_name || fullName);

  /* Franchise ownership is account-bound through operator_id. */
  let { data: franchise, error: franchiseError } = await supabase
    .from("franchises")
    .select("*")
    .eq("operator_id", user.id)
    .limit(1)
    .maybeSingle();

  // Older records may only have the franchise number linked. Retain this
  // account-safe fallback so approved legacy Operator accounts still load.
  if (!franchise && !franchiseError && currentOperatorRecord?.franchise_number) {
    const fallback = await supabase
      .from("franchises")
      .select("*")
      .eq("franchise_number", currentOperatorRecord.franchise_number)
      .limit(1)
      .maybeSingle();
    franchise = fallback.data;
    franchiseError = fallback.error;
  }

  if (franchiseError) {
    console.error("Could not load franchise details:", franchiseError);
    const badge = document.getElementById("franchiseStatus");
    if (badge) {
      badge.className = "badge pending";
      badge.textContent = "Could not load";
    }
  }

  if (franchise) {
    const { data: latestRenewal, error: renewalError } = await supabase
      .from("franchise_renewals")
      .select("assessed_amount, payment_status")
      .eq("operator_id", user.id)
      .eq("franchise_id", franchise.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (renewalError) console.error("Could not load franchise assessment:", renewalError);

    window.__currentFranchise = franchise;
    setText("franchiseNumber", franchise.franchise_number);
    setText("assignedRoute", franchise.route);
    setText("dateApplied", dateLabel(franchise.application_date));
    setText("expiryDate", dateLabel(franchise.expiration_date));
    setText("annualFee", latestRenewal?.assessed_amount != null ? money(latestRenewal.assessed_amount) : "Not assessed");
    setText("paymentStatus", latestRenewal?.payment_status
      ? String(latestRenewal.payment_status).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "No payment record");
    setValue("cmFranchiseNumber", franchise.franchise_number);
    setValue("cmCurrentEngine", franchise.engine_number);
    setValue("cmCurrentChassis", franchise.chassis_number);
    setValue("cmCurrentPlate", franchise.plate_number);
    setValue("cmAssignedRoute", franchise.route);
    setValue("driverFranchiseNumber", franchise.franchise_number);
    setValue("driverAssignedRoute", franchise.route);

    const badge = document.getElementById("franchiseStatus");
    if (badge) {
      const status = (franchise.status || "pending").toLowerCase();
      badge.className = "badge " + (status === "active" ? "approved" : "pending");
      badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
  } else {
    setText("franchiseNumber", currentOperatorRecord?.franchise_number || "—");
    setText("assignedRoute", "—");
    setText("dateApplied", "—");
    setText("expiryDate", "—");
    setText("annualFee", "—");
    setText("paymentStatus", "—");
    setValue("cmFranchiseNumber", currentOperatorRecord?.franchise_number);
    setValue("cmCurrentEngine", "");
    setValue("cmCurrentChassis", "");
    setValue("cmCurrentPlate", "");
    setValue("cmAssignedRoute", "");
    setValue("driverFranchiseNumber", currentOperatorRecord?.franchise_number);
    setValue("driverAssignedRoute", "");
    setDriverFormMessage("A linked franchise is required before submitting a Driver application.");
    const submitDriverBtn = document.getElementById("submitDriverBtn");
    if (submitDriverBtn) submitDriverBtn.disabled = true;

    const badge = document.getElementById("franchiseStatus");
    if (badge) {
      badge.className = "badge";
      badge.textContent = "No franchise";
    }
  }

  /* Violations */
  const { data: violations } = await supabase
    .from("violations")
    .select("violation_type, occurred_at, penalty, status")
    .eq("subject_name", fullName)
    .eq("subject_type", "operator");
  loadViolations(violations || []);

  /* Change motor history */
  loadChangeMotorHistory(user.id);

  /* Operator-owned Driver applications */
  loadAssignedDrivers();
}

/* ============================================================
   OPERATOR-OWNED DRIVER APPLICATIONS
   ============================================================ */
async function loadAssignedDrivers() {
  const table = document.getElementById("assignedDriversTable");
  if (!table) return;

  if (!currentOperatorRecord) {
    table.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Operator approval is required before adding a Driver.</td></tr>';
    return;
  }

  const { data: drivers, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("operator_id", currentOperatorRecord.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load Driver applications:", error);
    table.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#b91c1c;">Could not load Driver applications.</td></tr>';
    return;
  }

  if (!drivers?.length) {
    table.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No Driver applications yet.</td></tr>';
    return;
  }

  window.__operatorDrivers = drivers;
  table.innerHTML = drivers.map((driver) => {
    const status = String(driver.license_status || "not_verified");
    const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const badgeClass = status === "verified" ? "approved" : "pending";
    return `
      <tr>
        <td>${escapeHTML(driver.full_name || "—")}</td>
        <td>${escapeHTML(driver.license_number || "—")}</td>
        <td><span class="badge ${badgeClass}">${escapeHTML(label)}</span></td>
        <td>${driver.created_at ? new Date(driver.created_at).toLocaleDateString() : "—"}</td>
        <td><button type="button" class="form-action-btn" data-driver-form="${driver.id}"><i class="ri-file-pdf-2-line"></i> View / PDF</button>${status === "not_verified" ? ` <button type="button" class="form-action-btn" data-driver-edit="${driver.id}"><i class="ri-edit-line"></i> Edit</button>` : ""}</td>
      </tr>
    `;
  }).join("");
}

async function signedDocumentUrl(path) {
  if (!path) return "";
  const { data, error } = await supabase.storage.from("franchise-documents").createSignedUrl(path, 600);
  if (error) console.error("Signed document URL error:", error);
  return data?.signedUrl || "";
}

async function showDriverSubmission(driver) {
  await openSavedSubmissionForm({
    title: "Driver Application Form", reference: `DRV-${driver.id}`, filename: `TFRO-Driver-${driver.id}`,
    pictureUrl: await signedDocumentUrl(driver.picture_storage_path),
    fields: [
      { label: "Driver Name", value: driver.full_name }, { label: "Address", value: driver.address },
      { label: "Contact Number", value: driver.contact_number }, { label: "License Number", value: driver.license_number },
      { label: "License Type", value: driver.license_type }, { label: "License Expiration", value: driver.license_expiration },
      { label: "Operator", value: driver.operator_name }, { label: "Verification Status", value: driver.license_status },
      { label: "Submitted", value: driver.created_at ? new Date(driver.created_at).toLocaleString() : "—" },
    ],
  });
}

document.getElementById("assignedDriversTable")?.addEventListener("click", (event) => {
  const formButton = event.target.closest("[data-driver-form]");
  if (formButton) {
    const driver = window.__operatorDrivers?.find((row) => String(row.id) === formButton.dataset.driverForm);
    if (driver) showDriverSubmission(driver);
    return;
  }
  const editButton = event.target.closest("[data-driver-edit]");
  if (editButton) {
    const driver = window.__operatorDrivers?.find((row) => String(row.id) === editButton.dataset.driverEdit);
    if (driver) beginDriverEdit(driver);
  }
});

function beginDriverEdit(driver) {
  editingDriver = driver;
  setValue("driverFullName", driver.full_name);
  setValue("driverLicenseNumber", driver.license_number);
  setValue("driverLicenseType", driver.license_type);
  setValue("driverLicenseExpiration", driver.license_expiration);
  setValue("driverContactNumber", driver.contact_number);
  setValue("driverAddress", driver.address);
  document.getElementById("driverPicture").required = false;
  document.getElementById("submitDriverBtn").innerHTML = '<i class="ri-save-line"></i> Save Driver Changes';
  document.getElementById("cancelDriverEditBtn").hidden = false;
  setDriverFormMessage("Editing this pending Driver application. Upload a new picture only if it must be replaced.");
  document.getElementById("driverApplicationCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function endDriverEdit() {
  editingDriver = null;
  document.getElementById("driverApplicationForm")?.reset();
  document.getElementById("driverPicture").required = true;
  document.getElementById("submitDriverBtn").innerHTML = '<i class="ri-user-add-line"></i> Submit Driver Application';
  document.getElementById("cancelDriverEditBtn").hidden = true;
  setDriverFormMessage("");
}

document.getElementById("cancelDriverEditBtn")?.addEventListener("click", endDriverEdit);

function setDriverFormMessage(message) {
  const element = document.getElementById("driverFormMessage");
  if (!element) return;
  element.textContent = message || "";
  element.hidden = !message;
}

async function submitDriverApplication(event) {
  event.preventDefault();
  if (!currentUser || !currentOperatorRecord) {
    setDriverFormMessage(
      "Your linked Operator record is required. Ask TFRO Staff to approve your Operator account."
    );
    return;
  }

  const form = event.currentTarget;
  const entry = Object.fromEntries(new FormData(form));
  const button = document.getElementById("submitDriverBtn");
  setDriverFormMessage("");
  button.disabled = true;
  button.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Submitting...';

  const picture = entry.picture;
  const hasPicture = picture instanceof File && picture.size > 0;
  if ((!editingDriver && !hasPicture) || (hasPicture && (!["image/jpeg", "image/png"].includes(picture.type) || picture.size > 5 * 1024 * 1024))) {
    button.disabled = false;
    button.innerHTML = '<i class="ri-user-add-line"></i> Submit Driver Application';
    setDriverFormMessage("Upload a JPG or PNG 2×2 picture no larger than 5 MB.");
    return;
  }
  let picturePath = editingDriver?.picture_storage_path || null;
  if (hasPicture) {
    picturePath = `driver-pictures/${currentOperatorRecord.id}/${Date.now()}-${picture.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const pictureUpload = await supabase.storage.from("franchise-documents").upload(picturePath, picture, { contentType: picture.type });
    if (pictureUpload.error) {
      button.disabled = false;
      button.innerHTML = editingDriver ? '<i class="ri-save-line"></i> Save Driver Changes' : '<i class="ri-user-add-line"></i> Submit Driver Application';
      setDriverFormMessage(`Could not upload the 2×2 picture: ${pictureUpload.error.message}`);
      return;
    }
  }

  const driverRecord = {
    full_name: entry.full_name.trim(),
    license_number: entry.license_number.trim().toUpperCase(),
    operator_name: currentOperatorRecord.full_name,
    contact_number: entry.contact_number.trim(),
    address: entry.address.trim(),
    license_type: entry.license_type,
    license_expiration: entry.license_expiration,
    operator_id: currentOperatorRecord.id,
    user_id: null,
    franchise_id: window.__currentFranchise?.id || null,
    violation_count: 0,
    compliance: "non-compliant",
    license_status: "not_verified",
    license_verified_at: null,
    picture_storage_path: picturePath,
  };

  const write = editingDriver
    ? supabase.from("drivers").update(driverRecord).eq("id", editingDriver.id).eq("license_status", "not_verified")
    : supabase.from("drivers").insert(driverRecord);
  const { error } = await write;
  button.disabled = false;
  button.innerHTML = '<i class="ri-user-add-line"></i> Submit Driver Application';

  if (error) {
    if (hasPicture) await supabase.storage.from("franchise-documents").remove([picturePath]);
    console.error("Driver application error:", error);
    setDriverFormMessage(
      error.code === "23505"
        ? "That Driver's license number is already registered."
        : `Could not submit the Driver application: ${error.message}`
    );
    return;
  }

  const wasEditing = Boolean(editingDriver);
  const oldPicturePath = editingDriver?.picture_storage_path;
  if (wasEditing && hasPicture && oldPicturePath && oldPicturePath !== picturePath) {
    await supabase.storage.from("franchise-documents").remove([oldPicturePath]);
  }
  endDriverEdit();
  alert(wasEditing ? "Driver application updated." : "Driver application submitted to TFRO Staff for verification.");
  logAudit({
    action: wasEditing ? "Updated Driver Application" : "Submitted Driver Application",
    actionType: wasEditing ? "update" : "create",
    record: driverRecord.full_name,
    description: `Submitted Driver ${driverRecord.full_name} with license ${driverRecord.license_number} for TFRO verification.`,
  });
  await loadAssignedDrivers();
}

document
  .getElementById("driverApplicationForm")
  ?.addEventListener("submit", submitDriverApplication);

/* ============================================================
   CHANGE MOTOR / MTOP
   ============================================================ */
function cmShowError(msg) {
  const el = document.getElementById("cmError");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function loadChangeMotorHistory(userId) {
  const table = document.getElementById("cmHistoryTable");
  if (!table) return;

  const { data, error } = await supabase
    .from("change_motor_requests")
    .select("*")
    .eq("operator_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load change motor history error:", error);
    return;
  }

  if (!data || !data.length) {
    table.innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">No change motor requests.</td></tr>';
    return;
  }

  window.__changeMotorRequests = data;
  table.innerHTML = data.map((r) => {
    const cls =
      r.status === "approved" ? "approved" : r.status === "rejected" ? "pending" : "pending";
    const label = String(r.status || "pending_review")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `
      <tr>
        <td>${escapeHTML(r.request_code || r.id)}</td>
        <td>${escapeHTML(r.new_engine_number)}</td>
        <td>${escapeHTML(r.new_chassis_number)}</td>
        <td>${escapeHTML(r.new_plate_number)}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
        <td>${r.status === "approved" && r.forms_sent_to_operator_at ? `<div class="form-buttons"><button type="button" class="form-action-btn" data-motor-form="${r.id}" data-form-code="TFRO-002"><i class="ri-file-pdf-2-line"></i> TFRO-002</button><button type="button" class="form-action-btn" data-motor-form="${r.id}" data-form-code="TFRO-007"><i class="ri-file-pdf-2-line"></i> TFRO-007</button></div>` : '<span class="doc-missing">Available after Admin approval and sending</span>'}</td>
      </tr>
    `;
  }).join("");
}

async function showMotorSubmission(request, formCode) {
  if (request.status !== "approved" || !request.forms_sent_to_operator_at) return alert("These forms have not been sent by TFRO Admin yet.");
  const module = await import("./pdf-form.js?v=20260826-225000");
  const options = { request, franchise: window.__currentFranchise || {}, operator: currentOperatorRecord || {} };
  if (formCode === "TFRO-002") module.openDroppingPetitionPdfForm(options);
  else module.openDroppingCertificationPdfForm(options);
  return;
  await openSavedSubmissionForm({
    title: "Change Motor / MTOP Request Form", reference: request.request_code || request.id,
    filename: `TFRO-Change-Motor-${request.request_code || request.id}`,
    pictureUrl: await signedDocumentUrl(request.picture_storage_path),
    fields: [
      { label: "Operator", value: currentOperatorRecord?.full_name }, { label: "Franchise Number", value: window.__currentFranchise?.franchise_number },
      { label: "Current Engine", value: request.old_engine_number }, { label: "New Engine", value: request.new_engine_number },
      { label: "Current Chassis", value: request.old_chassis_number }, { label: "New Chassis", value: request.new_chassis_number },
      { label: "Current Plate", value: request.old_plate_number }, { label: "New Plate", value: request.new_plate_number },
      { label: "Motor Brand", value: request.new_motor_brand }, { label: "Motor Serial", value: request.new_motor_serial },
      { label: "Supporting Document", value: request.supporting_file_name },
      { label: "Status", value: request.status }, { label: "Submitted", value: request.created_at ? new Date(request.created_at).toLocaleString() : "—" },
    ],
  });
}

document.getElementById("cmHistoryTable")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-motor-form]");
  if (!button) return;
  const request = window.__changeMotorRequests?.find((row) => String(row.id) === button.dataset.motorForm);
  if (request) showMotorSubmission(request, button.dataset.formCode);
});

function escapeHTML(v) {
  var map = {
    "\x26": "&" + "amp;",
    "\x3C": "&" + "lt;",
    "\x3E": "&" + "gt;",
    "\x22": "&" + "quot;",
    "\x27": "&#" + "039;"
  };
  return String(v ?? "").replace(/[&<>'"]/g, function (c) { return map[c]; });
}

async function submitChangeMotor() {
  const engine = document.getElementById("cmEngine").value.trim();
  const chassis = document.getElementById("cmChassis").value.trim();
  const plate = document.getElementById("cmPlate").value.trim();
  const brand = document.getElementById("cmBrand").value.trim();
  const serial = document.getElementById("cmSerial").value.trim();
  const fileInput = document.getElementById("cmDoc");
  const pictureInput = document.getElementById("cmPicture");

  if (!engine && !chassis && !plate) {
    cmShowError("Please provide at least one new detail (engine, chassis, or plate).");
    return;
  }

  const file = fileInput.files && fileInput.files[0];
  const picture = pictureInput.files && pictureInput.files[0];
  if (file && file.type !== "application/pdf") {
    cmShowError("Supporting document must be a PDF file.");
    return;
  }
  if (file && file.size > 5 * 1024 * 1024) {
    cmShowError("Supporting document must be 5MB or smaller.");
    return;
  }
  if (!picture || !["image/jpeg", "image/png"].includes(picture.type) || picture.size > 5 * 1024 * 1024) {
    cmShowError("Upload a JPG or PNG 2×2 picture no larger than 5 MB.");
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const franchise = window.__currentFranchise;
  if (!franchise) {
    cmShowError("You need an approved franchise to request a change motor.");
    return;
  }

  cmShowError("");
  const btn = document.getElementById("cmSubmitBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Submitting...';

  let storagePath = null;
  let fileName = null;
  const picturePath = "change-motor/" + franchise.id + "/picture-" + Date.now() + "-" + picture.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const pictureUpload = await supabase.storage.from("franchise-documents").upload(picturePath, picture, { contentType: picture.type });
  if (pictureUpload.error) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-send-plane-line"></i> Submit Request';
    cmShowError("Could not upload the 2×2 picture: " + pictureUpload.error.message);
    return;
  }
  if (file) {
    storagePath = "change-motor/" + franchise.id + "/" + Date.now() + "-" + file.name;
    const { error: uploadError } = await supabase.storage
      .from("franchise-documents")
      .upload(storagePath, file);
    if (uploadError) {
      await supabase.storage.from("franchise-documents").remove([picturePath]);
      console.error("Upload error:", uploadError);
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-send-plane-line"></i> Submit Request';
      cmShowError("Could not upload document: " + uploadError.message);
      return;
    }
    fileName = file.name;
  }

  const requestCode =
    "CM-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6);

  const { error } = await supabase.from("change_motor_requests").insert({
    operator_id: user.id,
    franchise_id: franchise.id,
    request_code: requestCode,
    old_engine_number: franchise.engine_number || null,
    old_chassis_number: franchise.chassis_number || null,
    old_plate_number: franchise.plate_number || null,
    old_motor_brand: franchise.motorcycle_brand || null,
    old_motor_model: franchise.motorcycle_year_model ? String(franchise.motorcycle_year_model) : null,
    new_engine_number: engine || null,
    new_chassis_number: chassis || null,
    new_plate_number: plate || null,
    new_motor_brand: brand || null,
    new_motor_serial: serial || null,
    supporting_file_name: fileName,
    supporting_storage_path: storagePath,
    picture_storage_path: picturePath,
    status: "pending_review",
  });

  if (error) {
    await supabase.storage.from("franchise-documents").remove([picturePath, storagePath].filter(Boolean));
    console.error("Insert change motor error:", error);
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-send-plane-line"></i> Submit Request';
    cmShowError("Could not submit request: " + error.message);
    return;
  }

  // A database trigger notifies admin/staff without granting operators access
  // to create notifications for other users.

  btn.disabled = false;
  btn.innerHTML = '<i class="ri-send-plane-line"></i> Submit Request';
  document.getElementById("cmEngine").value = "";
  document.getElementById("cmChassis").value = "";
  document.getElementById("cmPlate").value = "";
  document.getElementById("cmBrand").value = "";
  document.getElementById("cmSerial").value = "";
  fileInput.value = "";
  pictureInput.value = "";
  alert("Change Motor request submitted for review.");
  logAudit({
    action: "Submitted Change Motor Request",
    actionType: "create",
    record: requestCode,
    description: `Submitted a Change Motor/MTOP request (${requestCode}) for franchise ${franchise.franchise_number}.`,
  });
  loadChangeMotorHistory(user.id);
}

/* BIND CHANGE MOTOR SUBMIT */
const cmSubmitBtn = document.getElementById("cmSubmitBtn");
if (cmSubmitBtn) {
  cmSubmitBtn.addEventListener("click", submitChangeMotor);
  cmSubmitBtn.dataset.ready = "true";
}

/* LOGOUT */
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  window.location.href = "index.html";
});
