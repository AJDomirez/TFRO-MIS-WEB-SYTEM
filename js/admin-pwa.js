import { supabase } from "./supabase.js";
import { loadUserProfile } from "./auth-guard.js";

const installButton = document.getElementById("installAppBtn");
const INSTALLABLE_ROLES = new Set(["admin", "admin_viewer", "staff"]);
let installPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function setInstalledState() {
  if (!installButton) return;
  installButton.hidden = false;
  installButton.disabled = true;
  installButton.innerHTML = '<i class="ri-checkbox-circle-line"></i><span>TFRO APP Installed</span>';
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (installButton?.dataset.installAuthorized === "true") installButton.hidden = false;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  setInstalledState();
});

installButton?.addEventListener("click", async () => {
  if (isStandalone()) {
    setInstalledState();
    return;
  }

  if (!installPrompt) {
    const appleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.alert(appleMobile
      ? "To install TFRO APP, tap Share, then choose Add to Home Screen."
      : "TFRO APP is ready to install. Open your browser menu and choose Install app or Add to Home screen.");
    return;
  }

  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
});

async function enableForAuthorizedRole() {
  if (!installButton) return;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return;

  const { data: profile, error: profileError } = await loadUserProfile(user.id);
  if (profileError || !INSTALLABLE_ROLES.has(profile?.role) || profile.account_status !== "active") return;

  installButton.dataset.installAuthorized = "true";
  installButton.hidden = false;

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("../service-worker.js");
    } catch (error) {
      console.warn("TFRO APP worker could not be registered:", error);
    }
  }

  if (isStandalone()) setInstalledState();
}

void enableForAuthorizedRole();
