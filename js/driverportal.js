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

/* Driver record (prefer FK user_id, fallback to name) */
  let driver = null;
  const { data: driverByUser } = await supabase
    .from("drivers")
    .select("*")
    .eq("user_id", user.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (driverByUser) {
    driver = driverByUser;
  } else {
    const { data: driverByName } = await supabase
      .from("drivers")
      .select("*")
      .eq("full_name", fullName)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    driver = driverByName;
  }

  if (driver) {
    setText("licenseNumber", driver.license_number);
    setText("contactNumber", driver.contact_number || contact);
    setText(
      "registrationDate",
      driver.created_at ? new Date(driver.created_at).toLocaleDateString() : "—"
    );

    /* License verification status */
    const licenseStatus = (driver.license_status || "not_verified").toLowerCase();
    const exp = driver.license_expiration ? new Date(driver.license_expiration) : null;
    const isExpired = exp && exp < new Date();
    const effectiveStatus = isExpired ? "expired" : licenseStatus;

    /* Assigned operator + franchise via driver_assignments (FK) */
    let operatorName = driver.operator_name || "—";
    let franchiseNumber = "—";
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, operators(full_name, address), franchises(franchise_number)")
      .eq("driver_id", driver.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (assignment) {
      if (assignment.franchises) franchiseNumber = assignment.franchises.franchise_number;
      if (assignment.operators && assignment.operators.full_name) operatorName = assignment.operators.full_name;
    } else if (driver.franchise_id) {
      const { data: directFran } = await supabase
        .from("franchises")
        .select("franchise_number")
        .eq("id", driver.franchise_id)
        .maybeSingle();
      if (directFran) franchiseNumber = directFran.franchise_number;
    }
    setText("assignedOperator", operatorName);
    setText("franchiseNumber", franchiseNumber);

    /* Compliance reflects verified + not expired license */
    const compliant = effectiveStatus === "verified";
    setText("complianceStatus", compliant ? "✓ Compliant" : "✗ Non-Compliant");

    const badge = document.getElementById("complianceBadge");
    if (badge) {
      badge.className = "status " + (compliant ? "compliant" : "non-compliant");
      badge.innerHTML = `<i class="ri-${
        compliant ? "checkbox-circle" : "close-circle"
      }-line"></i> ${
        compliant ? "Compliant" : effectiveStatus === "expired" ? "License Expired" : "License Not Verified"
      }`;
    }

    /* License type + expiration into dedicated fields if present */
    if (document.getElementById("licenseType")) setText("licenseType", driver.license_type);
    if (document.getElementById("licenseExpiration")) {
      setText("licenseExpiration", driver.license_expiration ? new Date(driver.license_expiration).toLocaleDateString() : "—");
    }
    if (document.getElementById("licenseStatus")) {
      setText("licenseStatus", effectiveStatus === "verified" ? "✓ Verified" : (effectiveStatus === "expired" ? "Expired" : "Not Verified"));
    }
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

