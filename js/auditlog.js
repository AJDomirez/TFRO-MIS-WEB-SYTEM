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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function el(id) { return document.getElementById(id); }

let logs = [];
let currentRole = null;
let selectedIds = new Set();

const logTable = document.getElementById("logTable");
const searchInput = document.getElementById("searchInput");

/* ---------- ROLE / ACCESS ---------- */
async function loadSidebarUser() {
  const { user, profile } = await requireRole(["admin", "staff"]);
  if (!user || !profile) return false;

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const role = profile?.role || localStorage.getItem("role") || "";
  currentRole = role;

  setText("userName", fullName || role || "User");
  setText("userAvatar", initials(fullName || role || "User"));
  const roleText = role.charAt(0).toUpperCase() + role.slice(1);
  setText("userRole", roleText || "");

  // Manage Logs is admin only
  const manageBtn = el("manageBtn");
  if (manageBtn) manageBtn.style.display = role === "admin" ? "" : "none";
  return true;
}

/* ---------- ACTION TYPES / NORMALIZATION ---------- */
// Map legacy action_type values to clean categories
const ACTION_TYPE_MAP = {
  login: "login",
  logout: "logout",
  create: "create",
  update: "update",
  delete: "delete",
  approve: "approve",
  rejection: "reject",
  reject: "reject",
  approval: "approve",
  verification: "verification",
  assignment: "assignment",
  upload: "upload",
};

function normalizeType(t) {
  return ACTION_TYPE_MAP[t] || "update";
}

// Consistent action names for user-facing display
const ACTION_LABEL_MAP = {
  "Logged in to system": "Login",
  "logged in": "Login",
  "Log in": "Login",
  "Login": "Login",
  "Signed out": "Logout",
  "Logged out": "Logout",
  "Logout": "Logout",
};

function cleanActionName(log) {
  const raw = log.action || "";
  const type = normalizeType(log.action_type);
  // If it's a legacy repetitive login message, collapse to "Login"
  if (ACTION_LABEL_MAP[raw]) return ACTION_LABEL_MAP[raw];
  if (/login/i.test(raw) && type === "login") return "Login";
  if (/logout|sign.?out/i.test(raw) && (type === "logout" || type === "update")) return "Logout";
  return raw;
}

function getIcon(type) {
  switch (normalizeType(type)) {
    case "approve": return "ri-checkbox-circle-line";
    case "reject": return "ri-close-circle-line";
    case "create": return "ri-file-add-line";
    case "update": return "ri-edit-line";
    case "delete": return "ri-delete-bin-line";
    case "login": return "ri-login-box-line";
    case "logout": return "ri-logout-box-line";
    case "upload": return "ri-upload-2-line";
    case "verification": return "ri-verified-badge-line";
    case "assignment": return "ri-user-add-line";
    default: return "ri-settings-3-line";
  }
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  if (isNaN(date)) return ts || "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateFull(ts) {
  const date = new Date(ts);
  if (isNaN(date)) return ts || "—";
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/* ---------- FILTERING ---------- */
function getDateRangeStart() {
  const now = new Date();
  const filter = el("dateFilter").value;
  if (filter === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (filter === "week") {
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (filter === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (filter === "custom") {
    const from = el("dateFrom").value;
    if (from) return new Date(from + "T00:00:00");
  }
  return null;
}

function getDateRangeEnd() {
  const filter = el("dateFilter").value;
  if (filter === "custom") {
    const to = el("dateTo").value;
    if (to) {
      const end = new Date(to + "T23:59:59");
      return end;
    }
  }
  return null;
}

function getFilteredLogs() {
  const term = searchInput.value.trim().toLowerCase();
  const roleFilter = el("roleFilter").value;
  const actionFilter = el("actionFilter").value;
  const dateStart = getDateRangeStart();
  const dateEnd = getDateRangeEnd();

  return logs.filter((log) => {
    if (log.is_archived) return false;

    // Role filter
    if (roleFilter !== "all" && (log.role || "").toLowerCase() !== roleFilter.toLowerCase()) return false;

    // Action filter
    if (actionFilter !== "all") {
      const type = normalizeType(log.action_type);
      if (type !== actionFilter) return false;
    }

    // Date filter
    const ts = new Date(log.created_at).getTime();
    if (dateStart && ts < dateStart.getTime()) return false;
    if (dateEnd && ts > dateEnd.getTime()) return false;

    // Search
    if (term) {
      const haystack = [
        log.user_name,
        log.role,
        log.action,
        log.record,
        log.description,
      ].map((v) => (v || "").toLowerCase());
      if (!haystack.some((v) => v.includes(term))) return false;
    }

    return true;
  });
}

/* ---------- RENDER ---------- */
function renderLogs() {
  if (!logTable) return;
  const filtered = getFilteredLogs();

  logTable.innerHTML = "";

  if (!filtered.length) {
    logTable.innerHTML = `
      <tr class="empty-row">
        <td colspan="8"><i class="ri-file-search-line"></i> No log entries found.</td>
      </tr>
    `;
    return;
  }

  filtered.forEach((log) => {
    const type = normalizeType(log.action_type);
    const actionName = cleanActionName(log);
    const record = log.record || "—";
    const checked = selectedIds.has(String(log.id)) ? "checked" : "";
    logTable.innerHTML += `
      <tr>
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${escapeHtml(log.id)}" ${checked}></td>
        <td>${escapeHtml(log.user_name || "—")}</td>
        <td><span class="role-badge">${escapeHtml(log.role || "—")}</span></td>
        <td>
          <div class="action">
            <i class="${getIcon(type)} ${type}"></i>
            <span>${escapeHtml(actionName)}</span>
          </div>
        </td>
        <td>${record === "—" ? "—" : `<span class="record-cell truncate">${escapeHtml(record)}</span>`}</td>
        <td>${escapeHtml(log.ip_address || "—")}</td>
        <td>${formatTimestamp(log.created_at)}</td>
        <td>
          <button class="view-btn" data-view="${escapeHtml(log.id)}" title="View details">
            <i class="ri-eye-line"></i>
          </button>
        </td>
      </tr>
    `;
  });

  // Bind checkbox events
  logTable.querySelectorAll(".row-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectionUI();
    });
  });

  // Bind view buttons
  logTable.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const log = logs.find((l) => String(l.id) === String(btn.dataset.view));
      if (log) openDetail(log);
    });
  });
}

function updateSelectionUI() {
  const bulkBar = el("bulkBar");
  const count = selectedIds.size;
  if (bulkBar) {
    bulkBar.style.display = count > 0 ? "" : "none";
    el("selectedCount").textContent = count + " selected";
  }
  const selectAll = el("selectAll");
  if (selectAll) selectAll.checked = count > 0 && count === logs.filter((l) => !l.is_archived).length;
}

/* ---------- SUMMARY CARDS ---------- */
function updateSummary() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const active = logs.filter((l) => !l.is_archived);
  const today = active.filter((l) => new Date(l.created_at).getTime() >= todayStart);
  const admin = active.filter((l) => (l.role || "").toLowerCase() === "admin");
  const operator = active.filter((l) => (l.role || "").toLowerCase() === "operator");
  const driver = active.filter((l) => (l.role || "").toLowerCase() === "driver");

  setText("sumTotal", active.length);
  setText("sumToday", today.length);
  setText("sumAdmin", admin.length);
  setText("sumOperator", operator.length);
  setText("sumDriver", driver.length);
}

/* ---------- DETAIL MODAL ---------- */
function openDetail(log) {
  const body = el("detailBody");
  const type = normalizeType(log.action_type);
  const actionName = cleanActionName(log);
  const record = log.record || "—";
  const prev = log.previous_value || "—";
  const next = log.new_value || "—";
  const desc = log.description || "—";

  body.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <label>User</label>
        <strong>${escapeHtml(log.user_name || "—")}</strong>
      </div>
      <div class="detail-item">
        <label>User Role</label>
        <strong>${escapeHtml(log.role || "—")}</strong>
      </div>
      <div class="detail-item full">
        <label>Action</label>
        <strong><i class="${getIcon(type)} ${type}"></i> ${escapeHtml(actionName)}</strong>
      </div>
      <div class="detail-item">
        <label>Affected Record</label>
        <strong class="record-tag">${escapeHtml(record)}</strong>
      </div>
      <div class="detail-item">
        <label>IP Address</label>
        <strong>${escapeHtml(log.ip_address || "—")}</strong>
      </div>
      <div class="detail-item">
        <label>Previous Value</label>
        <strong>${escapeHtml(prev)}</strong>
      </div>
      <div class="detail-item">
        <label>New Value</label>
        <strong>${escapeHtml(next)}</strong>
      </div>
      <div class="detail-item full">
        <label>Description</label>
        <strong>${escapeHtml(desc)}</strong>
      </div>
      <div class="detail-item full">
        <label>Timestamp</label>
        <strong>${formatDateFull(log.created_at)}</strong>
      </div>
    </div>
  `;
  el("detailModal").hidden = false;
}

/* ---------- LOAD ---------- */
async function loadLogs() {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Audit log load error:", error);
    logs = [];
  } else {
    logs = data || [];
  }

  updateSummary();
  renderLogs();
}

/* ---------- EXPORT ---------- */
function exportLogs() {
  const filtered = getFilteredLogs();
  if (!filtered.length) {
    alert("No logs to export for the current filter.");
    return;
  }

  const header = ["User", "Role", "Action", "Record", "IP Address", "Timestamp", "Description"];
  const rows = filtered.map((log) => [
    log.user_name || "",
    log.role || "",
    cleanActionName(log),
    log.record || "",
    log.ip_address || "",
    formatTimestamp(log.created_at),
    log.description || "",
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const format = "csv"; // CSV export (simple + reliable)
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- PROTECTED ACTIONS ---------- */
const PROTECTED_TYPES = new Set([
  "login", "logout", "approve", "reject", "verification", "assignment", "create",
]);

function isProtected(log) {
  return PROTECTED_TYPES.has(normalizeType(log.action_type));
}

/* ---------- MANAGE LOGS (Admin only) ---------- */
function openManage() {
  if (currentRole !== "admin") {
    alert("Only Administrators can manage audit logs.");
    return;
  }
  el("manageModal").hidden = false;
}

// Archive old logs (older than 90 days) — protected records archived, others shown for selection
async function archiveOldLogs() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const oldLogs = logs.filter(
    (l) => !l.is_archived && new Date(l.created_at).getTime() < cutoff.getTime()
  );

  if (!oldLogs.length) {
    alert("No logs older than 90 days to archive.");
    return;
  }

  // Archive all non-protected old logs; protected old logs are kept (never silently deleted)
  const nonProtected = oldLogs.filter((l) => !isProtected(l));
  const protectedCount = oldLogs.length - nonProtected.length;

  if (nonProtected.length === 0) {
    alert(`All ${protectedCount} old records are protected security events and have been retained for compliance.`);
    return;
  }

  const ids = nonProtected.map((l) => l.id);
  const { error } = await supabase
    .from("audit_logs")
    .update({ is_archived: true })
    .in("id", ids);

  if (error) {
    alert("Failed to archive logs: " + error.message);
    return;
  }
  alert(`Archived ${nonProtected.length} old log(s). ${protectedCount} protected record(s) retained.`);
  selectedIds.clear();
  loadLogs();
}

// Clear logs older than a chosen date
function openClearModal() {
  el("clearModal").hidden = false;
}

function clearOlderThan() {
  const dateVal = el("clearDate").value;
  if (!dateVal) {
    alert("Please select a date.");
    return;
  }
  const cutoff = new Date(dateVal + "T00:00:00");

  const toRemove = logs.filter(
    (l) => !l.is_archived && new Date(l.created_at).getTime() < cutoff.getTime()
  );

  if (!toRemove.length) {
    alert("No logs found before that date.");
    el("clearModal").hidden = false;
    return;
  }

  el("confirmModal").hidden = false;
  el("clearModal").hidden = true;
  el("confirmMessage").textContent =
    `This will permanently remove ${toRemove.length} audit record(s) before ${formatDateFull(cutoff)}. ` +
    "This action cannot be undone.";

  window.__clearTarget = toRemove.map((l) => l.id);
}

// Delete selected logs
function deleteSelected() {
  const ids = Array.from(selectedIds);
  if (!ids.length) {
    alert("No rows selected.");
    return;
  }

  el("confirmModal").hidden = false;
  el("confirmMessage").textContent =
    `This will permanently remove ${ids.length} selected audit record(s). ` +
    "This action cannot be undone.";

  window.__clearTarget = ids;
}

async function confirmDelete() {
  const ids = window.__clearTarget || [];
  if (!ids.length) {
    el("confirmModal").hidden = true;
    return;
  }

  // Request the affected IDs back: with RLS, a delete may otherwise report no
  // error even when the database was not allowed to remove any rows.
  const { data: deletedRows, error } = await supabase
    .from("audit_logs")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) {
    alert("Failed to delete logs: " + error.message);
    return;
  }

  const deletedIds = new Set((deletedRows || []).map((row) => String(row.id)));
  if (deletedIds.size !== ids.length) {
    alert("The selected logs could not all be deleted. Please sign in as an Administrator and run supabase/setup-audit-logs.sql if the issue continues.");
    await loadLogs();
    return;
  }

  el("confirmModal").hidden = true;
  selectedIds.clear();
  window.__clearTarget = null;
  // Update the visible list immediately after the database confirms deletion.
  logs = logs.filter((log) => !deletedIds.has(String(log.id)));
  updateSummary();
  renderLogs();
}

/* ---------- EVENT BINDINGS ---------- */
function bindEvents() {
  if (searchInput) searchInput.addEventListener("input", renderLogs);

  el("roleFilter")?.addEventListener("change", renderLogs);
  el("actionFilter")?.addEventListener("change", renderLogs);
  el("dateFilter")?.addEventListener("change", () => {
    el("customRange").style.display = el("dateFilter").value === "custom" ? "" : "none";
    renderLogs();
  });
  el("dateFrom")?.addEventListener("change", renderLogs);
  el("dateTo")?.addEventListener("change", renderLogs);

  // Select all
  el("selectAll")?.addEventListener("change", (e) => {
    const filtered = getFilteredLogs();
    if (e.target.checked) {
      filtered.forEach((l) => selectedIds.add(String(l.id)));
    } else {
      selectedIds.clear();
    }
    renderLogs();
    updateSelectionUI();
  });

  // Export
  const exportBtn = document.querySelector(".export-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportLogs);

  // Manage
  el("manageBtn")?.addEventListener("click", openManage);
  el("deleteSelectedBtn")?.addEventListener("click", deleteSelected);
  el("archiveOldBtn")?.addEventListener("click", archiveOldLogs);
  el("clearOlderBtn")?.addEventListener("click", openClearModal);
  el("clearAllBtn")?.addEventListener("click", deleteSelected);
  el("confirmClearBtn")?.addEventListener("click", clearOlderThan);
  el("confirmDeleteBtn")?.addEventListener("click", confirmDelete);

  // Close modals
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = el(btn.dataset.close);
      if (m) m.hidden = true;
    });
  });

  // Close on backdrop click
  ["detailModal", "manageModal", "confirmModal", "clearModal"].forEach((id) => {
    el(id)?.addEventListener("click", (e) => {
      if (e.target === el(id)) el(id).hidden = true;
    });
  });

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      localStorage.removeItem("role");
      localStorage.removeItem("userId");
      window.location.href = "index.html";
    });
  }
}

bindEvents();
(async () => {
  const hasAccess = await loadSidebarUser();
  if (!hasAccess) return;
  await loadLogs();
})();
