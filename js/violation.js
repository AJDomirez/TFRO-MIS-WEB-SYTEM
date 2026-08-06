import { supabase } from "./supabase.js";

let violations = [];
const table = document.getElementById("violationsTable");
const formPanel = document.getElementById("violationFormPanel");
const form = document.getElementById("violationForm");
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" })[c]); }
function render() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const rows = violations.filter((row) => (status === "all" || row.status === status) && [row.subject_name || "", row.violation_type, row.description || ""].some((value) => value.toLowerCase().includes(term)));
  table.innerHTML = rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.subject_name || "—")}</td><td><span class="type ${row.subject_type}">${row.subject_type || "—"}</span></td><td>${escapeHtml(row.violation_type)}</td><td>${money.format(row.penalty)}</td><td>${new Date(row.occurred_at).toLocaleDateString()}</td><td><span class="status ${row.status}">${row.status}</span></td><td>—</td></tr>`).join("") : '<tr><td colspan="7">No violations found.</td></tr>';
}
async function loadViolations() {
  const { data, error } = await supabase.from("violations").select("*").order("occurred_at", { ascending: false });
  if (error) { console.error(error); return alert("Could not load violations. Run supabase/setup-violations.sql in SQL Editor."); }
  violations = data; render();
}
async function verifyAccess() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return window.location.replace("index.html");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (!profile || !["admin", "staff"].includes(profile.role)) { await supabase.auth.signOut(); return window.location.replace("index.html"); }
  loadViolations();
}
document.getElementById("addViolationBtn").addEventListener("click", () => { formPanel.hidden = false; });
document.getElementById("cancelViolationBtn").addEventListener("click", () => { form.reset(); formPanel.hidden = true; });
document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("statusFilter").addEventListener("change", render);
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const entry = Object.fromEntries(new FormData(form));
  const { error } = await supabase.from("violations").insert({ subject_name: entry.subject_name.trim(), subject_type: entry.subject_type, violation_type: entry.violation_type.trim(), description: entry.description.trim() || null, penalty: Number(entry.penalty), status: entry.status, occurred_at: `${entry.occurred_date}T00:00:00` });
  if (error) return alert(`Could not save violation: ${error.message}`);
  form.reset(); formPanel.hidden = true; loadViolations();
});
document.getElementById("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });
verifyAccess();
