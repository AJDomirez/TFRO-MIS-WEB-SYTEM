import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";

let drivers = [];
const table = document.getElementById("driversTable");
const formPanel = document.getElementById("driverFormPanel");
const form = document.getElementById("driverForm");
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" })[c]); }
function initials(name) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

function licenseStatusLabel(row) {
  const s = (row.license_status || "not_verified").toLowerCase();
  const exp = row.license_expiration ? new Date(row.license_expiration) : null;
  if (exp && exp < new Date()) return '<span class="status non-compliant">Expired</span>';
  if (s === "verified") return '<span class="status compliant">Verified</span>';
  return '<span class="status non-compliant">Not Verified</span>';
}

function render() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const filter = document.getElementById("complianceFilter").value;
  const rows = drivers.filter((row) => (filter === "all" || row.compliance === filter) && [row.full_name, row.license_number, row.operator_name].some((value) => value.toLowerCase().includes(term)));
  table.innerHTML = rows.length ? rows.map((row) => {
    const violationClass = row.violation_count >= 3 ? "high" : row.violation_count > 0 ? "low" : "none";
    return `<tr><td><div class="driver-info"><div class="avatar">${initials(row.full_name)}</div><span>${escapeHtml(row.full_name)}</span></div></td><td class="license">${escapeHtml(row.license_number)}</td><td>${escapeHtml(row.operator_name)}</td><td>${escapeHtml(row.contact_number)}</td><td><div class="violation-badge ${violationClass}">${row.violation_count}</div></td><td><span class="status ${row.compliance}">${row.compliance}</span></td><td>${licenseStatusLabel(row)}</td><td><div class="actions"><button data-action="assign" data-id="${row.id}" title="Assign to Operator/Franchise"><i class="ri-user-add-line"></i></button><button data-action="verify" data-id="${row.id}" title="Verify License"><i class="ri-verified-badge-line"></i></button></div></td></tr>`;
  }).join("") : '<tr><td colspan="8">No drivers found.</td></tr>';
}
async function loadDrivers() {
  const { data, error } = await supabase.from("drivers").select("*").order("full_name");
  if (error) { console.error(error); return alert("Could not load drivers. Run supabase/setup-drivers.sql in SQL Editor."); }
  drivers = data; render();
}
async function verifyAccess() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return window.location.replace("index.html");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (!profile || !["admin", "staff"].includes(profile.role)) { await supabase.auth.signOut(); return window.location.replace("index.html"); }
  loadDrivers();
}
document.getElementById("addDriverBtn").addEventListener("click", () => { formPanel.hidden = false; });
document.getElementById("cancelDriverBtn").addEventListener("click", () => { form.reset(); formPanel.hidden = true; });
document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("complianceFilter").addEventListener("change", render);
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const entry = Object.fromEntries(new FormData(form));
  const { error } = await supabase.from("drivers").insert({ full_name: entry.full_name.trim(), license_number: entry.license_number.trim(), operator_name: entry.operator_name.trim(), contact_number: entry.contact_number.trim(), compliance: entry.compliance });
  if (error) return alert(`Could not save driver: ${error.message}`);
  form.reset(); formPanel.hidden = true; loadDrivers();
  logAudit({
    action: "Added Driver",
    actionType: "create",
    record: entry.full_name.trim(),
    description: `Added new driver record for ${entry.full_name.trim()} (License ${entry.license_number.trim()}).`,
  });
});
document.getElementById("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });

/* ============ ASSIGN DRIVER TO OPERATOR / FRANCHISE ============ */
let currentDriver = null;
let operatorsList = [];
let franchisesList = [];

async function loadAssignDropdowns() {
  const [opRes, frRes] = await Promise.all([
    supabase.from("operators").select("id, full_name"),
    supabase.from("franchises").select("id, franchise_number, operator_name"),
  ]);
  operatorsList = opRes.data || [];
  franchisesList = frRes.data || [];
}

async function openAssignModal(id) {
  currentDriver = drivers.find((d) => String(d.id) === String(id));
  if (!currentDriver) return;

  await loadAssignDropdowns();
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

  // Update driver row with operator/franchise linkage
  await supabase.from("drivers").update({
    operator_name: op ? op.full_name : null,
    operator_id: Number(operatorId),
    franchise_id: Number(franchiseId),
  }).eq("id", currentDriver.id);

  // Upsert driver_assignments
  const { error } = await supabase.from("driver_assignments").upsert({
    driver_id: currentDriver.id,
    driver_user_id: currentDriver.user_id || null,
    operator_id: Number(operatorId),
    operator_user_id: op && op.user_id ? op.user_id : null,
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
  const session = await supabase.auth.getUser();
  const userId = session.data?.user?.id;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { error } = await supabase.from("drivers").update({
    license_status: "verified",
    license_verified_at: new Date().toISOString(),
    compliance: "compliant",
  }).eq("id", id);
  if (error) return alert("Could not verify license: " + error.message);
  if (userId) {
    await supabase.from("notifications").insert({
      user_id: driver.user_id || null,
      message: "Your driver's license has been verified by " + (profile?.full_name || "TFRO staff") + ".",
      link: "driverportal.html",
      type: "success",
    }).catch(() => {});
  }
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
  if (btn.dataset.action === "assign") openAssignModal(btn.dataset.id);
  if (btn.dataset.action === "verify") verifyLicense(btn.dataset.id);
});
document.getElementById("saveAssignBtn")?.addEventListener("click", saveAssignment);
document.querySelectorAll("[data-close]").forEach((el) =>
  el.addEventListener("click", () => { document.getElementById(el.dataset.close).hidden = true; })
);

verifyAccess();
