import { supabase } from "./supabase.js";
import { destinationForRole, loadUserProfile } from "./auth-guard.js";

/* PASSWORD VISIBILITY TOGGLE (shared for both password fields) */
document.querySelectorAll(".toggle-pass").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.querySelector("i").className = isPassword ? "ri-eye-off-line" : "ri-eye-line";
  });
});

const registerForm = document.getElementById("registerForm");
const submitButton = document.getElementById("registerBtn");
const defaultButtonHtml = '<i class="ri-user-add-line"></i> Create Account';
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordMatchStatus = document.getElementById("passwordMatchStatus");
const registerMessage = document.getElementById("registerMessage");
const roleInputs = [...document.querySelectorAll('input[name="role"]')];
const operatorFields = [...document.querySelectorAll("[data-operator-field]")];
const enforcerFields = [...document.querySelectorAll("[data-enforcer-field]")];
const franchiseNumberInput = document.getElementById("franchiseNumber");
const enforcerIdInput = document.getElementById("enforcerId");
const profilePictureInput = document.getElementById("profilePicture");
let profilePreviewUrl = "";

profilePictureInput.addEventListener("change", () => {
  const file = profilePictureInput.files[0];
  const preview = document.getElementById("signupProfilePreview");
  const placeholder = document.getElementById("profilePhotoPlaceholder");
  const filename = document.getElementById("profilePhotoFileName");
  if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
  profilePreviewUrl = "";
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    placeholder.hidden = false;
    filename.textContent = "No photo selected";
    document.getElementById("profilePhotoButtonText").textContent = "Choose Photo";
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    profilePictureInput.value = "";
    showRegisterWarning("Choose a JPG, PNG, or WebP formal photo no larger than 5 MB.");
    filename.textContent = "Invalid photo";
    return;
  }
  profilePreviewUrl = URL.createObjectURL(file);
  preview.src = profilePreviewUrl;
  preview.hidden = false;
  placeholder.hidden = true;
  filename.textContent = file.name;
  document.getElementById("profilePhotoButtonText").textContent = "Change Photo";
});

function selectedRole() {
  return roleInputs.find((input) => input.checked)?.value || "operator";
}

function updateRoleFields() {
  const isEnforcer = selectedRole() === "traffic_enforcer";
  operatorFields.forEach((field) => { field.hidden = isEnforcer; });
  enforcerFields.forEach((field) => { field.hidden = !isEnforcer; });
  franchiseNumberInput.required = !isEnforcer;
  enforcerIdInput.required = isEnforcer;
}

roleInputs.forEach((input) => input.addEventListener("change", updateRoleFields));
updateRoleFields();

function showRegisterWarning(message) {
  registerMessage.textContent = message;
  registerMessage.hidden = false;
  registerMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Keep the browser checks aligned with the password rules shown in the form.
const passwordRules = Object.freeze({
  length: (value) => value.length >= 8,
  lowercase: (value) => /[a-z]/.test(value),
  uppercase: (value) => /[A-Z]/.test(value),
  number: (value) => /[0-9]/.test(value),
  symbol: (value) => /[^A-Za-z0-9\s]/.test(value),
});

function passwordMeetsRequirements(value) {
  return Object.values(passwordRules).every((testRule) => testRule(value));
}

function updatePasswordChecklist() {
  const value = passwordInput.value;

  document.querySelectorAll("[data-password-rule]").forEach((item) => {
    const ruleName = item.dataset.passwordRule;
    const isMet = passwordRules[ruleName]?.(value) ?? false;
    const icon = item.querySelector("i");

    item.classList.toggle("met", isMet);
    icon.className = isMet ? "ri-checkbox-circle-fill" : "ri-close-circle-line";
  });
}

function updatePasswordMatchStatus() {
  const confirmation = confirmPasswordInput.value;

  passwordMatchStatus.classList.remove("match", "no-match");
  if (!confirmation) {
    passwordMatchStatus.textContent = "";
    return;
  }

  const passwordsMatch = passwordInput.value === confirmation;
  passwordMatchStatus.textContent = passwordsMatch
    ? "Passwords match."
    : "Passwords do not match.";
  passwordMatchStatus.classList.add(passwordsMatch ? "match" : "no-match");
}

passwordInput.addEventListener("input", () => {
  updatePasswordChecklist();
  updatePasswordMatchStatus();
});
confirmPasswordInput.addEventListener("input", updatePasswordMatchStatus);
updatePasswordChecklist();

/**
 * Extract a meaningful message from a Supabase Auth error.
 *
 * The supabase-js client often wraps the server response in an error with
 * `.message` = "{}" (uppercase-literal). The real problem (e.g. "Error sending
 * confirmation email") is inside the JSON body that came back from the Auth
 * endpoint. We look up the original fetch response from the internal retry
 * chain so the user sees a clear, actionable message instead of "{}".
 */
function extractAuthErrorMessage(error) {
  // 1) Standard message field.
  if (typeof error?.message === "string" && error.message && error.message !== "{}") {
    return error.message;
  }
  if (typeof error?.error_description === "string" && error.error_description) {
    return error.error_description;
  }

  // 2) supabase-js stores the failed fetch attempts on `data`/`data.response`
  //    or in a `__isAuthError` internal shape. Walk known paths.
  const candidates = [
    error?.data,
    error?.data?.response,
    error?.data?.body,
    error?.__body,
    error?.body,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed?.msg) return parsed.msg;
        if (parsed?.message) return parsed.message;
      } catch {
        if (candidate && candidate !== "{}") return candidate;
      }
    } else if (typeof candidate === "object") {
      if (candidate.msg) return candidate.msg;
      if (candidate.message) return candidate.message;
      if (candidate.error_description) return candidate.error_description;
    }
  }

  // 3) Known Supabase / GoTrue error code mapping to a friendly message.
  const status = Number(error?.status);
  const known = {
    400: "The server rejected the request. Please check your details and try again.",
    401: "You are not authorized to perform this action.",
    422: "The email address is already registered or the password is too weak.",
    429: "Too many attempts. Please wait a few minutes and try again.",
    500: "Supabase reached Gmail, but Gmail rejected the saved SMTP login (535). Open Supabase Authentication > Emails > SMTP Settings and replace the password with a 16-character Google App Password. A Supabase Pro plan is not required.",
  };
  if (known[status]) return known[status];

  return null;
}

function showRegistrationError(error) {
  // Log the full error to the console for developers.
  try {
    console.error("Registration error details:", error);
    // Try to print the nested fetch response body if available.
    const flatten = {};
    for (const key of Object.getOwnPropertyNames(error || {})) {
      const value = error[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        flatten[key] = value;
      }
    }
    console.error("Registration error (serialized):", flatten);
  } catch {
    console.error("Registration error (unserializable):", error);
  }

  const message = extractAuthErrorMessage(error);

  if (message) {
    // A real, meaningful error from Supabase Auth.
    showRegisterWarning(`Registration failed: ${message}`);
    return;
  }

  // Fallback: guide the user to the current Auth dependency without exposing
  // provider credentials or internal server details.
  showRegisterWarning(
    "Registration could not be completed. Ask the administrator to check " +
    "Supabase Authentication email delivery and Custom SMTP settings."
  );
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerMessage.hidden = true;

  // Enforcer authority is assigned only after the database trigger matches the
  // submitted ID to the Administrator-managed roster.
  const role = selectedRole();
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const contactNumber = document.getElementById("contactNumber").value.trim();
  const address = document.getElementById("address").value.trim();
  const franchiseNumber = document.getElementById("franchiseNumber").value.trim().toUpperCase();
  const enforcerId = enforcerIdInput.value.trim().toUpperCase();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const profilePicture = document.getElementById("profilePicture").files[0];

  /* VALIDATION */
  if (!fullName || !email || !contactNumber || !address
      || (role === "operator" && !franchiseNumber)
      || (role === "traffic_enforcer" && !enforcerId) || !profilePicture) {
    showRegisterWarning("Please fill in all the required fields.");
    return;
  }

  if (!passwordMeetsRequirements(password)) {
    showRegisterWarning(
      "Password must be at least 8 characters and include an uppercase letter, " +
      "a lowercase letter, a number, and a symbol."
    );
    passwordInput.focus();
    return;
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(profilePicture.type) || profilePicture.size > 5 * 1024 * 1024) {
    showRegisterWarning("Upload a formal JPG, PNG, or WebP profile picture no larger than 5 MB.");
    return;
  }

  if (password !== confirmPassword) {
    showRegisterWarning("Passwords do not match. Please try again.");
    confirmPasswordInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Creating account...';

  let data;
  let error;
  try {
    ({ data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // This exact URL must be included in Supabase Authentication >
        // URL Configuration > Redirect URLs.
        emailRedirectTo: new URL("./login.html", window.location.href).href,
        data: {
          role,
          full_name: fullName,
          contact_number: contactNumber,
          address,
          franchise_number: role === "operator" ? franchiseNumber : null,
          enforcer_id: role === "traffic_enforcer" ? enforcerId : null,
        },
      },
    }));
  } catch (requestError) {
    showRegistrationError(requestError);
    submitButton.disabled = false;
    submitButton.innerHTML = defaultButtonHtml;
    return;
  }

  if (error) {
    showRegistrationError(error);
    submitButton.disabled = false;
    submitButton.innerHTML = defaultButtonHtml;
    return;
  }

  if (!data?.user) {
    showRegisterWarning("Something went wrong. Please try again.");
    submitButton.disabled = false;
    submitButton.innerHTML = defaultButtonHtml;
    return;
  }

  // The database auth trigger creates the profile from the sign-up metadata.
  // Do not write profiles directly from the browser: role assignment is
  // deliberately server-controlled.

  if (!data.session) {
    alert(
      "Account created! Please check your email to confirm your account before signing in."
    );
    window.location.href = "login.html";
    return;
  }

  const { data: profile, error: profileError } = await loadUserProfile(data.user.id);
  if (profileError || !profile) {
    await supabase.auth.signOut({ scope: "local" });
    showRegisterWarning("Account created, but its TFRO profile could not be loaded. Please sign in again.");
    window.location.replace("login.html");
    return;
  }

  const extension = profilePicture.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const picturePath = `${data.user.id}/formal-profile-${Date.now()}.${extension}`;
  const uploadResult = await supabase.storage.from("account-profile-pictures").upload(picturePath, profilePicture, { contentType: profilePicture.type, upsert: false });
  if (uploadResult.error) {
    await supabase.auth.signOut({ scope: "local" });
    showRegisterWarning("Account created, but the required formal profile picture could not be saved. Please sign in and contact the Administrator.");
    return;
  }
  const pictureUpdate = await supabase.from("profiles").update({ profile_picture_path: picturePath }).eq("id", data.user.id);
  if (pictureUpdate.error) {
    await supabase.storage.from("account-profile-pictures").remove([picturePath]);
    await supabase.auth.signOut({ scope: "local" });
    showRegisterWarning("Account created, but its formal profile picture could not be linked. Please contact the Administrator.");
    return;
  }

  alert("Account created successfully!");
  window.location.replace(destinationForRole(profile.role));
});
