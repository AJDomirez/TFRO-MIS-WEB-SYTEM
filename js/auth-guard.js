import { supabase } from "./supabase.js";
import { SUPABASE_URL } from "./supabase-config.js";

export const ROLE_DESTINATIONS = Object.freeze({
  admin: "dashboard.html",
  staff: "dashboard.html",
  operator: "operatorportal.html",
});

function clearCachedIdentity() {
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
}

function clearLocalAuthSession() {
  clearCachedIdentity();

  // Supabase normally removes this when signOut succeeds. Clear only this
  // project's Auth storage as a fallback when the network request stalls or
  // fails, instead of deleting unrelated application data with storage.clear().
  try {
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    for (const storage of [localStorage, sessionStorage]) {
      Object.keys(storage)
        .filter((key) => key === storageKey || key.startsWith(`${storageKey}.`))
        .forEach((key) => storage.removeItem(key));
    }
  } catch (error) {
    console.warn("Could not clear the local Supabase session fallback:", error);
  }
}

function cacheIdentity(user, profile) {
  localStorage.setItem("role", profile.role);
  localStorage.setItem("userId", user.id);
}

export function destinationForRole(role) {
  return ROLE_DESTINATIONS[role] || "login.html";
}

export async function loadUserProfile(userId) {
  return supabase
    .from("profiles")
    .select("id, role, full_name, contact_number")
    .eq("id", userId)
    .maybeSingle();
}

/**
 * Verifies the current JWT with Supabase Auth, then authorizes the route using
 * the server-controlled profiles.role value. localStorage is only a UI cache;
 * it is never trusted for access decisions.
 */
export async function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  document.documentElement.dataset.authState = "checking";

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    clearCachedIdentity();
    window.location.replace("login.html");
    return { user: null, profile: null };
  }

  const { data: profile, error: profileError } = await loadUserProfile(user.id);
  if (profileError || !profile || !ROLE_DESTINATIONS[profile.role]) {
    console.error("Unable to authorize this TFRO account:", profileError);
    await supabase.auth.signOut({ scope: "local" });
    clearCachedIdentity();
    window.location.replace("login.html");
    return { user: null, profile: null };
  }

  cacheIdentity(user, profile);

  if (!roles.includes(profile.role)) {
    window.location.replace(destinationForRole(profile.role));
    return { user: null, profile: null };
  }

  document.documentElement.dataset.authState = "authorized";
  return { user, profile };
}

let signOutInProgress = false;

export async function signOutAndRedirect(destination = "index.html") {
  if (signOutInProgress) return;
  signOutInProgress = true;

  // Clear the visible identity immediately so logout remains responsive even
  // if Supabase or the user's connection is temporarily unavailable.
  clearCachedIdentity();

  let timeoutId;
  try {
    const result = await Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise((resolve) => {
        timeoutId = window.setTimeout(
          () => resolve({ error: new Error("Supabase sign-out timed out.") }),
          600
        );
      }),
    ]);
    if (result?.error) console.error("Supabase sign-out failed:", result.error);
  } catch (error) {
    console.error("Supabase sign-out failed:", error);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    clearLocalAuthSession();
    window.location.replace(destination);
  }
}

// All protected pages import this module. Capture logout clicks here so every
// portal uses the same resilient implementation, including legacy pages that
// still contain their older page-specific click handler.
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.("#logoutBtn");
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      void signOutAndRedirect("index.html");
    },
    { capture: true }
  );
}
