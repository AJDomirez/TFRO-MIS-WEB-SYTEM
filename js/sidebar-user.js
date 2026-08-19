/* =========================================================
   TFRO Shared Sidebar User Helper
   Populates the sidebar user name / role / avatar from the
   logged-in profile. Include after supabase.js on any page
   that shows a sidebar user widget.
   ========================================================= */
import { supabase } from "./supabase.js";

// Apply the fixed admin navigation immediately, before the profile request
// completes, so the sidebar does not jump or reflow on page load.
const savedRole = localStorage.getItem("role") || "";
if (savedRole) {
  document.body.classList.toggle("admin-sidebar", ["admin", "staff"].includes(savedRole));
  document.body.classList.toggle("operator-sidebar", savedRole === "operator");
}

function initials(name = "") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase())
      .slice(0, 2)
      .join("") || "U"
  );
}

function roleLabel(role) {
  const map = {
    admin: "Administrator",
    staff: "TFRO Staff",
    operator: "Operator",
  };
  return map[role] || role || "User";
}

function setupFranchiseMenu() {
  const franchiseLink = document.querySelector('.menu a[href="franchise.html"]');
  const parentItem = franchiseLink?.closest("li");
  if (!parentItem || parentItem.dataset.franchiseMenuReady) return;

  const pages = [
    { href: "franchise.html", icon: "ri-file-list-3-line", label: "Franchise Records" },
    { href: "renewals.html", icon: "ri-refresh-line", label: "Franchise Renewals" },
    { href: "motorequests.html", icon: "ri-settings-5-line", label: "Change Motor Requests" },
    { href: "operator.html", icon: "ri-user-star-line", label: "Operators" },
    { href: "driver.html", icon: "ri-steering-2-line", label: "Drivers" },
    { href: "violation.html", icon: "ri-alert-line", label: "Violations" },
  ];
  const currentPage = window.location.pathname.split("/").pop() || "franchise.html";
  const isSectionPage = pages.some((page) => page.href === currentPage);

  // Remove the former standalone entries so they exist only within Franchises.
  const hiddenPages = new Set(["application.html"]);
  document.querySelectorAll(".menu > li").forEach((item) => {
    if (item === parentItem) return;
    const href = item.querySelector("a")?.getAttribute("href");
    if (pages.some((page) => page.href === href) || hiddenPages.has(href)) item.remove();
  });

  parentItem.dataset.franchiseMenuReady = "true";
  parentItem.className = `franchise-menu${isSectionPage ? " open" : ""}`;
  parentItem.innerHTML = `
    <button class="franchise-menu-toggle" type="button" aria-expanded="${isSectionPage}">
      <i class="ri-file-list-3-line"></i><span>Franchises</span><i class="ri-arrow-down-s-line franchise-menu-arrow"></i>
    </button>
    <ul class="franchise-submenu">
      ${pages.map((page) => `<li class="${page.href === currentPage ? "active" : ""}"><a href="${page.href}"><i class="${page.icon}"></i><span>${page.label}</span></a></li>`).join("")}
    </ul>`;

  const toggle = parentItem.querySelector(".franchise-menu-toggle");
  toggle.addEventListener("click", () => {
    const isOpen = parentItem.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function setupOperatorNavigation() {
  const menu = document.querySelector(".sidebar .menu");
  if (!menu || menu.dataset.operatorMenuReady) return;
  const currentPage = window.location.pathname.split("/").pop() || "operatorportal.html";
  const activePage = currentPage === "operatorapplication.html" ? "operatorportal.html" : currentPage;
  const pages = [
    { href: "operatorportal.html", icon: "ri-home-4-line", label: "Home" },
    { href: "renewal.html", icon: "ri-refresh-line", label: "Franchise Renewal" },
    { href: "notification.html", icon: "ri-notification-3-line", label: "Notifications" },
    { href: "operatorprofile.html", icon: "ri-user-settings-line", label: "My Profile" },
  ];
  menu.dataset.operatorMenuReady = "true";
  menu.innerHTML = pages.map((page) => `<li class="${page.href === activePage ? "active" : ""}"><a href="${page.href}"><i class="${page.icon}"></i><span>${page.label}</span></a></li>`).join("");
}

function setupStaffNavigation() {
  const menu = document.querySelector(".sidebar .menu");
  if (!menu || menu.dataset.staffMenuReady) return;
  const currentPage = window.location.pathname.split("/").pop() || "violation.html";
  const pages = [
    { href: "violation.html", icon: "ri-alert-line", label: "Violations" },
    { href: "payment.html", icon: "ri-money-dollar-circle-line", label: "Payments" },
    { href: "notification.html", icon: "ri-notification-3-line", label: "Notices" },
    { href: "profile.html", icon: "ri-user-settings-line", label: "Profile" },
  ];
  menu.dataset.staffMenuReady = "true";
  menu.innerHTML = pages.map((page) => `<li class="${page.href === currentPage ? "active" : ""}"><a href="${page.href}"><i class="${page.icon}"></i><span>${page.label}</span></a></li>`).join("");
}

async function loadSidebarUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const role = profile?.role || localStorage.getItem("role") || "";
  if (role) {
    document.body.classList.toggle("admin-sidebar", ["admin", "staff"].includes(role));
    document.body.classList.toggle("operator-sidebar", role === "operator");
  }
  if (role === "operator") setupOperatorNavigation();
  if (role === "staff") setupStaffNavigation();

  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const avatarEl = document.getElementById("userAvatar");

  if (nameEl) nameEl.textContent = fullName || roleLabel(role);
  if (roleEl) roleEl.textContent = roleLabel(role);
  if (avatarEl) avatarEl.textContent = initials(fullName || roleLabel(role));
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function applySharedTableSearch(input) {
  // Run after each page's own search renderer so this becomes a consistent
  // final filter without replacing page-specific status/date filtering.
  window.setTimeout(() => {
    const query = normalizeSearchText(input.value);
    document.querySelectorAll("main table tbody").forEach((body) => {
      const rows = [...body.querySelectorAll("tr")];
      rows.forEach((row) => {
        const isMessageRow = row.cells.length === 1 && row.cells[0]?.colSpan > 1;
        row.hidden = Boolean(query) && !isMessageRow && !normalizeSearchText(row.textContent).includes(query);
      });
    });
  }, 0);
}

function setupSharedTableSearch() {
  document.querySelectorAll('#searchInput, input[type="search"][data-table-search]').forEach((input) => {
    if (input.dataset.sharedSearchReady) return;
    input.dataset.sharedSearchReady = "true";
    input.addEventListener("input", () => applySharedTableSearch(input));
  });
}

function initializeSidebar() {
  if (savedRole === "operator") setupOperatorNavigation();
  else if (savedRole === "staff") setupStaffNavigation();
  else setupFranchiseMenu();
  loadSidebarUser();
  setupSharedTableSearch();
}

// Module scripts are deferred, but this also supports pages that load the
// helper before parsing has finished. Initialize exactly once to prevent the
// navigation from being rebuilt a second time after the first paint.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSidebar, { once: true });
} else {
  initializeSidebar();
}
