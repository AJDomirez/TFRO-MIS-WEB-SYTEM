import { supabase } from "./supabase.js";

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

const destinations = {
  admin: "dashboard.html",
  staff: "dashboard.html",
  operator: "operatorportal.html",
  driver: "driverportal.html",
};

const loginForm = document.getElementById("loginForm");
const submitButton = loginForm.querySelector('button[type="submit"]');

// Resolve the user's role and route them to the correct portal.
async function routeUser(user) {
  // 1) Try to load the role from the profiles table.
  let role = null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profileError && profile && destinations[profile.role]) {
    role = profile.role;
  }

  // 2) Fallback: use the role captured in user metadata at signup time.
  //    This covers the case where the profiles table/trigger has not been set up.
  if (!role && user.user_metadata?.role && destinations[user.user_metadata.role]) {
    role = user.user_metadata.role;

    // Best-effort repair: write the missing profile row so future logins work.
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        role,
        full_name: user.user_metadata.full_name || null,
        contact_number: user.user_metadata.contact_number || null,
      },
      { onConflict: "id" }
    );
  }

  if (!role) {
    await supabase.auth.signOut();
    alert("This account has no TFRO role. Ask an administrator to assign one.");
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

  window.location.href = destinations[role];
  return true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    console.error("Supabase sign-in error:", authError);
    alert(`Login failed: ${authError?.message || "No user was returned."}`);
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
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await routeUser(session.user);
  }
})();
