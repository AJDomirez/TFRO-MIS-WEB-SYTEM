/* Shared appearance preference for TFRO MIS screens. */
const STORAGE_KEY = "tfro-theme";

function preferredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelectorAll(".tfro-theme-toggle").forEach((button) => {
    const dark = theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    button.innerHTML = dark
      ? '<i class="ri-sun-line" aria-hidden="true"></i><span>Light mode</span>'
      : '<i class="ri-moon-clear-line" aria-hidden="true"></i><span>Dark mode</span>';
  });
  window.dispatchEvent(new CustomEvent("tfrothemechange", { detail: { theme } }));
}

function addThemeButton() {
  const header = document.querySelector(".topbar, .admin-users-main > header, body > header, .nav");
  const useFloatingControl = !header;
  if (header?.querySelector(".tfro-theme-toggle") || document.querySelector(".tfro-theme-actions-floating .tfro-theme-toggle")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tfro-theme-toggle";
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  });

  const actions = header?.querySelector(".topbar-actions") || (() => {
    const container = document.createElement("div");
    container.className = useFloatingControl ? "tfro-theme-actions tfro-theme-actions-floating" : "tfro-theme-actions";
    if (header?.classList.contains("topbar")) {
      [...header.children]
        .filter((child) => child instanceof HTMLButtonElement)
        .forEach((existingButton) => container.appendChild(existingButton));
    }
    (header || document.body).appendChild(container);
    return container;
  })();
  actions.appendChild(button);
}

function initializeTheme() {
  const role = localStorage.getItem("role");
  if (!document.body.classList.contains("admin-sidebar") || (role && !["admin", "admin_viewer"].includes(role))) return;
  addThemeButton();
  applyTheme(preferredTheme());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeTheme, { once: true });
} else {
  initializeTheme();
}
