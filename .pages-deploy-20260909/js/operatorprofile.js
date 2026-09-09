import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

/* ROLE PROTECTION — server-verified, not localStorage */
let currentUserId = null;
let currentUserRole = "operator";
requireRole(["operator"]).then(({ user, profile }) => {
  if (!user) return;
  currentUserId = user.id;
  if (profile?.role) currentUserRole = profile.role;
  loadProfile();
});

/* HELPERS */
function initials(name = "") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0].toUpperCase())
      .slice(0, 2)
      .join("") || "U"
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

/* TABS */
const tabs = document.querySelectorAll(".tab[data-tab]");
const profileForm = document.getElementById("profileForm");
const passwordForm = document.getElementById("passwordForm");

function showProfileWarning(targetId, message) {
  const element = document.getElementById(targetId);
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
}

function switchTab(name) {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  if (profileForm) profileForm.classList.toggle("hidden", name !== "profile");
  if (passwordForm) passwordForm.classList.toggle("hidden", name !== "password");
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

/* LOAD PROFILE */
async function loadProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    window.location.href = "index.html";
    return;
  }
  currentUserId = user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: operator } = await supabase
    .from("operators")
    .select("address, franchise_number")
    .eq("user_id", user.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const contact = profile?.contact_number || user.user_metadata?.contact_number || "";
  const email = user.email || "";

  const names = fullName.split(" ").filter(Boolean);
  setValue("firstName", names[0] || "");
  setValue("lastName", names.slice(1).join(" ") || "");
  setValue("email", email);
  setValue("contactNumber", contact);
  setValue("address", operator?.address || "");
  setValue("franchiseNumber", operator?.franchise_number || "");
  setValue("role", "Operator");

  /* Display headers */
  const init = initials(fullName);
  setText("userName", fullName || "Operator");
  setText("profileName", fullName || "Operator");
  setText("profileEmail", email);
  setText("userAvatar", init);
  setText("profileAvatar", init);
}

/* SAVE PROFILE */
if (profileForm) {
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    document.getElementById("profileMessage").hidden = true;

    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const contactNumber = document.getElementById("contactNumber").value.trim();
    const address = document.getElementById("address").value.trim();
    const fullName = `${firstName} ${lastName}`.trim();

    if (!fullName) {
      showProfileWarning("profileMessage", "Please enter your full name.");
      return;
    }

    if (!address) {
      showProfileWarning("profileMessage", "Please enter your home address.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, contact_number: contactNumber })
      .eq("id", currentUserId);

    if (error) {
      console.error("Profile update error:", error);
      showProfileWarning("profileMessage", "Failed to save profile: " + error.message);
      return;
    }

    const { error: operatorError } = await supabase
      .from("operators")
      .update({ full_name: fullName, contact_number: contactNumber, address })
      .eq("user_id", currentUserId);

    if (operatorError) {
      console.error("Operator record update error:", operatorError);
      showProfileWarning("profileMessage", "Profile was updated, but the Operator record could not be synchronized: " + operatorError.message);
      return;
    }

    alert("Profile updated successfully!");
    loadProfile();
  });
}

/* CHANGE PASSWORD */
if (passwordForm) {
  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    document.getElementById("passwordMessage").hidden = true;

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (newPassword.length < 6) {
      showProfileWarning("passwordMessage", "New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showProfileWarning("passwordMessage", "New passwords do not match. Please try again.");
      return;
    }

    const submitBtn = passwordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";

    // 1) Re-authenticate with the current password to confirm identity.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      showProfileWarning("passwordMessage", "Session expired. Please sign in again.");
      window.location.href = "index.html";
      return;
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reauthError) {
      showProfileWarning("passwordMessage", "Current password is incorrect.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Password";
      return;
    }

    // 2) Update to the new password.
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      showProfileWarning("passwordMessage", "Failed to update password: " + updateError.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Password";
      return;
    }

    // 3) Sign out and redirect to login so the user signs in with the new password.
    await supabase.auth.signOut();
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    alert("Password updated successfully! Please sign in again with your new password.");
    window.location.href = "index.html";
  });
}

/* LOGOUT */
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    window.location.href = "index.html";
  });
}
