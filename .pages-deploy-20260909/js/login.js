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
const loginMessage = document.getElementById("loginMessage");
const forgotPasswordButton = document.getElementById("forgotPasswordBtn");
const recoveryPanel = document.getElementById("recoveryPanel");
const recoveryBackButton = document.getElementById("recoveryBackBtn");
const recoveryRequestForm = document.getElementById("recoveryRequestForm");
const recoveryVerifyForm = document.getElementById("recoveryVerifyForm");
const recoveryEmailInput = document.getElementById("recoveryEmail");
const recoveryMessage = document.getElementById("recoveryMessage");
const sendRecoveryCodeButton = document.getElementById("sendRecoveryCodeBtn");
const verifyRecoveryCodeButton = document.getElementById("verifyRecoveryCodeBtn");
const resendRecoveryCodeButton = document.getElementById("resendRecoveryCodeBtn");
let recoveryEmail = "";
const LOGIN_ATTEMPT_KEY = "tfro-login-attempt-security";
let maxLoginAttempts = 5;
let lockoutSeconds = 60;
let lockoutTimer = null;

function readAttemptState() {
  try {
    const state = JSON.parse(localStorage.getItem(LOGIN_ATTEMPT_KEY) || "{}");
    return {
      failures: Math.max(0, Number(state.failures) || 0),
      lockedUntil: Math.max(0, Number(state.lockedUntil) || 0),
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

function saveAttemptState(state) {
  localStorage.setItem(LOGIN_ATTEMPT_KEY, JSON.stringify(state));
}

function clearAttemptState() {
  localStorage.removeItem(LOGIN_ATTEMPT_KEY);
  if (lockoutTimer) window.clearInterval(lockoutTimer);
  lockoutTimer = null;
}

function refreshLockout() {
  const state = readAttemptState();
  if (!state.lockedUntil) return false;
  const remainingSeconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    clearAttemptState();
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="ri-login-box-line"></i> Sign In';
    if (loginMessage.textContent.includes("Too many incorrect")) loginMessage.hidden = true;
    return false;
  }
  submitButton.disabled = true;
  submitButton.innerHTML = `<i class="ri-time-line"></i> Try again in ${remainingSeconds}s`;
  showLoginWarning(`Too many incorrect password attempts. Please wait ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"} for another 5 attempts.`);
  if (!lockoutTimer) lockoutTimer = window.setInterval(refreshLockout, 250);
  return true;
}

function recordInvalidPassword() {
  const state = readAttemptState();
  state.failures += 1;
  if (state.failures >= maxLoginAttempts) {
    state.lockedUntil = Date.now() + lockoutSeconds * 1000;
    saveAttemptState(state);
    refreshLockout();
    return 0;
  }
  saveAttemptState(state);
  return maxLoginAttempts - state.failures;
}

async function loadPasswordSecuritySettings() {
  const { data } = await supabase.from("system_settings")
    .select("max_login_attempts, login_lockout_seconds").eq("id", true).maybeSingle();
  const configuredAttempts = Number(data?.max_login_attempts);
  const configuredSeconds = Number(data?.login_lockout_seconds);
  if (Number.isInteger(configuredAttempts) && configuredAttempts >= 1 && configuredAttempts <= 10) maxLoginAttempts = configuredAttempts;
  if (Number.isInteger(configuredSeconds) && configuredSeconds >= 10 && configuredSeconds <= 3600) lockoutSeconds = configuredSeconds;
  refreshLockout();
}

function isInvalidCredentialError(error) {
  return String(error?.message || error?.error_description || "").toLowerCase()
    .includes("invalid login credentials");
}

function showLoginWarning(message) {
  loginMessage.textContent = message;
  loginMessage.hidden = false;
}

function showRecoveryMessage(message, type = "error") {
  recoveryMessage.textContent = message;
  recoveryMessage.classList.toggle("success", type === "success");
  recoveryMessage.hidden = false;
}

function setRecoveryOpen(open) {
  loginForm.hidden = open;
  recoveryPanel.hidden = !open;
  recoveryMessage.hidden = true;
  if (open) {
    recoveryEmailInput.value = document.getElementById("email").value.trim();
    recoveryEmailInput.focus();
  }
}

function passwordMeetsRequirements(value) {
  return value.length >= 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9\s]/.test(value);
}

async function sendRecoveryCode() {
  recoveryEmail = recoveryEmailInput.value.trim().toLowerCase();
  if (!recoveryEmail) return;

  sendRecoveryCodeButton.disabled = true;
  sendRecoveryCodeButton.textContent = "Sending code...";
  const redirectTo = new URL("login.html?recovery=1", window.location.href).href;

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, { redirectTo });
    if (error) throw error;
    recoveryRequestForm.hidden = true;
    recoveryVerifyForm.hidden = false;
    showRecoveryMessage("If this email belongs to an Operator account, a six-digit recovery code has been sent. Check the inbox and spam folder.", "success");
    document.getElementById("recoveryCode").focus();
  } catch (error) {
    const rateLimited = error?.status === 429 || String(error?.message || "").toLowerCase().includes("rate limit");
    showRecoveryMessage(rateLimited
      ? "Too many recovery requests. Please wait before requesting another code."
      : "The recovery code could not be sent. Please try again.");
  } finally {
    sendRecoveryCodeButton.disabled = false;
    sendRecoveryCodeButton.innerHTML = '<i class="ri-mail-send-line"></i> Send Verification Code';
  }
}

forgotPasswordButton.addEventListener("click", () => setRecoveryOpen(true));
recoveryBackButton.addEventListener("click", () => {
  recoveryRequestForm.hidden = false;
  recoveryVerifyForm.hidden = true;
  recoveryEmail = "";
  setRecoveryOpen(false);
});
recoveryRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendRecoveryCode();
});
resendRecoveryCodeButton.addEventListener("click", async () => {
  recoveryRequestForm.hidden = false;
  recoveryVerifyForm.hidden = true;
  recoveryMessage.hidden = true;
  recoveryEmailInput.focus();
});
recoveryVerifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = document.getElementById("recoveryCode").value.trim();
  const newPassword = document.getElementById("recoveryPassword").value;
  const confirmation = document.getElementById("recoveryPasswordConfirm").value;

  if (!/^[0-9]{6}$/.test(token)) {
    showRecoveryMessage("Enter the complete six-digit code from the recovery email.");
    return;
  }
  if (!passwordMeetsRequirements(newPassword)) {
    showRecoveryMessage("Password must have at least 8 characters, including uppercase, lowercase, number, and symbol.");
    return;
  }
  if (newPassword !== confirmation) {
    showRecoveryMessage("The new passwords do not match.");
    return;
  }

  verifyRecoveryCodeButton.disabled = true;
  verifyRecoveryCodeButton.textContent = "Verifying code...";
  try {
    const { data, error: verificationError } = await supabase.auth.verifyOtp({
      email: recoveryEmail,
      token,
      type: "recovery",
    });
    if (verificationError || !data.user) throw verificationError || new Error("Recovery verification failed.");

    const { data: profile, error: profileError } = await loadUserProfile(data.user.id);
    if (profileError || profile?.role !== "operator") {
      await supabase.auth.signOut({ scope: "local" });
      showRecoveryMessage("This recovery form is only for registered Operator accounts.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw updateError;
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("role");
    localStorage.removeItem("userId");

    recoveryVerifyForm.reset();
    recoveryVerifyForm.hidden = true;
    showRecoveryMessage("Password changed successfully. Return to sign in with your new password.", "success");
  } catch (error) {
    console.error("Operator recovery failed:", error);
    showRecoveryMessage("The code is invalid or expired. Request a new code and try again.");
  } finally {
    verifyRecoveryCodeButton.disabled = false;
    verifyRecoveryCodeButton.innerHTML = '<i class="ri-shield-check-line"></i> Verify and Change Password';
  }
});

// Resolve the user's role and route them to the correct portal.
async function routeUser(user, suppliedFranchiseNumber = "") {
  // 1) Try to load the role from the profiles table.
  let role = null;
  const { data: profile, error: profileError } = await loadUserProfile(user.id);

  if (!profileError && profile && destinationForRole(profile.role) !== "login.html") {
    role = profile.role;
  }

  if (!role) {
    await supabase.auth.signOut();
    showLoginWarning("This account has no authorized TFRO role. Only Operators, Administrators, and TFRO Staff can sign in.");
    return false;
  }

  if (role === "operator") {
    const franchiseNumber = suppliedFranchiseNumber.trim().toUpperCase();
    if (!franchiseNumber) {
      await supabase.auth.signOut({ scope: "local" });
      showLoginWarning("Login failed: Enter your Operator Franchise Number.");
      return false;
    }

    const { data: operator, error: operatorError } = await supabase
      .from("operators")
      .select("franchise_number")
      .eq("user_id", user.id)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (operatorError || !operator || String(operator.franchise_number || "").trim().toUpperCase() !== franchiseNumber) {
      await supabase.auth.signOut({ scope: "local" });
      showLoginWarning("Login failed: The franchise number does not match this Operator account.");
      return false;
    }
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

  if (["operator", "traffic_enforcer"].includes(role) && !profile?.profile_picture_path) {
    window.location.replace("profilephoto.html");
  } else {
    window.location.replace(destinationForRole(role));
  }
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
  if (refreshLockout()) return;
  loginMessage.hidden = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const franchiseNumber = document.getElementById("franchiseNumber").value;

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
    if (isInvalidCredentialError(requestError)) {
      const remaining = recordInvalidPassword();
      if (remaining > 0) showLoginWarning(`Login failed: Incorrect email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
    } else {
      showLoginWarning(friendlyLoginError(requestError));
    }
    if (refreshLockout()) return;
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="ri-login-box-line"></i> Sign In';
    return;
  }

  if (authError || !authData.user) {
    console.error("Supabase sign-in error:", authError);
    if (isInvalidCredentialError(authError)) {
      const remaining = recordInvalidPassword();
      if (remaining > 0) {
        showLoginWarning(`Login failed: Incorrect email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
      }
    } else {
      showLoginWarning(friendlyLoginError(authError));
    }
    if (refreshLockout()) return;
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="ri-login-box-line"></i> Sign In';
    return;
  }

  clearAttemptState();
  const success = await routeUser(authData.user, franchiseNumber);
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
      const profileResult = await loadUserProfile(session.user.id);
      if (profileResult.data?.role !== "operator") await routeUser(session.user);
    }
  } catch (error) {
    console.error("Could not restore the existing session:", error);
  }
})();

void loadPasswordSecuritySettings();
