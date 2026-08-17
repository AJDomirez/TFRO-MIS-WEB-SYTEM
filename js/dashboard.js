import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

const currencyFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });

function setText(id, value) { document.getElementById(id).textContent = value; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]);
}
function lastSixMonths() {
  const months = [], now = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) months.push(new Date(now.getFullYear(), now.getMonth() - offset, 1));
  return months;
}
function renderApplications(franchises) {
  const months = lastSixMonths(), applications = Array(6).fill(0), renewals = Array(6).fill(0);
  franchises.forEach((franchise) => {
    const date = new Date(`${franchise.application_date}T00:00:00`);
    const index = months.findIndex((month) => month.getFullYear() === date.getFullYear() && month.getMonth() === date.getMonth());
    if (index >= 0) (franchise.application_type === "renewal" ? renewals : applications)[index] += 1;
  });
  new Chart(document.getElementById("applicationsChart"), { type: "bar", data: { labels: months.map((month) => monthFormatter.format(month)), datasets: [
    { label: "Applications", data: applications, backgroundColor: "#1d4ed8" },
    { label: "Renewals", data: renewals, backgroundColor: "#60a5fa" },
  ] } });
}
function renderViolations(violations) {
  const counts = violations.reduce((result, row) => ({ ...result, [row.violation_type]: (result[row.violation_type] || 0) + 1 }), {});
  const labels = Object.keys(counts);
  new Chart(document.getElementById("violationsChart"), {
    type: "pie",
    data: { labels: labels.length ? labels : ["No violations recorded"], datasets: [{ data: labels.length ? Object.values(counts) : [1], backgroundColor: labels.length ? ["#1d4ed8", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"] : ["#cbd5e1"] }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

async function loadDashboard() {
  const { user } = await requireRole(["admin", "staff"]);
  if (!user) return;
  const today = new Date(), todayIso = today.toISOString().slice(0, 10), expiryDate = new Date(today);
  expiryDate.setDate(today.getDate() + 14);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const results = await Promise.all([
    supabase.from("franchises").select("application_date, application_type", { count: "exact" }),
    supabase.from("franchises").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("franchises").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("payments").select("amount").gte("paid_at", monthStart),
    supabase.from("franchises").select("franchise_number, operator_name, route, expiration_date").gte("expiration_date", todayIso).lte("expiration_date", expiryDate.toISOString().slice(0, 10)).order("expiration_date").limit(10),
    supabase.from("violations").select("violation_type"),
  ]);
  const errors = results.map((result) => result.error).filter(Boolean);
  if (errors.length) { console.error("Dashboard data error:", errors); alert("Dashboard data could not load. Run supabase/setup-dashboard.sql in Supabase SQL Editor."); return; }
  const [franchises, active, pending, payments, expiring, violations] = results;
  setText("totalFranchises", franchises.count ?? 0);
  setText("activeFranchises", active.count ?? 0);
  setText("pendingApplications", pending.count ?? 0);
  document.querySelector(".stats-grid .card:nth-child(4) h2").textContent = currencyFormatter.format((payments.data || []).reduce((total, payment) => total + Number(payment.amount), 0));
  setText("expiringCount", (expiring.data || []).length);
  document.getElementById("expiringRows").innerHTML = expiring.data?.length ? expiring.data.map((row) => {
    const days = Math.ceil((new Date(`${row.expiration_date}T00:00:00`) - today) / 86400000);
    return `<tr><td>${escapeHtml(row.franchise_number)}</td><td>${escapeHtml(row.operator_name)}</td><td>${escapeHtml(row.route)}</td><td>${days} Day${days === 1 ? "" : "s"}</td></tr>`;
  }).join("") : '<tr><td colspan="4">No franchises expire within 14 days.</td></tr>';
  if (typeof Chart === "function") {
    renderApplications(franchises.data || []);
    renderViolations(violations.data || []);
  } else {
    console.warn("Chart.js did not load; dashboard totals are available without charts.");
  }
}

document.getElementById("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });

/* POPULATE SIDEBAR USER INFO FROM THE LOGGED-IN PROFILE */
function initials(name = "") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase())
      .slice(0, 2)
      .join("") || "U"
  );
}
function roleLabel(role) {
  const map = { admin: "Administrator", staff: "Staff", operator: "Operator", driver: "Driver" };
  return map[role] || role || "User";
}
async function loadUserInfo() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();
  const fullName = profile?.full_name || sessionData.session.user.user_metadata?.full_name || "";
  const role = profile?.role || localStorage.getItem("role") || "";
  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const avatarEl = document.getElementById("userAvatar");
  if (nameEl) nameEl.textContent = fullName || roleLabel(role);
  if (roleEl) roleEl.textContent = roleLabel(role);
  if (avatarEl) avatarEl.textContent = initials(fullName);
}
loadDashboard();
loadUserInfo();
