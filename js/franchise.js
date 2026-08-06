import { supabase } from "./supabase.js";

let franchises = [];
const table = document.getElementById("franchiseTable");
const formPanel = document.getElementById("applicationPanel");
const form = document.getElementById("franchiseForm");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[c]);
}

function displayStatus(status) { return status === "active" ? "approved" : status; }

function renderTable() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const filter = document.getElementById("statusFilter").value;
  const rows = franchises.filter((row) => {
    const matchesSearch = [row.franchise_number, row.operator_name, row.route].some((value) => value.toLowerCase().includes(term));
    const matchesStatus = filter === "all" || displayStatus(row.status) === filter;
    return matchesSearch && matchesStatus;
  });
  table.innerHTML = rows.length ? rows.map((row) => {
    const status = displayStatus(row.status);
    return `<tr><td>${escapeHtml(row.franchise_number)}</td><td>${escapeHtml(row.operator_name)}</td><td>${escapeHtml(row.route)}</td><td>${escapeHtml(row.application_date)}</td><td>${row.expiration_date || "—"}</td><td><span class="status ${status}">${status}</span></td><td><div class="actions">${row.status === "pending" ? `<button data-action="approve" data-id="${row.id}" title="Approve"><i class="ri-checkbox-circle-line"></i></button><button data-action="reject" data-id="${row.id}" title="Reject"><i class="ri-close-circle-line"></i></button>` : "—"}</div></td></tr>`;
  }).join("") : '<tr><td colspan="7">No franchise records found.</td></tr>';
}

async function loadFranchises() {
  const { data, error } = await supabase.from("franchises").select("*").order("created_at", { ascending: false });
  if (error) { console.error(error); alert("Could not load franchises. Run setup-dashboard.sql and setup-franchises.sql in Supabase SQL Editor."); return; }
  franchises = data;
  renderTable();
}

async function verifyAccess() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return window.location.replace("index.html");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", sessionData.session.user.id).single();
  if (!profile || !["admin", "staff"].includes(profile.role)) { await supabase.auth.signOut(); return window.location.replace("index.html"); }
  await loadFranchises();
}

document.getElementById("newApplicationBtn").addEventListener("click", () => { formPanel.hidden = false; formPanel.scrollIntoView({ behavior: "smooth" }); });
document.getElementById("cancelApplicationBtn").addEventListener("click", () => { form.reset(); formPanel.hidden = true; });
document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("statusFilter").addEventListener("change", renderTable);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = Object.fromEntries(new FormData(form));
  const { error } = await supabase.from("franchises").insert({
    franchise_number: entry.franchise_number.trim(), operator_name: entry.operator_name.trim(), route: entry.route.trim(),
    application_type: entry.application_type, application_date: entry.application_date, expiration_date: entry.expiration_date || null, status: "pending",
  });
  if (error) { alert(`Could not save application: ${error.message}`); return; }
  form.reset(); formPanel.hidden = true; await loadFranchises();
});

table.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const status = button.dataset.action === "approve" ? "active" : "rejected";
  const { error } = await supabase.from("franchises").update({ status }).eq("id", button.dataset.id);
  if (error) { alert(`Could not update application: ${error.message}`); return; }
  await loadFranchises();
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });
verifyAccess();
