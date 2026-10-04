import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const form = document.getElementById("createAdminForm");
const message = document.getElementById("formMessage");
const viewerRows = document.getElementById("adminRows");
const headRows = document.getElementById("headAdminRows");
const count = document.getElementById("viewerCount");
const createButton = document.getElementById("createAdminButton");
const staffForm = document.getElementById("createStaffForm");
const staffMessage = document.getElementById("staffFormMessage");
const staffRows = document.getElementById("staffRows");
const createStaffButton = document.getElementById("createStaffButton");
const escapeHtml = (value) => { const element = document.createElement("div"); element.textContent = value ?? ""; return element.innerHTML; };
function showMessage(text, type = "") { message.textContent = text; message.className = `form-message ${type}`; }
function showStaffMessage(text, type = "") { staffMessage.textContent = text; staffMessage.className = `form-message ${type}`; }

function readableError(value, fallback) {
  if (typeof value === "string" && value.trim() && value.trim() !== "{}") return value.trim();
  if (value && typeof value === "object") {
    for (const detail of [value.message, value.error, value.code]) {
      if (typeof detail === "string" && detail.trim() && detail.trim() !== "{}") return detail.trim();
    }
  }
  return fallback;
}

async function manage(action, body = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Your session has expired. Sign in again before managing Administrator accounts.");
  }
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-viewer`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new Error("Unable to reach the Administrator service. Check your internet connection and try again.");
  }
  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = null;
  }
  if (!response.ok || data?.error) {
    throw new Error(readableError(data?.error || data, responseText || `Administrator service failed with HTTP ${response.status}.`));
  }
  if (!data) throw new Error("The Administrator service returned an empty response.");
  return data;
}

async function loadAdminAccounts() {
  try {
    const { accounts } = await manage("list_accounts");
    const heads = accounts.filter((account) => account.role === "admin");
    const viewers = accounts.filter((account) => account.role === "admin_viewer");
    const staff = accounts.filter((account) => account.role === "staff");
    count.textContent = `${viewers.length} / 40`;
    createButton.disabled = viewers.length >= 40;
    headRows.innerHTML = heads.length
      ? heads.map((account) => `<tr><td>${escapeHtml(account.full_name || "—")}</td><td><code>${escapeHtml(account.username)}</code></td></tr>`).join("")
      : '<tr><td colspan="2">No Head Administrator account was found.</td></tr>';
    viewerRows.innerHTML = viewers.length
      ? viewers.map((account) => `<tr><td>${escapeHtml(account.full_name || "—")}</td><td><code>${escapeHtml(account.username)}</code></td><td>${escapeHtml(account.contact_number || "—")}</td><td><button type="button" class="delete-account" data-user-id="${escapeHtml(account.id)}"><i class="ri-delete-bin-line"></i> Delete</button></td></tr>`).join("")
      : '<tr><td colspan="4">No restricted Administrator accounts yet.</td></tr>';
    staffRows.innerHTML = staff.length
      ? staff.map((account) => `<tr><td>${escapeHtml(account.full_name || "—")}</td><td><code>${escapeHtml(account.username || account.login)}</code></td><td>${escapeHtml(account.contact_number || "—")}</td><td><button type="button" class="delete-staff-account" data-user-id="${escapeHtml(account.id)}"><i class="ri-delete-bin-line"></i> Delete</button></td></tr>`).join("")
      : '<tr><td colspan="4">No TFRO Staff accounts yet.</td></tr>';
  } catch (error) {
    const safeMessage = escapeHtml(error.message);
    headRows.innerHTML = `<tr><td colspan="2">Unable to load accounts: ${safeMessage}</td></tr>`;
    viewerRows.innerHTML = `<tr><td colspan="4">Unable to load accounts: ${safeMessage}</td></tr>`;
    staffRows.innerHTML = `<tr><td colspan="4">Unable to load accounts: ${safeMessage}</td></tr>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const password = document.getElementById("password").value;
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(password)) {
    showMessage("Password must have at least 12 characters, including uppercase, lowercase, a number, and a symbol.", "error");
    document.getElementById("password").focus();
    return;
  }
  createButton.disabled = true;
  showMessage("Creating account…");
  try {
    const result = await manage("create", {
      full_name: document.getElementById("fullName").value.trim(),
      username: document.getElementById("username").value.trim(),
      password,
      contact_number: document.getElementById("contactNumber").value.trim(),
    });
    form.reset();
    showMessage(`Account created. Username: ${result.username}. Give the password to the user securely; it cannot be displayed later.`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
  await loadAdminAccounts();
});

staffForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!staffForm.reportValidity()) return;
  const password = document.getElementById("staffPassword").value;
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(password)) {
    showStaffMessage("Password must have at least 12 characters, including uppercase, lowercase, a number, and a symbol.", "error");
    return;
  }
  createStaffButton.disabled = true;
  showStaffMessage("Creating TFRO Staff account…");
  try {
    const result = await manage("create_staff", {
      full_name: document.getElementById("staffFullName").value.trim(),
      username: document.getElementById("staffUsername").value.trim(),
      password,
      contact_number: document.getElementById("staffContactNumber").value.trim(),
    });
    staffForm.reset();
    showStaffMessage(`TFRO Staff account created. Username: ${result.username}.`, "success");
  } catch (error) {
    showStaffMessage(error.message, "error");
  }
  createStaffButton.disabled = false;
  await loadAdminAccounts();
});

viewerRows.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-account");
  if (!button || !window.confirm("Delete this restricted Administrator account? This cannot be undone.")) return;
  button.disabled = true;
  showMessage("Deleting account…");
  try {
    await manage("delete", { user_id: button.dataset.userId });
    showMessage("Restricted Administrator account deleted.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
  await loadAdminAccounts();
});

staffRows.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-staff-account");
  if (!button || !window.confirm("Delete this TFRO Staff account? The account will lose portal access, but official records will remain.")) return;
  button.disabled = true;
  showStaffMessage("Deleting TFRO Staff account…");
  try {
    await manage("delete_staff", { user_id: button.dataset.userId });
    showStaffMessage("TFRO Staff account deleted.", "success");
  } catch (error) {
    showStaffMessage(error.message, "error");
  }
  await loadAdminAccounts();
});

document.getElementById("refreshList").addEventListener("click", () => void loadAdminAccounts());
document.getElementById("refreshStaffList").addEventListener("click", () => void loadAdminAccounts());
(async () => { const { user } = await requireRole("admin"); if (user) await loadAdminAccounts(); })();
