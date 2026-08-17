import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";

/* ROLE PROTECTION — server-verified, not localStorage */
let currentUser = null;
let currentProfile = null;
let currentOperatorRecord = null;
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

function money(value) {
  return value != null ? "₱" + Number(value).toLocaleString() : "—";
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
    .select("id, user_id, full_name, status, verified")
    .eq("user_id", user.id)
    .eq("verified", true)
    .eq("status", "active")
    .order("verified", { ascending: false })
    .order("id", { ascending: true });

  if (operatorError) console.error("Could not load operator record:", operatorError);
  currentOperatorRecord = (operatorRows || [])[0] || null;

  if (!currentOperatorRecord) {
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

  /* Franchise (prefer FK operator_id, fallback to operator name) */
  let franchise = null;
  const { data: franByUserId } = await supabase
    .from("franchises")
    .select("*")
    .eq("operator_id", user.id)
    .limit(1)
    .maybeSingle();
  if (franByUserId) {
    franchise = franByUserId;
  } else {
    const { data: franByName } = await supabase
      .from("franchises")
      .select("*")
      .eq("operator_name", fullName)
      .limit(1)
      .maybeSingle();
    franchise = franByName;
  }

  if (franchise) {
    window.__currentFranchise = franchise;
    setText("franchiseNumber", franchise.franchise_number);
    setText("assignedRoute", franchise.route);
    setText("dateApplied", franchise.application_date || "—");
    setText("expiryDate", franchise.expiration_date || "—");
    setText("annualFee", "—");
    setText("paymentStatus", "—");

    const badge = document.getElementById("franchiseStatus");
    if (badge) {
      const status = (franchise.status || "pending").toLowerCase();
      badge.className = "badge " + (status === "active" ? "approved" : "pending");
      badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
  } else {
    setText("franchiseNumber", "—");
    setText("assignedRoute", "—");
    setText("dateApplied", "—");
    setText("expiryDate", "—");
    setText("annualFee", "—");
    setText("paymentStatus", "—");

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
      '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Operator approval is required before adding a Driver.</td></tr>';
    return;
  }

  const { data: drivers, error } = await supabase
    .from("drivers")
    .select("id, full_name, license_number, license_status, created_at")
    .eq("operator_id", currentOperatorRecord.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load Driver applications:", error);
    table.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#b91c1c;">Could not load Driver applications.</td></tr>';
    return;
  }

  if (!drivers?.length) {
    table.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">No Driver applications yet.</td></tr>';
    return;
  }

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
      </tr>
    `;
  }).join("");
}

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
    franchise_id: null,
    violation_count: 0,
    compliance: "non-compliant",
    license_status: "not_verified",
    license_verified_at: null,
  };

  const { error } = await supabase.from("drivers").insert(driverRecord);
  button.disabled = false;
  button.innerHTML = '<i class="ri-user-add-line"></i> Submit Driver Application';

  if (error) {
    console.error("Driver application error:", error);
    setDriverFormMessage(
      error.code === "23505"
        ? "That Driver's license number is already registered."
        : `Could not submit the Driver application: ${error.message}`
    );
    return;
  }

  form.reset();
  alert("Driver application submitted to TFRO Staff for verification.");
  logAudit({
    action: "Submitted Driver Application",
    actionType: "create",
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
      '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No change motor requests.</td></tr>';
    return;
  }

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
      </tr>
    `;
  }).join("");
}

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

  if (!engine && !chassis && !plate) {
    cmShowError("Please provide at least one new detail (engine, chassis, or plate).");
    return;
  }

  const file = fileInput.files && fileInput.files[0];
  if (file && file.type !== "application/pdf") {
    cmShowError("Supporting document must be a PDF file.");
    return;
  }
  if (file && file.size > 5 * 1024 * 1024) {
    cmShowError("Supporting document must be 5MB or smaller.");
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
  if (file) {
    storagePath = "change-motor/" + franchise.id + "/" + Date.now() + "-" + file.name;
    const { error: uploadError } = await supabase.storage
      .from("franchise-documents")
      .upload(storagePath, file);
    if (uploadError) {
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
    new_engine_number: engine || null,
    new_chassis_number: chassis || null,
    new_plate_number: plate || null,
    new_motor_brand: brand || null,
    new_motor_serial: serial || null,
    supporting_file_name: fileName,
    supporting_storage_path: storagePath,
    status: "pending_review",
  });

  if (error) {
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
if (cmSubmitBtn) cmSubmitBtn.addEventListener("click", submitChangeMotor);

/* LOGOUT */
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  window.location.href = "index.html";
});
