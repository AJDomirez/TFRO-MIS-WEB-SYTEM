import { supabase } from "./supabase.js";

/* ROLE PROTECTION */
const role = localStorage.getItem("role");
if (role !== "driver") {
  alert("Access Denied");
  window.location.href = "index.html";
}

/* DATE */
const today = new Date();
const dateToday = document.getElementById("dateToday");
if (dateToday) dateToday.textContent = today.toDateString();

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

  const fullName = profile?.full_name || user.user_metadata?.full_name || "Driver";
  const contact = profile?.contact_number || user.user_metadata?.contact_number || "";

  /* Sidebar + welcome */
  setText("userName", fullName);
  setText("userAvatar", initials(fullName));
  setText("welcomeName", fullName);

  /* Driver record */
  const { data: driver } = await supabase
    .from("drivers")
    .select("*")
    .eq("full_name", fullName)
    .maybeSingle();

  if (driver) {
    setText("licenseNumber", driver.license_number);
    setText("assignedOperator", driver.operator_name);
    setText("contactNumber", driver.contact_number || contact);
    setText(
      "registrationDate",
      driver.created_at ? new Date(driver.created_at).toLocaleDateString() : "—"
    );

    const compliant = driver.compliance === "compliant";
    setText("complianceStatus", compliant ? "✓ Compliant" : "✗ Non-Compliant");

    const badge = document.getElementById("complianceBadge");
    if (badge) {
      badge.className = "status " + (compliant ? "compliant" : "non-compliant");
      badge.innerHTML = `<i class="ri-${
        compliant ? "checkbox-circle" : "close-circle"
      }-line"></i> ${compliant ? "Compliant" : "Non-Compliant"}`;
    }

    /* Franchise number linked through the operator's name */
    const { data: franchise } = await supabase
      .from("franchises")
      .select("franchise_number")
      .eq("operator_name", driver.operator_name || "")
      .limit(1)
      .maybeSingle();
    setText("franchiseNumber", franchise?.franchise_number);
  } else {
    setText("licenseNumber", "—");
    setText("assignedOperator", "—");
    setText("contactNumber", contact || "—");
    setText("registrationDate", "—");
    setText("complianceStatus", "—");
    setText("franchiseNumber", "—");
  }

  /* Violations */
  const { data: violations } = await supabase
    .from("violations")
    .select("violation_type, occurred_at, penalty, status")
    .eq("subject_name", fullName)
    .eq("subject_type", "driver");
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

