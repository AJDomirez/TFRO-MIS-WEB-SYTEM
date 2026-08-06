import { supabase } from "./supabase.js";

let drivers = [];
const table = document.getElementById("driversTable");
const formPanel = document.getElementById("driverFormPanel");
const form = document.getElementById("driverForm");
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" })[c]); }
function initials(name) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

function render() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const filter = document.getElementById("complianceFilter").value;
  const rows = drivers.filter((row) => (filter === "all" || row.compliance === filter) && [row.full_name, row.license_number, row.operator_name].some((value) => value.toLowerCase().includes(term)));
  table.innerHTML = rows.length ? rows.map((row) => {
    const violationClass = row.violation_count >= 3 ? "high" : row.violation_count > 0 ? "low" : "none";
    return `<tr><td><div class="driver-info"><div class="avatar">${initials(row.full_name)}</div><span>${escapeHtml(row.full_name)}</span></div></td><td class="license">${escapeHtml(row.license_number)}</td><td>${escapeHtml(row.operator_name)}</td><td>${escapeHtml(row.contact_number)}</td><td><div class="violation-badge ${violationClass}">${row.violation_count}</div></td><td><span class="status ${row.compliance}">${row.compliance}</span></td><td>—</td></tr>`;
  }).join("") : '<tr><td colspan="7">No drivers found.</td></tr>';
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
});
document.getElementById("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });
verifyAccess();
