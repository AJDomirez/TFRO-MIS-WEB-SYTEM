import { supabase } from "./supabase.js";
import { destinationForRole, loadUserProfile } from "./auth-guard.js";

// Password visibility toggle
const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");
if (togglePassword && passwordInput) {
  togglePassword.addEventListener("click", function () {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    this.querySelector("i").className = isPassword ? "ri-eye-off-line" : "ri-eye-line";
  });
}

const loginForm = document.getElementById("loginForm");
const submitButton = loginForm.querySelector('button[type="submit"]');

// Resolve the user's role and route them to the correct portal.
async function routeUser(user) {
  // 1) Try to load the role from the profiles table.
  let role = null;
  const { data: profile, error: profileError } = await loadUserProfile(user.id);

  if (!profileError && profile && destinationForRole(profile.role) !== "login.html") {
    role = profile.role;
  }

  if (!role) {
    await supabase.auth.signOut();
    alert(
      profile?.role === "driver"
        ? "Drivers do not sign in. Your Operator manages your driver application and credentials."
        : "This account has no authorized TFRO role. Contact the TFRO administrator."
    );
    return false;
  }

  // Kept temporarily because the existing portal pages use this value for their UI.
  localStorage.setItem("role", role);
  localStorage.setItem("userId", user.id);

  // Insert an audit log entry for the successful login.
  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  await supabase
    .from("audit_logs")
    .insert({
      user_name: fullName || user.email,
      role,
      action: "Logged in to system",
      action_type: "login",
      ip_address: null,
      user_id: user.id,
    })
    .then(() => {})
    .catch((err) => console.error("Audit log insert failed:", err));

  window.location.replace(destinationForRole(role));
  return true;
}

// Map Supabase Auth sign-in errors to user-friendly messages.
function friendlyLoginError(error) {
  const message = (error && (error.message || error.error_description)) || "";
  const lower = String(message).toLowerCase();

  // "Invalid login credentials" — provided by Supabase when the email is not
  // registered OR the password is wrong. The message is intentionally generic
  // for security.
  if (lower.includes("invalid login credentials")) {
    return "Login failed: Incorrect email or password. Please try again.";
  }

  // "Email not confirmed" — user registered but hasn't clicked the confirmation link.
  if (lower.includes("email not confirmed") || lower.includes("confirmation email")) {
    return "Login failed: Your email has not been confirmed yet. Please check your inbox for the confirmation link.";
  }

  // "User already registered" — treated as login failure to avoid revealing
  // whether an email exists, but it usually means the user is trying to register.
  if (lower.includes("user already registered")) {
    return "Login failed: No account found with these details. Please double-check your email and password, or create a new account.";
  }

  // Weak password, too many attempts, etc.
  if (lower.includes("password should be at least")) {
    return "Login failed: Password must be at least 6 characters.";
  }
  if (lower.includes("rate limit") || lower.includes("too many") || error?.status === 429) {
    return "Login failed: Too many attempts. Please wait a minute and try again.";
  }

  // Server-side / unhandled error.
  if (error?.status === 500 || error?.status === 502 || error?.status === 503) {
    return "Login failed: The authentication server is currently unavailable. Please try again later.";
  }

  // Return original message if useful, otherwise generic.
  return message && message !== "{}"
    ? `Login failed: ${message}`
    : "Login failed. Please check your email and password and try again.";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  let authData;
  let authError;
  try {
    ({ data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    }));
  } catch (requestError) {
    console.error("Supabase sign-in request failed:", requestError);
    alert(friendlyLoginError(requestError));
    submitButton.disabled = false;
    submitButton.textContent = "Sign In";
    return;
  }

  if (authError || !authData.user) {
    console.error("Supabase sign-in error:", authError);
    alert(friendlyLoginError(authError));
    submitButton.disabled = false;
    submitButton.textContent = "Sign In";
    return;
  }

  const success = await routeUser(authData.user);
  if (!success) {
    submitButton.disabled = false;
    submitButton.textContent = "Sign In";
  }
});

// Auto sign-in: if the user is redirected back here after confirming their
// email (Supabase puts the session in the URL), sign them in automatically.
(async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await routeUser(session.user);
    }
  } catch (error) {
    console.error("Could not restore the existing session:", error);
  }
})();
