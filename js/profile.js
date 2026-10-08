import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

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
let managedAccounts = [];
let pendingAccountDeletion = null;

async function manageAdministratorAccounts(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your Head Administrator session has expired.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-viewer`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) throw new Error(data?.error || "The account service rejected the request.");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
  })[character]);
}

/* ROLE LABEL */
function roleLabel(role) {
  const map = {
    admin: "Head Administrator",
    admin_viewer: "Restricted Administrator",
    staff: "Staff",
    operator: "Operator",
    traffic_enforcer: "TFRO Enforcer",
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
  const { user } = await requireRole(["admin", "admin_viewer", "staff"]);
  if (!user) return;
  currentUserId = user.id;

  let profile = null;
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name")
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
  const email = user.email || "";
  const role = profile?.role || currentUserRole || "";
  currentUserRole = role;
  const isAdmin = role === "admin";
  document.getElementById("settingsTabButton").hidden = !isAdmin;
  if (isAdmin) {
    void loadSystemSettings();
    void loadManagedAccounts();
  }

  const names = fullName.split(" ").filter(Boolean);
  setValue("firstName", names[0] || "");
  setValue("lastName", names.slice(1).join(" ") || "");
  setValue("email", email);
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
  const fullName = `${firstName} ${lastName}`.trim();

  if (!fullName) {
    alert("Please enter your full name.");
    return;
  }

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

  await logAudit("Updated profile", fullName);
  alert("Profile updated successfully!");
  loadProfile(); // refreshes sidebar name + role (e.g. Administrator) below it
});

async function loadSystemSettings() {
  const { data, error } = await supabase.from("system_settings")
    .select("operator_registration_enabled, maintenance_mode, max_login_attempts, login_lockout_seconds, violation_commission_rate")
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
  document.getElementById("violationCommissionRate").value = Number(data?.violation_commission_rate ?? 0.20) * 100;
  status.textContent = "";
}

function filteredManagedAccounts() {
  const term = document.getElementById("accountSearch")?.value.trim().toLowerCase() || "";
  const role = document.getElementById("accountRoleFilter")?.value || "all";
  return managedAccounts.filter((account) => {
    if (role !== "all" && account.role !== role) return false;
    if (!term) return true;
    return [account.full_name, account.login, account.email, account.role, account.reference]
      .some((value) => String(value || "").toLowerCase().includes(term));
  });
}

function renderManagedAccounts() {
  const rows = document.getElementById("accountManagementRows");
  if (!rows) return;
  const accounts = filteredManagedAccounts();
  rows.innerHTML = accounts.length ? accounts.map((account) => `
    <tr>
      <td><button type="button" class="managed-account account-history-btn" data-user-id="${escapeHtml(account.id)}" data-role="${escapeHtml(account.role)}" data-name="${escapeHtml(account.full_name || "Unnamed account")}" title="View account activity history"><span>${escapeHtml(initials(account.full_name))}</span><div><strong>${escapeHtml(account.full_name || "Unnamed account")}</strong><small>${escapeHtml(account.login || account.email || "No login recorded")}</small><em><i class="ri-history-line"></i> View activity history</em></div></button></td>
      <td><span class="account-role ${escapeHtml(account.role)}">${escapeHtml(roleLabel(account.role))}</span></td>
      <td>${escapeHtml(account.contact_number || account.reference || "—")}</td>
      <td><span class="account-link-status"><i class="ri-checkbox-circle-fill"></i> Portal linked</span></td>
      <td><button type="button" class="reset-password-btn" data-user-id="${escapeHtml(account.id)}" data-role="${escapeHtml(account.role)}" data-username="${escapeHtml(account.username || "")}" data-name="${escapeHtml(account.full_name)}"><i class="ri-key-2-line"></i> Reset Password</button>${account.can_delete && ["admin_viewer", "staff", "operator", "traffic_enforcer"].includes(account.role) ? ` <button type="button" class="delete-account-btn" data-user-id="${escapeHtml(account.id)}" data-role="${escapeHtml(account.role)}" data-name="${escapeHtml(account.full_name)}"><i class="ri-delete-bin-6-line"></i> Delete</button>` : ""}</td>
    </tr>`).join("") : '<tr><td colspan="5" class="account-empty">No linked accounts match this filter.</td></tr>';
}

function formatAccountHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function closeAccountHistoryModal() {
  document.getElementById("accountHistoryModal").hidden = true;
}

async function openAccountHistory(button) {
  if (currentUserRole !== "admin") return;
  const modal = document.getElementById("accountHistoryModal");
  const rows = document.getElementById("accountHistoryRows");
  const status = document.getElementById("accountHistoryStatus");
  const name = button.dataset.name || "Selected account";
  setText("accountHistoryName", name);
  setText("accountHistoryRole", roleLabel(button.dataset.role || ""));
  setText("accountHistoryInitials", initials(name));
  rows.innerHTML = '<tr><td colspan="4" class="account-history-empty"><i class="ri-loader-4-line ri-spin"></i> Loading activity history…</td></tr>';
  status.textContent = "Loading…";
  modal.hidden = false;
  document.getElementById("closeAccountHistoryModal").focus();

  const { data, error } = await supabase.from("audit_logs")
    .select("id, action, action_type, record, description, created_at")
    .eq("user_id", button.dataset.userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    status.textContent = "History unavailable";
    rows.innerHTML = `<tr><td colspan="4" class="account-history-empty error">Could not load account history: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  status.textContent = `${data.length} recorded action${data.length === 1 ? "" : "s"}${data.length === 200 ? " (latest 200)" : ""}`;
  rows.innerHTML = data.length ? data.map((entry) => `
    <tr><td><time datetime="${escapeHtml(entry.created_at)}">${escapeHtml(formatAccountHistoryDate(entry.created_at))}</time></td>
    <td><span class="history-action-type">${escapeHtml(String(entry.action_type || "activity").replaceAll("_", " "))}</span></td>
    <td><strong>${escapeHtml(entry.action || "System activity")}</strong><small>${escapeHtml(entry.description || "No additional description recorded.")}</small></td>
    <td>${escapeHtml(entry.record || "—")}</td></tr>`).join("")
    : '<tr><td colspan="4" class="account-history-empty">No attributable actions have been recorded for this account yet.</td></tr>';
}

async function loadManagedAccounts() {
  if (currentUserRole !== "admin") return;
  const status = document.getElementById("accountManagementStatus");
  if (status) status.textContent = "Loading all portal accounts…";
  try {
    const result = await manageAdministratorAccounts("list_accounts");
    managedAccounts = result.accounts || [];
  } catch (error) {
    if (status) status.textContent = `Could not load accounts: ${error.message}`;
    return;
  }
  if (status) status.textContent = `${managedAccounts.length} linked account${managedAccounts.length === 1 ? "" : "s"} available.`;
  renderManagedAccounts();
}

async function resetManagedAccountPassword(button) {
  if (currentUserRole !== "admin" || button.disabled) return;
  const role = button.dataset.role;
  let username = button.dataset.username || "";
  if (["admin", "admin_viewer"].includes(role)) {
    username = window.prompt("Enter the Administrator username. This will be used for login:", username) ?? "";
    if (!username.trim()) return;
  }
  if (!window.confirm(`Reset the password for ${button.dataset.name || "this account"}? The temporary password will be shown only once.`)) return;
  button.disabled = true;
  const status = document.getElementById("accountManagementStatus");
  if (status) status.textContent = "Generating secure temporary credentials…";
  try {
    const result = await manageAdministratorAccounts("reset_password", { user_id: button.dataset.userId, username: username.trim() });
    const credentials = `Login: ${result.username}\nTemporary password: ${result.temporary_password}`;
    await navigator.clipboard?.writeText(credentials).catch(() => {});
    window.alert(`Temporary credentials (shown once):\n\n${credentials}\n\nThey were copied to the clipboard when browser permission allowed it.`);
    if (status) status.textContent = `Password reset completed for ${button.dataset.name}. The action was recorded in the Audit Log.`;
    await loadManagedAccounts();
  } catch (error) {
    if (status) status.textContent = `Could not reset password: ${error.message}`;
    button.disabled = false;
  }
}

function closeDeleteAccountModal() {
  if (document.getElementById("confirmDeleteAccount")?.disabled) return;
  document.getElementById("deleteAccountModal").hidden = true;
  pendingAccountDeletion?.button?.focus();
  pendingAccountDeletion = null;
}

function openDeleteAccountModal(button) {
  if (currentUserRole !== "admin" || button.disabled) return;
  pendingAccountDeletion = {
    button,
    userId: button.dataset.userId,
    role: button.dataset.role,
    name: button.dataset.name || "Selected account",
  };
  setText("deleteAccountName", pendingAccountDeletion.name);
  setText("deleteAccountRole", roleLabel(pendingAccountDeletion.role));
  setText("deleteAccountInitials", initials(pendingAccountDeletion.name));
  document.getElementById("deleteAccountError").hidden = true;
  document.getElementById("deleteAccountModal").hidden = false;
  document.getElementById("cancelDeleteAccount").focus();
}

async function confirmManagedAccountDeletion() {
  if (!pendingAccountDeletion || currentUserRole !== "admin") return;
  const { button, userId, role, name } = pendingAccountDeletion;

  const status = document.getElementById("accountManagementStatus");
  const confirmButton = document.getElementById("confirmDeleteAccount");
  const cancelButton = document.getElementById("cancelDeleteAccount");
  const errorMessage = document.getElementById("deleteAccountError");
  button.disabled = true;
  confirmButton.disabled = true;
  cancelButton.disabled = true;
  confirmButton.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Deleting Account…';
  if (status) status.textContent = `Deleting ${name}'s portal account…`;
  let data;
  let error;
  if (role === "admin_viewer") {
    try {
      data = await manageAdministratorAccounts("delete", { user_id: userId, confirmed: true });
    } catch (administratorDeleteError) {
      error = administratorDeleteError;
    }
  } else if (role === "staff") {
    try {
      data = await manageAdministratorAccounts("delete_staff", { user_id: userId, confirmed: true });
    } catch (staffDeleteError) {
      error = staffDeleteError;
    }
  } else {
    const result = await supabase.functions.invoke("admin-delete-account", {
      body: { user_id: userId, role, confirmed: true },
    });
    data = result.data;
    error = result.error;
  }
  if (error || !data?.success) {
    const message = data?.error || error?.message || "Unknown server error.";
    if (status) status.textContent = `Could not delete account: ${message}`;
    button.disabled = false;
    confirmButton.disabled = false;
    cancelButton.disabled = false;
    confirmButton.innerHTML = '<i class="ri-delete-bin-6-line"></i> Try Again';
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    return;
  }
  if (status) status.textContent = `${name}'s portal account was deleted. Official records were retained.`;
  confirmButton.disabled = false;
  cancelButton.disabled = false;
  confirmButton.innerHTML = '<i class="ri-delete-bin-6-line"></i> Delete Account';
  document.getElementById("deleteAccountModal").hidden = true;
  pendingAccountDeletion = null;
  await loadManagedAccounts();
}

document.getElementById("accountSearch")?.addEventListener("input", renderManagedAccounts);
document.getElementById("accountRoleFilter")?.addEventListener("change", renderManagedAccounts);
document.getElementById("refreshAccountsBtn")?.addEventListener("click", loadManagedAccounts);
document.getElementById("accountManagementRows")?.addEventListener("click", (event) => {
  const historyButton = event.target.closest(".account-history-btn");
  if (historyButton) {
    void openAccountHistory(historyButton);
    return;
  }
  const resetButton = event.target.closest(".reset-password-btn");
  if (resetButton) {
    void resetManagedAccountPassword(resetButton);
    return;
  }
  const button = event.target.closest(".delete-account-btn");
  if (button) openDeleteAccountModal(button);
});
document.getElementById("confirmDeleteAccount")?.addEventListener("click", confirmManagedAccountDeletion);
document.getElementById("cancelDeleteAccount")?.addEventListener("click", closeDeleteAccountModal);
document.getElementById("closeDeleteAccountModal")?.addEventListener("click", closeDeleteAccountModal);
document.getElementById("deleteAccountModal")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeDeleteAccountModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.getElementById("deleteAccountModal")?.hidden) closeDeleteAccountModal();
  if (event.key === "Escape" && !document.getElementById("accountHistoryModal")?.hidden) closeAccountHistoryModal();
});
document.getElementById("closeAccountHistoryModal")?.addEventListener("click", closeAccountHistoryModal);
document.getElementById("accountHistoryDone")?.addEventListener("click", closeAccountHistoryModal);
document.getElementById("accountHistoryModal")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeAccountHistoryModal();
});

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
    violation_commission_rate: Number(document.getElementById("violationCommissionRate").value) / 100,
    updated_at: new Date().toISOString(),
    updated_by: currentUserId,
  };
  if (!Number.isInteger(settings.max_login_attempts) || settings.max_login_attempts < 1 || settings.max_login_attempts > 10
      || !Number.isInteger(settings.login_lockout_seconds) || settings.login_lockout_seconds < 10 || settings.login_lockout_seconds > 3600
      || !Number.isFinite(settings.violation_commission_rate) || settings.violation_commission_rate < 0 || settings.violation_commission_rate > 1) {
    button.disabled = false;
    button.textContent = "Save System Settings";
    status.textContent = "Enter 1–10 attempts, a lockout duration from 10–3600 seconds, and a commission from 0–100%.";
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

