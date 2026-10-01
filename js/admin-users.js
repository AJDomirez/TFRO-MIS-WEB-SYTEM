import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

const form = document.getElementById("createAdminForm");
const message = document.getElementById("formMessage");
const viewerRows = document.getElementById("adminRows");
const headRows = document.getElementById("headAdminRows");
const count = document.getElementById("viewerCount");
const createButton = document.getElementById("createAdminButton");
const escapeHtml = (value) => { const element = document.createElement("div"); element.textContent = value ?? ""; return element.innerHTML; };
function showMessage(text, type = "") { message.textContent = text; message.className = `form-message ${type}`; }

async function manage(action, body = {}) {
  const { data, error } = await supabase.functions.invoke("admin-create-viewer", { body: { action, ...body } });
  if (error || data?.error) throw new Error(data?.error || error?.message || "The administrator action failed.");
  return data;
}

async function loadAdminAccounts() {
  try {
    const { accounts } = await manage("list");
    const heads = accounts.filter((account) => account.role === "admin");
    const viewers = accounts.filter((account) => account.role === "admin_viewer");
    count.textContent = `${viewers.length} / 40`;
    createButton.disabled = viewers.length >= 40;
    headRows.innerHTML = heads.length
      ? heads.map((account) => `<tr><td>${escapeHtml(account.full_name || "—")}</td><td><code>${escapeHtml(account.username)}</code></td></tr>`).join("")
      : '<tr><td colspan="2">No Head Administrator account was found.</td></tr>';
    viewerRows.innerHTML = viewers.length
      ? viewers.map((account) => `<tr><td>${escapeHtml(account.full_name || "—")}</td><td><code>${escapeHtml(account.username)}</code></td><td>${escapeHtml(account.contact_number || "—")}</td><td><button type="button" class="delete-account" data-user-id="${escapeHtml(account.id)}"><i class="ri-delete-bin-line"></i> Delete</button></td></tr>`).join("")
      : '<tr><td colspan="4">No view-only Administrator accounts yet.</td></tr>';
  } catch (error) {
    const safeMessage = escapeHtml(error.message);
    headRows.innerHTML = `<tr><td colspan="2">Unable to load accounts: ${safeMessage}</td></tr>`;
    viewerRows.innerHTML = `<tr><td colspan="4">Unable to load accounts: ${safeMessage}</td></tr>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  createButton.disabled = true;
  showMessage("Creating account…");
  try {
    const result = await manage("create", {
      full_name: document.getElementById("fullName").value.trim(),
      username: document.getElementById("username").value.trim(),
      password: document.getElementById("password").value,
      contact_number: document.getElementById("contactNumber").value.trim(),
    });
    form.reset();
    showMessage(`Account created. Username: ${result.username}. Give the password to the user securely; it cannot be displayed later.`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
  await loadAdminAccounts();
});

viewerRows.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-account");
  if (!button || !window.confirm("Delete this view-only Administrator account? This cannot be undone.")) return;
  button.disabled = true;
  showMessage("Deleting account…");
  try {
    await manage("delete", { user_id: button.dataset.userId });
    showMessage("View-only Administrator account deleted.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
  await loadAdminAccounts();
});

document.getElementById("refreshList").addEventListener("click", () => void loadAdminAccounts());
(async () => { const { user } = await requireRole("admin"); if (user) await loadAdminAccounts(); })();
