import { supabase } from "./supabase.js";

let operators = [];
const table = document.getElementById("operatorsTable");
const formPanel = document.getElementById("operatorFormPanel");
const form = document.getElementById("operatorForm");

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" })[c]); }
function setCount(id, value) { document.getElementById(id).textContent = value; }

function render() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const rows = operators.filter((row) => (status === "all" || row.status === status) && [row.full_name, row.address, row.franchise_number || ""].some((value) => value.toLowerCase().includes(term)));
  table.innerHTML = rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.full_name)}</td><td>${escapeHtml(row.address)}</td><td>${escapeHtml(row.contact_number)}</td><td>${escapeHtml(row.franchise_number || "—")}</td><td><span class="status ${row.status}">${row.status}</span></td><td>—</td></tr>`).join("") : '<tr><td colspan="6">No operators found.</td></tr>';
  setCount("totalOperators", operators.length);
  setCount("activeOperators", operators.filter((row) => row.status === "active").length);
  setCount("inactiveOperators", operators.filter((row) => row.status === "inactive").length);
  setCount("suspendedOperators", operators.filter((row) => row.status === "suspended").length);
}

async function loadOperators() {
  const { data, error } = await supabase.from("operators").select("*").order("full_name");
  if (error) { console.error(error); alert("Could not load operators. Run supabase/setup-operators.sql in SQL Editor."); return; }
  operators = data; render();
}

async function verifyAccess() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return window.location.replace("index.html");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (!profile || !["admin", "staff"].includes(profile.role)) { await supabase.auth.signOut(); return window.location.replace("index.html"); }
  loadOperators();
}

document.getElementById("addOperatorBtn").addEventListener("click", () => { formPanel.hidden = false; });
document.getElementById("cancelOperatorBtn").addEventListener("click", () => { form.reset(); formPanel.hidden = true; });
document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("statusFilter").addEventListener("change", render);
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const entry = Object.fromEntries(new FormData(form));
  const { error } = await supabase.from("operators").insert({ full_name: entry.full_name.trim(), address: entry.address.trim(), contact_number: entry.contact_number.trim(), franchise_number: entry.franchise_number.trim() || null, status: entry.status });
  if (error) return alert(`Could not save operator: ${error.message}`);
  form.reset(); formPanel.hidden = true; loadOperators();
});
document.getElementById("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });
verifyAccess();
