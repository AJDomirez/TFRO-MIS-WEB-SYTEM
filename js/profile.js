import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

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

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

let currentUserId = null;
let currentUserRole = localStorage.getItem("role") || "";

/* ROLE LABEL */
function roleLabel(role) {
  const map = {
    admin: "Administrator",
    staff: "Staff",
    operator: "Operator",
    driver: "Driver",
  };
  return map[role] || role || "User";
}

/* AUDIT LOG HELPER */
async function logAudit(action, userName) {
  const lower = action.toLowerCase();
  const actionType = lower.includes("password") ? "update" : "update";
  try {
await supabase.from("audit_logs").insert({
      user_name: userName || null,
      role: currentUserRole || null,
      action,
      action_type: actionType,
      ip_address: null,
      user_id: currentUserId || null,
    });
  } catch (err) {
    console.error("Audit log insert failed:", err);
  }
}

/* LOAD PROFILE */
async function loadProfile() {
  const { user } = await requireRole(["admin", "staff"]);
  if (!user) return;
  currentUserId = user.id;

// Select only well-known columns so a missing 'contact_number' column
  // doesn't break profile loading before the schema is fixed.
  let profile = null;
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name, contact_number")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileError && profileData) {
    profile = profileData;
  } else {
    console.warn("Profile select issue:", profileError?.message);
    // Fallback to a minimal select that avoids the missing column.
    const { data: minimal } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (minimal) profile = minimal;
  }

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const contact = profile?.contact_number || user.user_metadata?.contact_number || "";
  const email = user.email || "";
  const role = profile?.role || currentUserRole || "";
  currentUserRole = role;
  const isAdmin = role === "admin";
  document.getElementById("contactNumberGroup").hidden = isAdmin;
  document.getElementById("settingsTabButton").hidden = !isAdmin;
  if (isAdmin) void loadSystemSettings();

  const names = fullName.split(" ").filter(Boolean);
  setValue("firstName", names[0] || "");
  setValue("lastName", names.slice(1).join(" ") || "");
  setValue("email", email);
  if (!isAdmin) setValue("contactNumber", contact);
  setValue("role", roleLabel(role));

  const label = roleLabel(role);
  const init = initials(fullName);

  setText("userName", fullName || label);
  setText("userRole", label);
  setText("userAvatar", init);
  setText("profileAvatar", init);
  setText("profileName", fullName || label);
  setText("profileRole", label);
  setText("profileEmail", email);

  /* Hide Payments menu for admins (kept from original page) */
  if (paymentMenu && role === "admin") {
    paymentMenu.style.display = "none";
  }
}

/* TAB SWITCHING */
function showTab(tab) {
  const profileTab = document.getElementById("profileTab");
  const passwordTab = document.getElementById("passwordTab");
  const settingsTab = document.getElementById("settingsTab");
  const buttons = document.querySelectorAll(".tab-btn");

  buttons.forEach((btn) => btn.classList.remove("active"));
  [profileTab, passwordTab, settingsTab].forEach((panel) => panel.classList.remove("active"));
  const panels = { profile: profileTab, password: passwordTab, settings: settingsTab };
  panels[tab]?.classList.add("active");
  document.querySelector(`.tab-btn[onclick="showTab('${tab}')"]`)?.classList.add("active");
}
window.showTab = showTab;

/* SAVE PROFILE */
document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const contactNumber = document.getElementById("contactNumber").value.trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (!fullName) {
    alert("Please enter your full name.");
    return;
  }

let contactWarned = false;

  // 1) Always update the full name first — this is required and its success
  //    is what refreshes the sidebar name.
  const { error: nameError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", currentUserId);

  if (nameError) {
    console.error("Profile name update error:", nameError);
    alert("Failed to save profile: " + nameError.message);
    return;
  }

  // Also keep auth user metadata in sync so other pages that read metadata
  // (fallback) also show the new name. This is best-effort and won't break
  // the profile page if it fails.
  await supabase.auth.updateUser({
    data: { full_name: fullName },
  }).then(() => {}).catch((err) => console.error("Metadata sync failed:", err));

  // 2) Update the contact number if one was provided. If the column is still
  //    missing from the database (schema not fixed yet), warn once but do NOT
  //    block the name update / UI refresh.
  if (currentUserRole !== "admin" && contactNumber) {
    const { error: contactError } = await supabase
      .from("profiles")
      .update({ contact_number: contactNumber })
      .eq("id", currentUserId);

    if (contactError) {
      console.error("Contact number update error:", contactError);
      if (!contactWarned) {
        contactWarned = true;
        alert(
          "Your name was updated, but the contact number could not be saved. " +
            "Please run supabase/setup-fix-profiles.sql in the Supabase SQL Editor, " +
            "then try saving the contact number again."
        );
      }
    }
  }

  await logAudit("Updated profile", fullName);
  alert("Profile updated successfully!");
  loadProfile(); // refreshes sidebar name + role (e.g. Administrator) below it
});

async function loadSystemSettings() {
  const { data, error } = await supabase.from("system_settings")
    .select("operator_registration_enabled, maintenance_mode, max_login_attempts, login_lockout_seconds")
    .eq("id", true).maybeSingle();
  const status = document.getElementById("settingsStatus");
  if (error) {
    status.textContent = `Could not load settings: ${error.message}`;
    return;
  }
  document.getElementById("registrationEnabled").checked = data?.operator_registration_enabled !== false;
  document.getElementById("maintenanceMode").checked = Boolean(data?.maintenance_mode);
  document.getElementById("maxLoginAttempts").value = data?.max_login_attempts || 5;
  document.getElementById("loginLockoutSeconds").value = data?.login_lockout_seconds || 60;
  status.textContent = "";
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentUserRole !== "admin") return;
  const button = event.currentTarget.querySelector('[type="submit"]');
  const status = document.getElementById("settingsStatus");
  button.disabled = true;
  button.textContent = "Saving...";
  const settings = {
    operator_registration_enabled: document.getElementById("registrationEnabled").checked,
    maintenance_mode: document.getElementById("maintenanceMode").checked,
    max_login_attempts: Number(document.getElementById("maxLoginAttempts").value),
    login_lockout_seconds: Number(document.getElementById("loginLockoutSeconds").value),
    updated_at: new Date().toISOString(),
    updated_by: currentUserId,
  };
  if (!Number.isInteger(settings.max_login_attempts) || settings.max_login_attempts < 1 || settings.max_login_attempts > 10
      || !Number.isInteger(settings.login_lockout_seconds) || settings.login_lockout_seconds < 10 || settings.login_lockout_seconds > 3600) {
    button.disabled = false;
    button.textContent = "Save System Settings";
    status.textContent = "Enter 1–10 attempts and a lockout duration from 10–3600 seconds.";
    return;
  }
  const { error } = await supabase.from("system_settings").update(settings).eq("id", true);
  button.disabled = false;
  button.textContent = "Save System Settings";
  if (error) {
    status.textContent = `Could not save settings: ${error.message}`;
    return;
  }
  status.textContent = "System settings saved successfully.";
  await logAudit("Updated system settings", document.getElementById("profileName").textContent);
});

/* CHANGE PASSWORD */
document.getElementById("passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword.length < 6) {
    alert("Password must be at least 6 characters.");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  const submitBtn = document.querySelector('#passwordForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Updating...";

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    alert("Session expired. Please sign in again.");
    window.location.href = "index.html";
    return;
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (reauthError) {
    alert("Current password is incorrect.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Update Password";
    return;
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    alert("Failed to update password: " + updateError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Update Password";
    return;
  }

  await logAudit("Changed password", user.user_metadata?.full_name || "");
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  alert("Password updated successfully! Please sign in again.");
  window.location.href = "index.html";
});

/* LOGOUT */
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  window.location.href = "index.html";
});

loadProfile();

