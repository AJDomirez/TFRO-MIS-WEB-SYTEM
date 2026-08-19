/* =========================================================
   TFRO Shared Sidebar User Helper
   Populates the sidebar user name / role / avatar from the
   logged-in profile. Include after supabase.js on any page
   that shows a sidebar user widget.
   ========================================================= */
let supabaseClientPromise;

function getSupabaseClient() {
  supabaseClientPromise ||= import("./supabase.js").then((module) => module.supabase);
  return supabaseClientPromise;
}

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

function setupAdminNavigation() {
  const menu = document.querySelector(".sidebar .menu");
  if (!menu || menu.dataset.adminMenuReady) return;

  const franchisePages = [
    { href: "franchise.html", icon: "ri-file-list-3-line", label: "Franchise Records" },
    { href: "application.html", icon: "ri-file-add-line", label: "Applications" },
    { href: "renewals.html", icon: "ri-refresh-line", label: "Franchise Renewals" },
    { href: "motorequests.html", icon: "ri-settings-5-line", label: "Change Motor Requests" },
  ];
  const pages = [
    { href: "dashboard.html", icon: "ri-dashboard-line", label: "Dashboard" },
    { href: "operator.html", icon: "ri-user-star-line", label: "Operators" },
    { href: "driver.html", icon: "ri-steering-2-line", label: "Drivers" },
    { href: "violation.html", icon: "ri-alert-line", label: "Violations" },
    { href: "report.html", icon: "ri-bar-chart-line", label: "Reports" },
    { href: "notification.html", icon: "ri-notification-3-line", label: "Notifications" },
    { href: "auditlog.html", icon: "ri-history-line", label: "Audit Log" },
    { href: "profile.html", icon: "ri-user-settings-line", label: "Profile" },
  ];
  const currentPage = window.location.pathname.split("/").pop() || "franchise.html";
  const isFranchisePage = franchisePages.some((page) => page.href === currentPage);
  const franchiseItem = `
  <li class="franchise-menu${isFranchisePage ? " open" : ""}">
    <button class="franchise-menu-toggle" type="button" aria-expanded="${isFranchisePage}">
      <i class="ri-file-list-3-line"></i><span>Franchises</span><i class="ri-arrow-down-s-line franchise-menu-arrow"></i>
    </button>
    <ul class="franchise-submenu">
      ${franchisePages.map((page) => `<li class="${page.href === currentPage ? "active" : ""}"><a href="${page.href}"><i class="${page.icon}"></i><span>${page.label}</span></a></li>`).join("")}
    </ul>
  </li>`;

  menu.dataset.adminMenuReady = "true";
  menu.innerHTML = [
    pages[0],
    franchiseItem,
    ...pages.slice(1),
  ].map((page) => typeof page === "string"
    ? page
    : `<li class="${page.href === currentPage ? "active" : ""}"><a href="${page.href}"><i class="${page.icon}"></i><span>${page.label}</span></a></li>`
  ).join("");
  menu.dataset.navigationReady = "true";

  const parentItem = menu.querySelector(".franchise-menu");
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
    { href: "operatorportal.html", icon: "ri-file-list-3-line", label: "My Franchise" },
    { href: "renewal.html", icon: "ri-refresh-line", label: "Franchise Renewal" },
    { href: "notification.html", icon: "ri-notification-3-line", label: "Notifications" },
    { href: "operatorprofile.html", icon: "ri-user-settings-line", label: "My Profile" },
  ];
  menu.dataset.operatorMenuReady = "true";
  menu.innerHTML = pages.map((page) => {
    const active = page.href === activePage;
    return `<li class="${active ? "active" : ""}"><a href="${page.href}"${active ? ' aria-current="page"' : ""}><i class="${page.icon}"></i><span>${page.label}</span></a></li>`;
  }).join("");
  menu.dataset.navigationReady = "true";
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
  menu.dataset.navigationReady = "true";
}

async function loadSidebarUser() {
  const supabase = await getSupabaseClient();
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
  if (role === "admin") setupAdminNavigation();

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
  else if (savedRole === "admin") setupAdminNavigation();
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
