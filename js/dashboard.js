import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

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
function renderApplications({ operators, drivers, motorRequests, renewals }) {
  const months = lastSixMonths();
  const countByMonth = (rows) => {
    const counts = Array(6).fill(0);
    rows.forEach((row) => {
      const date = new Date(row.created_at);
      const index = months.findIndex((month) => month.getFullYear() === date.getFullYear() && month.getMonth() === date.getMonth());
      if (index >= 0) counts[index] += 1;
    });
    return counts;
  };
  new Chart(document.getElementById("applicationsChart"), { type: "bar", data: { labels: months.map((month) => monthFormatter.format(month)), datasets: [
    { label: "Operators", data: countByMonth(operators), backgroundColor: "#0b5c41", borderRadius: 6 },
    { label: "Drivers", data: countByMonth(drivers), backgroundColor: "#15915e", borderRadius: 6 },
    { label: "Change Motor", data: countByMonth(motorRequests), backgroundColor: "#e5ad17", borderRadius: 6 },
    { label: "Renewals", data: countByMonth(renewals), backgroundColor: "#f4c430", borderRadius: 6 },
  ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
}
function renderViolations(violations) {
  const counts = violations.reduce((result, row) => ({ ...result, [row.violation_type]: (result[row.violation_type] || 0) + 1 }), {});
  const labels = Object.keys(counts);
  new Chart(document.getElementById("violationsChart"), {
    type: "pie",
    data: { labels: labels.length ? labels : ["No violations recorded"], datasets: [{ data: labels.length ? Object.values(counts) : [1], backgroundColor: labels.length ? ["#0b5c41", "#15915e", "#f4c430", "#d97706", "#77b99b"] : ["#dcebe3"] }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

async function loadDashboard() {
  const { user } = await requireRole(["admin"]);
  if (!user) return;
  const today = new Date(), todayIso = today.toISOString().slice(0, 10), expiryDate = new Date(today);
  expiryDate.setDate(today.getDate() + 14);
  const results = await Promise.all([
    supabase.from("franchises").select("application_date, application_type", { count: "exact" }),
    supabase.from("franchises").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("franchise_renewals").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("franchises").select("franchise_number, operator_name, route, expiration_date").gte("expiration_date", todayIso).lte("expiration_date", expiryDate.toISOString().slice(0, 10)).order("expiration_date").limit(10),
    supabase.from("violations").select("violation_type, status, penalty"),
    supabase.from("operators").select("created_at"),
    supabase.from("drivers").select("created_at"),
    supabase.from("change_motor_requests").select("created_at"),
    supabase.from("franchise_renewals").select("created_at"),
    supabase.from("payments").select("amount, status, payment_type").eq("payment_type", "penalty"),
  ]);
  const errors = results.map((result) => result.error).filter(Boolean);
  if (errors.length) { console.error("Dashboard data error:", errors); alert("Dashboard data could not load. Run supabase/setup-dashboard.sql in Supabase SQL Editor."); return; }
  const [franchises, active, pendingRenewals, expiring, violations, operators, drivers, motorRequests, renewals, violationPayments] = results;
  setText("totalFranchises", franchises.count ?? 0);
  setText("activeFranchises", active.count ?? 0);
  setText("pendingRenewals", pendingRenewals.count ?? 0);
  setText("totalViolations", (violations.data || []).length);
  setText("pendingViolations", (violations.data || []).filter((row) => row.status === "pending").length);
  setText("violationCollections", new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    (violationPayments.data || []).filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount || 0), 0)
  ));
  setText("expiringCount", (expiring.data || []).length);
  document.getElementById("expiringRows").innerHTML = expiring.data?.length ? expiring.data.map((row) => {
    const days = Math.ceil((new Date(`${row.expiration_date}T00:00:00`) - today) / 86400000);
    return `<tr><td>${escapeHtml(row.franchise_number)}</td><td>${escapeHtml(row.operator_name)}</td><td>${escapeHtml(row.route)}</td><td>${days} Day${days === 1 ? "" : "s"}</td></tr>`;
  }).join("") : '<tr><td colspan="4">No franchises expire within 14 days.</td></tr>';
  if (typeof Chart === "function") {
    renderApplications({
      operators: operators.data || [], drivers: drivers.data || [],
      motorRequests: motorRequests.data || [], renewals: renewals.data || [],
    });
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
  const map = { admin: "Administrator", staff: "TFRO Staff", operator: "Operator" };
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
