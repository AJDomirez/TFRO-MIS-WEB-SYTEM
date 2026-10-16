import { supabase } from "./supabase.js";
import { destinationForRole, loadUserProfile, signOutAndRedirect } from "./auth-guard.js";

const title = document.getElementById("statusTitle");
const message = document.getElementById("statusMessage");
const icon = document.getElementById("statusIcon");
const reference = document.getElementById("statusReference");
const checkButton = document.getElementById("checkAgainBtn");
let pollTimer = null;

function showPending(profile) {
  icon.innerHTML = '<i class="ri-time-line"></i>';
  if (profile.account_status === "pending_approval" && profile.role === "traffic_enforcer") {
    title.textContent = "Waiting for administrator approval";
    message.textContent = "Your email and Enforcer ID are linked. A TFRO administrator must approve this account before the Enforcer homepage opens.";
  } else if (profile.account_status === "pending_verification") {
    title.textContent = "Franchise record needs verification";
    message.textContent = "The full name and Franchise Number did not match one existing TFRO franchise record. Staff must verify or link the record before this account can be used.";
  } else if (profile.account_status === "rejected") {
    title.textContent = "Account approval was not granted";
    message.textContent = "Please contact the TFRO office to correct the submitted account details.";
  } else {
    title.textContent = "Account temporarily unavailable";
    message.textContent = "Please contact the TFRO office for account assistance.";
  }
  reference.hidden = false;
  reference.textContent = profile.role === "traffic_enforcer" ? "Unique account key: TFRO Enforcer ID" : "Unique account key: Franchise Number";
}

async function checkStatus() {
  checkButton.disabled = true;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      title.textContent = "Email confirmation required";
      message.textContent = "Open the confirmation link sent to your email, then sign in to continue.";
      icon.innerHTML = '<i class="ri-mail-check-line"></i>';
      reference.hidden = true;
      window.clearInterval(pollTimer);
      return;
    }
    const { data: profile, error: profileError } = await loadUserProfile(user.id);
    if (profileError || !profile) throw profileError || new Error("TFRO profile was not found.");
    if (!profile.account_status || profile.account_status === "active") {
      icon.innerHTML = '<i class="ri-checkbox-circle-line"></i>';
      title.textContent = "Account confirmed";
      message.textContent = "Your official TFRO record is linked. Opening your homepage now.";
      localStorage.setItem("role", profile.role);
      localStorage.setItem("userId", user.id);
      window.clearInterval(pollTimer);
      window.setTimeout(() => window.location.replace(destinationForRole(profile.role)), 600);
      return;
    }
    showPending(profile);
  } catch (error) {
    console.error("Account status check failed:", error);
    title.textContent = "Status could not be checked";
    message.textContent = "Please check your connection and try again.";
    icon.innerHTML = '<i class="ri-error-warning-line"></i>';
  } finally {
    checkButton.disabled = false;
  }
}

checkButton.addEventListener("click", checkStatus);
document.getElementById("signOutBtn").addEventListener("click", () => signOutAndRedirect("login.html"));
void checkStatus();
pollTimer = window.setInterval(checkStatus, 5000);
