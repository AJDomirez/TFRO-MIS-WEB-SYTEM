/* =========================================================
   TFRO Shared Sidebar User Helper
   Populates the sidebar user name / role / avatar from the
   logged-in profile. Include after supabase.js on any page
   that shows a sidebar user widget.
   ========================================================= */
let supabaseClientPromise;
let activeTableScrollControls = null;

function activateTableScrollControls(controls) {
  if (activeTableScrollControls === controls) return;
  activeTableScrollControls?.classList.remove("is-current");
  activeTableScrollControls = controls;
  activeTableScrollControls?.classList.add("is-current");
}

function refreshVisibleTableControls() {
  const currentArea = activeTableScrollControls?.nextElementSibling;
  if (currentArea) {
    const rect = currentArea.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) return;
  }
  let best = null;
  let bestVisibleHeight = 0;
  document.querySelectorAll(".tfro-table-scroll-controls.is-needed").forEach((controls) => {
    const area = controls.nextElementSibling;
    const rect = area?.getBoundingClientRect();
    if (!rect) return;
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    if (visibleHeight > bestVisibleHeight) {
      bestVisibleHeight = visibleHeight;
      best = controls;
    }
  });
  activateTableScrollControls(bestVisibleHeight > 0 ? best : null);
}

function setupSystemLoader() {
  let loader = null;
  let shownAt = 0;
  let finished = false;
  const show = () => {
    if (finished || document.querySelector(".tfro-system-loader")) return;
    loader = document.createElement("div");
    loader.className = "tfro-system-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.setAttribute("aria-label", "TFRO is waiting for a connection");
    const connectionMessage = navigator.onLine
      ? "The connection is taking longer than usual"
      : "No internet connection. Trying to reconnect";
    loader.innerHTML = `
      <div class="tfro-loader-card">
        <div class="tfro-loader-scene" aria-hidden="true">
          <span class="tfro-loader-sun"></span>
          <span class="tfro-loader-cloud tfro-loader-cloud-one"></span>
          <span class="tfro-loader-cloud tfro-loader-cloud-two"></span>
          <img class="tfro-loader-tricycle" src="../Tricycle Image.png" alt="">
          <span class="tfro-loader-exhaust"></span>
          <div class="tfro-loader-road"><span></span><span></span><span></span></div>
        </div>
        <strong>TFRO MIS</strong>
        <p>${connectionMessage}<span class="tfro-loader-dots" aria-hidden="true"></span></p>
      </div>`;
    document.body.appendChild(loader);
    shownAt = performance.now();
  };
  const showProblem = () => {
    show();
    const message = loader?.querySelector("p");
    if (message) {
      message.textContent = navigator.onLine
        ? "Unable to reach the server. Please check your connection."
        : "No internet connection. Please reconnect and try again.";
    }
  };
  const delayTimer = window.setTimeout(show, 1200);
  const dismiss = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(delayTimer);
    if (!loader) return;
    const remaining = Math.max(0, 400 - (performance.now() - shownAt));
    window.setTimeout(() => {
      loader.classList.add("is-leaving");
      loader.addEventListener("animationend", (event) => {
        if (event.target === loader && event.animationName === "tfroLoaderLeave") loader.remove();
      });
      window.setTimeout(() => loader.remove(), 700);
    }, remaining);
  };
  return { dismiss, showProblem };
}

function getSupabaseClient() {
  supabaseClientPromise ||= import("./supabase.js").then((module) => module.supabase);
  return supabaseClientPromise;
}

// Apply the fixed admin navigation immediately, before the profile request
// completes, so the sidebar does not jump or reflow on page load.
const savedRole = localStorage.getItem("role") || "";
if (savedRole) {
  document.body.classList.toggle("admin-sidebar", ["admin", "staff"].includes(savedRole));
  document.body.classList.toggle("operator-sidebar", ["operator", "traffic_enforcer"].includes(savedRole));
  document.body.classList.toggle("enforcer-sidebar", savedRole === "traffic_enforcer");
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
    traffic_enforcer: "Traffic Enforcer",
  };
  return map[role] || role || "User";
}

function setupAdminNavigation() {
  const menu = document.querySelector(".sidebar .menu");
  if (!menu || menu.dataset.adminMenuReady) return;

  const franchisePages = [
    { href: "franchise.html", icon: "ri-file-list-3-line", label: "Franchise Records" },
    { href: "renewals.html", icon: "ri-refresh-line", label: "Franchise Renewals" },
    { href: "motorequests.html", icon: "ri-settings-5-line", label: "Change Motor Requests" },
  ];
  const pages = [
    { href: "dashboard.html", icon: "ri-dashboard-line", label: "Dashboard" },
    { href: "operator.html", icon: "ri-user-star-line", label: "Operators" },
    { href: "driver.html", icon: "ri-steering-2-line", label: "Drivers" },
    { href: "enforcers.html", icon: "ri-shield-user-line", label: "Traffic Enforcers" },
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

  const sidebar = document.querySelector(".sidebar");
  sidebar?.addEventListener("mouseleave", () => {
    if (!window.matchMedia("(min-width: 769px)").matches) return;
    parentItem.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  });
  sidebar?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    parentItem.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.blur();
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

function setupEnforcerNavigation() {
  const menu = document.querySelector(".sidebar .menu");
  if (!menu || menu.dataset.enforcerMenuReady) return;
  const currentPage = window.location.pathname.split("/").pop() || "enforcerportal.html";
  const pages = [
    { href: "enforcerportal.html", icon: "ri-shield-user-line", label: "Ticketing & Driver Search" },
  ];
  menu.dataset.enforcerMenuReady = "true";
  menu.innerHTML = pages.map((page) => `<li class="${page.href === currentPage ? "active" : ""}"><a href="${page.href}"><i class="${page.icon}"></i><span>${page.label}</span></a></li>`).join("");
  menu.dataset.navigationReady = "true";
}

async function loadSidebarUser() {
  const supabase = await getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const role = profile?.role || localStorage.getItem("role") || "";
  if (role) {
    document.body.classList.toggle("admin-sidebar", ["admin", "staff"].includes(role));
    document.body.classList.toggle("operator-sidebar", ["operator", "traffic_enforcer"].includes(role));
    document.body.classList.toggle("enforcer-sidebar", role === "traffic_enforcer");
  }
  if (role === "operator") setupOperatorNavigation();
  if (role === "staff") setupStaffNavigation();
  if (role === "admin") setupAdminNavigation();
  if (role === "traffic_enforcer") setupEnforcerNavigation();

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

function enhanceScrollableTable(table) {
  if (table.dataset.scrollControlsReady || table.closest(".tfro-system-loader")) return;
  table.dataset.scrollControlsReady = "true";

  const originalParent = table.parentElement;
  const scrollArea = document.createElement("div");
  scrollArea.className = "tfro-table-scroll";
  scrollArea.tabIndex = 0;
  scrollArea.setAttribute("role", "region");
  scrollArea.setAttribute("aria-label", "Scrollable data table");
  originalParent.insertBefore(scrollArea, table);
  scrollArea.appendChild(table);
  originalParent.classList.add("tfro-has-scroll-controls");

  const controls = document.createElement("div");
  controls.className = "tfro-table-scroll-controls";
  controls.innerHTML = `
    <span><i class="ri-drag-move-2-line"></i> Move across table</span>
    <div>
      <button type="button" data-table-scroll="left" aria-label="Scroll table left" title="Scroll table left"><i class="ri-arrow-left-line"></i><span>Left</span></button>
      <button type="button" data-table-scroll="right" aria-label="Scroll table right" title="Scroll table right"><span>Right</span><i class="ri-arrow-right-line"></i></button>
    </div>`;
  originalParent.insertBefore(controls, scrollArea);

  const leftButton = controls.querySelector('[data-table-scroll="left"]');
  const rightButton = controls.querySelector('[data-table-scroll="right"]');
  const update = () => {
    const max = Math.max(0, scrollArea.scrollWidth - scrollArea.clientWidth);
    controls.classList.toggle("is-needed", max > 2);
    leftButton.disabled = scrollArea.scrollLeft <= 2;
    rightButton.disabled = scrollArea.scrollLeft >= max - 2;
    scrollArea.classList.toggle("at-left", scrollArea.scrollLeft <= 2);
    scrollArea.classList.toggle("at-right", scrollArea.scrollLeft >= max - 2);
    if (max <= 2 && activeTableScrollControls === controls) activateTableScrollControls(null);
    else refreshVisibleTableControls();
  };
  const move = (direction) => scrollArea.scrollBy({
    left: direction * Math.max(240, scrollArea.clientWidth * .68),
    behavior: "smooth",
  });

  leftButton.addEventListener("click", () => move(-1));
  rightButton.addEventListener("click", () => move(1));
  scrollArea.addEventListener("pointerenter", () => activateTableScrollControls(controls));
  scrollArea.addEventListener("focusin", () => activateTableScrollControls(controls));
  scrollArea.addEventListener("scroll", update, { passive: true });
  scrollArea.addEventListener("wheel", (event) => {
    if (!event.shiftKey || scrollArea.scrollWidth <= scrollArea.clientWidth) return;
    event.preventDefault();
    scrollArea.scrollLeft += event.deltaY;
  }, { passive: false });
  new ResizeObserver(update).observe(scrollArea);
  new ResizeObserver(update).observe(table);
  window.setTimeout(update, 0);
}

function setupTableScrollControls() {
  document.querySelectorAll("main table").forEach(enhanceScrollableTable);
  const main = document.querySelector("main");
  if (!main || main.dataset.tableObserverReady) return;
  main.dataset.tableObserverReady = "true";
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches("table")) enhanceScrollableTable(node);
      node.querySelectorAll?.("table").forEach(enhanceScrollableTable);
    }));
  }).observe(main, { childList: true, subtree: true });
  let scheduled = false;
  const scheduleRefresh = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refreshVisibleTableControls();
    });
  };
  window.addEventListener("scroll", scheduleRefresh, { passive: true });
  window.addEventListener("resize", scheduleRefresh, { passive: true });
  window.setTimeout(scheduleRefresh, 0);
}

function initializeSidebar() {
  const loader = setupSystemLoader();
  if (savedRole === "operator") setupOperatorNavigation();
  else if (savedRole === "traffic_enforcer") setupEnforcerNavigation();
  else if (savedRole === "staff") setupStaffNavigation();
  else if (savedRole === "admin") setupAdminNavigation();
  loadSidebarUser().then(
    () => loader?.dismiss(),
    (error) => {
      console.warn("Sidebar profile could not be loaded:", error);
      loader?.showProblem();
      window.setTimeout(() => loader?.dismiss(), 4500);
    }
  );
  setupSharedTableSearch();
  setupTableScrollControls();

  document.querySelectorAll(".sidebar .menu a, .sidebar .franchise-menu-toggle").forEach((item) => {
    const label = item.querySelector("span")?.textContent?.trim();
    if (label) {
      item.title ||= label;
      item.setAttribute("aria-label", label);
    }
  });

  const logoutButton = document.getElementById("logoutBtn");
  if (logoutButton) {
    logoutButton.title = "Sign out";
    logoutButton.setAttribute("aria-label", "Sign out");
  }
}

// Module scripts are deferred, but this also supports pages that load the
// helper before parsing has finished. Initialize exactly once to prevent the
// navigation from being rebuilt a second time after the first paint.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSidebar, { once: true });
} else {
  initializeSidebar();
}
