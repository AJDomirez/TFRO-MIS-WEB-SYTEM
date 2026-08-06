import { supabase } from "./supabase.js";

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

let logs = [];

const logTable = document.getElementById("logTable");
const searchInput = document.getElementById("searchInput");

/* SIDEBAR USER */
async function loadSidebarUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = "index.html";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const role = profile?.role || localStorage.getItem("role") || "";

  setText("userName", fullName || role || "User");
  setText("userAvatar", initials(fullName || role || "User"));

  const roleText = role.charAt(0).toUpperCase() + role.slice(1);
  setText("userRole", roleText || "");
}

function getIcon(type) {
  switch (type) {
    case "approval":
      return "ri-checkbox-circle-line";
    case "rejection":
      return "ri-close-circle-line";
    case "violation":
      return "ri-alert-line";
    case "payment":
      return "ri-money-dollar-circle-line";
    case "create":
      return "ri-user-add-line";
    case "update":
      return "ri-edit-line";
    case "login":
      return "ri-login-box-line";
    case "report":
      return "ri-file-chart-line";
    default:
      return "ri-settings-3-line";
  }
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  if (isNaN(date)) return ts || "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function renderLogs(data) {
  if (!logTable) return;

  logTable.innerHTML = "";

  if (!data.length) {
    logTable.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:#94a3b8;padding:30px;">
          No log entries found.
        </td>
      </tr>
    `;
    return;
  }

  data.forEach((log) => {
    const actionType = log.action_type || "";
    logTable.innerHTML += `
      <tr>
        <td>${escapeHtml(log.user_name || "—")}</td>
        <td><span class="role-badge">${escapeHtml(log.role || "—")}</span></td>
        <td>
          <div class="action">
            <i class="${getIcon(log.action_type)} ${log.action_type || ""}"></i>
            <span>${escapeHtml(log.action)}</span>
          </div>
        </td>
        <td>${escapeHtml(log.ip_address || "—")}</td>
        <td>${formatTimestamp(log.created_at)}</td>
      </tr>
    `;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

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

  renderLogs(logs);
}

/* SEARCH */
if (searchInput) {
  searchInput.addEventListener("keyup", () => {
    const value = searchInput.value.toLowerCase();
    const filtered = logs.filter((log) => {
      return (
        (log.user_name || "").toLowerCase().includes(value) ||
        (log.action || "").toLowerCase().includes(value) ||
        (log.role || "").toLowerCase().includes(value)
      );
    });
    renderLogs(filtered);
  });
}

/* EXPORT CSV */
function exportLogs() {
  if (!logs.length) {
    alert("No logs to export.");
    return;
  }

  const header = ["User", "Role", "Action", "IP Address", "Timestamp"];
  const rows = logs.map((log) => [
    log.user_name || "",
    log.role || "",
    log.action || "",
    log.ip_address || "",
    formatTimestamp(log.created_at),
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const exportBtn = document.querySelector(".export-btn");
if (exportBtn) {
  exportBtn.addEventListener("click", exportLogs);
}

/* LOGOUT */
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    window.location.href = "index.html";
  });
}

loadSidebarUser();
loadLogs();

