import { supabase } from "./supabase.js";

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

let currentUserId = null;
let currentUserRole = localStorage.getItem("role") || "";

/* HIDE PAYMENTS MENU FOR ADMIN (kept from original page) */
const paymentMenu = document.getElementById("paymentMenu");
if (paymentMenu && currentUserRole === "admin") {
  paymentMenu.style.display = "none";
}

/* ROLE LABEL */
function roleLabel(role) {
  const map = {
    admin: "Administrator",
    staff: "Staff",
    operator: "Operator",
    driver: "Driver",
  };
  return map[role] || role || "User";
}

/* AUDIT LOG HELPER */
async function logAudit(action, userName) {
  const lower = action.toLowerCase();
  const actionType = lower.includes("password") ? "update" : "update";
  try {
    await supabase.from("audit_logs").insert({
      user_name: userName || null,
      role: currentUserRole || null,
      action,
      action_type: actionType,
      ip_address: null,
    });
  } catch (err) {
    console.error("Audit log insert failed:", err);
  }
}

/* LOAD PROFILE */
async function loadProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    alert("Please sign in to continue.");
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
  const role = profile?.role || currentUserRole || "";
  currentUserRole = role;

  const names = fullName.split(" ").filter(Boolean);
  setValue("firstName", names[0] || "");
  setValue("lastName", names.slice(1).join(" ") || "");
  setValue("email", email);
  setValue("contactNumber", contact);
  setValue("role", roleLabel(role));

  const label = roleLabel(role);
  const init = initials(fullName);

  setText("userName", fullName || label);
  setText("userRole", label);
  setText("userAvatar", init);
  setText("profileAvatar", init);
  setText("profileName", fullName || label);
  setText("profileRole", label);
  setText("profileEmail", email);

  /* Hide Payments menu for admins (kept from original page) */
  if (paymentMenu && role === "admin") {
    paymentMenu.style.display = "none";
  }
}

/* TAB SWITCHING */
function showTab(tab) {
  const profileTab = document.getElementById("profileTab");
  const passwordTab = document.getElementById("passwordTab");
  const buttons = document.querySelectorAll(".tab-btn");

  buttons.forEach((btn) => btn.classList.remove("active"));

  if (tab === "profile") {
    profileTab.classList.add("active");
    passwordTab.classList.remove("active");
    buttons[0].classList.add("active");
  } else {
    passwordTab.classList.add("active");
    profileTab.classList.remove("active");
    buttons[1].classList.add("active");
  }
}
window.showTab = showTab;

/* SAVE PROFILE */
document.getElementById("profileForm").addEventListener("submit", async (e) => {
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

  await logAudit("Updated profile", fullName);
  alert("Profile updated successfully!");
  loadProfile();
});

/* CHANGE PASSWORD */
document.getElementById("passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword.length < 6) {
    alert("Password must be at least 6 characters.");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  const submitBtn = document.querySelector('#passwordForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Updating...";

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

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    alert("Failed to update password: " + updateError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Update Password";
    return;
  }

  await logAudit("Changed password", user.user_metadata?.full_name || "");
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  alert("Password updated successfully! Please sign in again.");
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

