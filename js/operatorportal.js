import { supabase } from "./supabase.js";

/* ROLE PROTECTION */
const role = localStorage.getItem("role");
if (role !== "operator") {
  alert("Access Denied");
  window.location.href = "index.html";
}

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
        <td>${v.violation_type || "—"}</td>
        <td>${v.occurred_at ? new Date(v.occurred_at).toLocaleDateString() : "—"}</td>
        <td>${money(v.penalty)}</td>
        <td><span class="badge">${v.status || "—"}</span></td>
      </tr>
    `;
  });
}

/* LOAD DATA */
async function loadPortal() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    window.location.href = "index.html";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.full_name || user.user_metadata?.full_name || "Operator";

  /* Sidebar + welcome */
  setText("userName", fullName);
  setText("userAvatar", initials(fullName));
  setText("welcomeName", fullName);

  /* Franchise */
  const { data: franchise } = await supabase
    .from("franchises")
    .select("*")
    .eq("operator_name", fullName)
    .limit(1)
    .maybeSingle();

  if (franchise) {
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
}

/* LOGOUT */
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  window.location.href = "index.html";
});

loadPortal();

