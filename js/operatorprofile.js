import { supabase } from "./supabase.js";

/* ROLE PROTECTION */
const role = localStorage.getItem("role");
if (role !== "operator") {
  alert("Access Denied");
  window.location.href = "index.html";
}

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

let currentUserId = localStorage.getItem("userId") || null;

/* TABS */
const tabs = document.querySelectorAll(".tab[data-tab]");
const profileForm = document.getElementById("profileForm");
const passwordForm = document.getElementById("passwordForm");

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

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const contact = profile?.contact_number || user.user_metadata?.contact_number || "";
  const email = user.email || "";

  const names = fullName.split(" ").filter(Boolean);
  setValue("firstName", names[0] || "");
  setValue("lastName", names.slice(1).join(" ") || "");
  setValue("email", email);
  setValue("contactNumber", contact);
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
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const contactNumber = document.getElementById("contactNumber").value.trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (!fullName) {
    alert("Please enter your full name.");
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, contact_number: contactNumber })
    .eq("id", currentUserId);

  if (error) {
    console.error("Profile update error:", error);
    alert("Failed to save profile: " + error.message);
    return;
  }

  alert("Profile updated successfully!");
  loadProfile();
});

/* CHANGE PASSWORD */
passwordForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword.length < 6) {
    alert("New password must be at least 6 characters long.");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("New passwords do not match. Please try again.");
    return;
  }

  const submitBtn = passwordForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Updating...";

  // 1) Re-authenticate with the current password to confirm identity.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    alert("Session expired. Please sign in again.");
    window.location.href = "index.html";
    return;
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (reauthError) {
    alert("Current password is incorrect.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Update Password";
    return;
  }

  // 2) Update to the new password.
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    alert("Failed to update password: " + updateError.message);
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

/* LOGOUT */
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  window.location.href = "index.html";
});

loadProfile();

