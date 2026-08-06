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

let notifications = [];

const container = document.getElementById("notificationContainer");
const unreadCount = document.getElementById("unreadCount");
const totalCount = document.getElementById("totalCount");

/* SIDEBAR USER */
async function loadSidebarUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = "index.html";
    return null;
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

  return user;
}

function timeAgo(ts) {
  const date = new Date(ts);
  if (isNaN(date)) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function renderNotifications() {
  if (!container) return;

  container.innerHTML = "";

  let unread = 0;

  notifications.forEach((n) => {
    if (!n.is_read) unread++;

    const card = document.createElement("div");
    card.className = `notification-card ${n.is_read ? "" : "unread"}`;

    card.innerHTML = `
      <div class="notification-icon ${n.type}">
        <i class="ri-notification-3-line"></i>
      </div>

      <div class="notification-content">

        <div class="notification-top">
          <div class="notification-title">${escapeHtml(n.title)}</div>
          <div class="notification-time">${timeAgo(n.created_at)}</div>
        </div>

        <div class="notification-message">${escapeHtml(n.message)}</div>

      </div>

      <button class="close-btn" data-id="${n.id}">
        <i class="ri-close-line"></i>
      </button>
    `;

    container.appendChild(card);
  });

  if (unreadCount) unreadCount.textContent = unread;
  if (totalCount) totalCount.textContent = notifications.length;

  container.querySelectorAll(".close-btn").forEach((btn) => {
    btn.addEventListener("click", () => removeNotification(Number(btn.dataset.id)));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

async function loadNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Notification load error:", error);
    notifications = [];
  } else {
    notifications = data || [];
  }

  renderNotifications();
}

async function removeNotification(id) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) {
    console.error("Notification delete error:", error);
    alert("Failed to remove notification: " + error.message);
    return;
  }
  notifications = notifications.filter((n) => n.id !== id);
  renderNotifications();
}

async function markAllRead() {
  const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
  if (!ids.length) {
    alert("No unread notifications.");
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids);

  if (error) {
    console.error("Mark all read error:", error);
    alert("Failed to update notifications: " + error.message);
    return;
  }

  notifications.forEach((n) => (n.is_read = true));
  renderNotifications();
}
window.markAllRead = markAllRead;

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
loadNotifications();

