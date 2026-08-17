import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";
import { bindDateCsvExport, isWithinDateRange } from "./csv-export.js";

let drivers = [];
const table = document.getElementById("driversTable");
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" })[c]); }
function initials(name) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

function licenseStatusLabel(row) {
  const s = (row.license_status || "not_verified").toLowerCase();
  const exp = row.license_expiration ? new Date(row.license_expiration) : null;
  if (exp && exp < new Date()) return '<span class="status non-compliant">Expired</span>';
  if (s === "verified") return '<span class="status compliant">Verified</span>';
  return '<span class="status non-compliant">Not Verified</span>';
}

function filteredDrivers() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const filter = document.getElementById("complianceFilter").value;
  return drivers.filter((row) => isWithinDateRange(row.created_at) &&
    (filter === "all" || row.compliance === filter) &&
    [row.full_name, row.license_number, row.operator_name]
      .some((value) => String(value || "").toLowerCase().includes(term)));
}

function render() {
  const rows = filteredDrivers();
  table.innerHTML = rows.length ? rows.map((row) => {
    const violationClass = row.violation_count >= 3 ? "high" : row.violation_count > 0 ? "low" : "none";
    return `<tr><td><div class="driver-info"><div class="avatar">${initials(row.full_name)}</div><span>${escapeHtml(row.full_name)}</span></div></td><td class="license">${escapeHtml(row.license_number)}</td><td>${escapeHtml(row.operator_name)}</td><td>${escapeHtml(row.contact_number)}</td><td><div class="violation-badge ${violationClass}">${row.violation_count}</div></td><td><span class="status ${row.compliance}">${row.compliance}</span></td><td>${licenseStatusLabel(row)}</td><td><div class="actions"><button data-action="view" data-id="${row.id}" title="View submitted form"><i class="ri-eye-line"></i></button><button data-action="assign" data-id="${row.id}" title="Assign to Operator/Franchise"><i class="ri-user-add-line"></i></button><button data-action="verify" data-id="${row.id}" title="Verify License"><i class="ri-verified-badge-line"></i></button></div></td></tr>`;
  }).join("") : '<tr><td colspan="8">No drivers found.</td></tr>';
}
async function loadDrivers() {
  const { data, error } = await supabase.from("drivers").select("*").order("full_name");
  if (error) { console.error(error); return alert("Could not load drivers. Run supabase/setup-drivers.sql in SQL Editor."); }
  drivers = data; render();
}
async function verifyAccess() {
  const { user } = await requireRole(["admin", "staff"]);
  if (!user) return;
  loadDrivers();
}
document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("complianceFilter").addEventListener("change", render);
bindDateCsvExport({
  getRows: filteredDrivers,
  render,
  filename: "tfro_driver_applications",
  columns: [
    { header: "Driver Name", value: (row) => row.full_name },
    { header: "Address", value: (row) => row.address },
    { header: "Contact Number", value: (row) => row.contact_number },
    { header: "License Number", value: (row) => row.license_number },
    { header: "License Type", value: (row) => row.license_type },
    { header: "License Expiration", value: (row) => row.license_expiration },
    { header: "License Status", value: (row) => row.license_status },
    { header: "Operator", value: (row) => row.operator_name },
    { header: "Franchise ID", value: (row) => row.franchise_id },
    { header: "Compliance", value: (row) => row.compliance },
    { header: "Violation Count", value: (row) => row.violation_count },
    { header: "Submitted At", value: (row) => row.created_at },
  ],
});
document.getElementById("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });

/* ============ ASSIGN DRIVER TO OPERATOR / FRANCHISE ============ */
let currentDriver = null;
let operatorsList = [];
let franchisesList = [];

function driverDetail(label, value) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;
  return `<div><label>${escapeHtml(label)}</label><strong>${escapeHtml(displayValue)}</strong></div>`;
}

function openDriverForm(id) {
  const driver = drivers.find((row) => String(row.id) === String(id));
  if (!driver) return;
  document.getElementById("driverFormDetails").innerHTML = [
    driverDetail("Driver Name", driver.full_name),
    driverDetail("Address", driver.address),
    driverDetail("Contact Number", driver.contact_number),
    driverDetail("Driver's License Number", driver.license_number),
    driverDetail("License Type", driver.license_type),
    driverDetail("License Expiration", driver.license_expiration),
    driverDetail("License Status", driver.license_status),
    driverDetail("Operator", driver.operator_name),
    driverDetail("Franchise ID", driver.franchise_id),
    driverDetail("Compliance", driver.compliance),
    driverDetail("Violations", driver.violation_count),
    driverDetail("Submitted", driver.created_at ? new Date(driver.created_at).toLocaleString() : "—"),
  ].join("");
  document.getElementById("driverFormModal").hidden = false;
}

async function loadAssignDropdowns() {
  const [opRes, frRes] = await Promise.all([
    supabase.from("operators").select("id, full_name, user_id"),
    supabase.from("franchises").select("id, franchise_number, operator_name, operator_id"),
  ]);
  if (opRes.error) throw opRes.error;
  if (frRes.error) throw frRes.error;
  operatorsList = opRes.data || [];
  franchisesList = frRes.data || [];
}

async function openAssignModal(id) {
  currentDriver = drivers.find((d) => String(d.id) === String(id));
  if (!currentDriver) return;

  try {
    await loadAssignDropdowns();
  } catch (error) {
    console.error("Assignment options error:", error);
    alert("Could not load operators and franchises: " + error.message);
    return;
  }
  const opSel = document.getElementById("assignOperator");
  const frSel = document.getElementById("assignFranchise");
  opSel.innerHTML = '<option value="">Select operator...</option>' +
    operatorsList.map((o) => `<option value="${o.id}">${escapeHtml(o.full_name)}</option>`).join("");
  frSel.innerHTML = '<option value="">Select approved franchise...</option>' +
    franchisesList.map((f) => `<option value="${f.id}">${escapeHtml(f.franchise_number)} — ${escapeHtml(f.operator_name || "")}</option>`).join("");

  document.getElementById("assignDriverName").textContent = currentDriver.full_name || "Driver";
  opSel.value = "";
  frSel.value = "";
  document.getElementById("assignModal").hidden = false;
}

async function saveAssignment() {
  const operatorId = document.getElementById("assignOperator").value;
  const franchiseId = document.getElementById("assignFranchise").value;
  if (!operatorId || !franchiseId) { alert("Please select both an operator and a franchise."); return; }

  const op = operatorsList.find((o) => String(o.id) === String(operatorId));
  const fr = franchisesList.find((f) => String(f.id) === String(franchiseId));
  const belongsToOperator = !fr?.operator_id || !op?.user_id
    ? String(fr?.operator_name || "").toLowerCase() === String(op?.full_name || "").toLowerCase()
    : fr.operator_id === op.user_id;
  if (!op || !fr || !belongsToOperator) {
    alert("The selected franchise does not belong to the selected operator.");
    return;
  }

  // Update driver row with operator/franchise linkage
  const { error: driverUpdateError } = await supabase.from("drivers").update({
    operator_name: op ? op.full_name : null,
    operator_id: Number(operatorId),
    franchise_id: Number(franchiseId),
  }).eq("id", currentDriver.id);
  if (driverUpdateError) {
    console.error("Driver assignment update error:", driverUpdateError);
    alert("Could not update the driver record: " + driverUpdateError.message);
    return;
  }

  // Upsert driver_assignments
  const { error } = await supabase.from("driver_assignments").upsert({
    driver_id: currentDriver.id,
    driver_user_id: currentDriver.user_id || null,
    operator_id: Number(operatorId),
    operator_user_id: op.user_id || null,
    franchise_id: Number(franchiseId),
    status: "active",
  }, { onConflict: "driver_id, franchise_id" });
  if (error) { console.error("Assignment error:", error); return alert("Could not assign driver: " + error.message); }

document.getElementById("assignModal").hidden = true;
  alert("Driver assigned successfully.");
  loadDrivers();

  logAudit({
    action: "Assigned Driver to Franchise",
    actionType: "assignment",
    record: currentDriver.full_name,
    description: `Assigned driver ${currentDriver.full_name} to operator ${op?.full_name || ""} (franchise ${fr?.franchise_number || ""}).`,
  });
}

async function verifyLicense(id) {
  const driver = drivers.find((d) => String(d.id) === String(id));
  if (!driver) return;
  const { error } = await supabase.from("drivers").update({
    license_status: "verified",
    license_verified_at: new Date().toISOString(),
    compliance: "compliant",
  }).eq("id", id);
  if (error) return alert("Could not verify license: " + error.message);
alert("License verified. Driver is now compliant.");
  loadDrivers();

  logAudit({
    action: "Verified Driver License",
    actionType: "verification",
    record: driver.full_name,
    description: `Verified driver's license for ${driver.full_name} (License ${driver.license_number}).`,
  });
}

table.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "view") openDriverForm(btn.dataset.id);
  if (btn.dataset.action === "assign") openAssignModal(btn.dataset.id);
  if (btn.dataset.action === "verify") verifyLicense(btn.dataset.id);
});
document.getElementById("saveAssignBtn")?.addEventListener("click", saveAssignment);
document.querySelectorAll("[data-close]").forEach((el) =>
  el.addEventListener("click", () => { document.getElementById(el.dataset.close).hidden = true; })
);

verifyAccess();
