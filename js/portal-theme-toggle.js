/* Operator and Traffic Enforcer portals always use the accessible light theme.
   The shared Admin theme preference remains stored for Admin pages only. */
(function lockUserPortalsToLightTheme() {
  const PORTAL_ROLES = new Set(["operator", "traffic_enforcer"]);

  function isUserPortal(role = localStorage.getItem("role") || "") {
    return PORTAL_ROLES.has(role)
      || document.body.classList.contains("operator-sidebar")
      || document.body.classList.contains("enforcer-sidebar");
  }

  function applyLightOnlyTheme(role) {
    if (!isUserPortal(role)) return;

    // Keep the saved Admin preference so it can be restored on an Admin page.
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "light";

    document.querySelectorAll(".tfro-theme-toggle").forEach((button) => button.remove());
    document.querySelectorAll(".portal-topbar-actions, .tfro-theme-actions").forEach((actions) => {
      if (!actions.children.length) actions.remove();
    });

    window.dispatchEvent(new CustomEvent("tfrothemechange", {
      detail: { theme: "light", locked: true },
    }));
  }

  window.addEventListener("tfrorolechange", (event) => {
    applyLightOnlyTheme(event.detail?.role || "");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === "tfro-theme") applyLightOnlyTheme();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyLightOnlyTheme(), { once: true });
  } else {
    applyLightOnlyTheme();
  }
})();

