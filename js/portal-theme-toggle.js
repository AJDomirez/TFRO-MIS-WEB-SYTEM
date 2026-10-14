/* Appearance preference for Operator and Traffic Enforcer portals. */
(function setupPortalThemeToggle() {
  const STORAGE_KEY = "tfro-theme";
  const PORTAL_ROLES = new Set(["operator", "traffic_enforcer"]);

  function preferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function buttonMarkup(theme) {
    return theme === "dark"
      ? '<i class="ri-sun-line" aria-hidden="true"></i><span>Light mode</span>'
      : '<i class="ri-moon-clear-line" aria-hidden="true"></i><span>Dark mode</span>';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll(".tfro-theme-toggle").forEach((button) => {
      const dark = theme === "dark";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.title = dark ? "Use light mode" : "Use dark mode";
      button.innerHTML = buttonMarkup(theme);
    });
    window.dispatchEvent(new CustomEvent("tfrothemechange", { detail: { theme } }));
  }

  function initialize() {
    const role = localStorage.getItem("role") || "";
    const portalShell = document.body.classList.contains("operator-sidebar")
      || document.body.classList.contains("enforcer-sidebar");
    if (!PORTAL_ROLES.has(role) && !portalShell) return;

    const theme = preferredTheme();
    applyTheme(theme);

    const header = document.querySelector(".topbar");
    if (!header || header.querySelector(".tfro-theme-toggle")) return;

    const actions = document.createElement("div");
    actions.className = "tfro-theme-actions portal-topbar-actions";
    [...header.children]
      .filter((child) => child.matches("button, .back-link, .enforcer-badge"))
      .forEach((control) => actions.appendChild(control));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tfro-theme-toggle";
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    });
    actions.appendChild(button);
    header.appendChild(actions);
    applyTheme(theme);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) {
      applyTheme(event.newValue);
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();

