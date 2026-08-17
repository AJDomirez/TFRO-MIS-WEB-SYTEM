import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const { user } = await requireRole(["admin", "staff"]);
  if (!user) return;

  /* SIDEBAR TOGGLE */

  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleBtn");

  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  /* USER ROLE */

  const userRole = localStorage.getItem("role") || "";

  /* MENU ITEMS */

  const paymentMenu = document.getElementById("paymentMenu");
  const reportMenu = document.getElementById("reportMenu");
  const violationMenu = document.getElementById("violationMenu");

  /* ROLE ACCESS */

  if(userRole === "operator"){
    if(paymentMenu){
      paymentMenu.style.display = "none";
    }

    if(reportMenu){
      reportMenu.style.display = "none";
    }
  }

  if(userRole === "driver"){
    if(paymentMenu){
      paymentMenu.style.display = "none";
    }

    if(reportMenu){
      reportMenu.style.display = "none";
    }

    if(violationMenu){
      violationMenu.style.display = "none";
    }
  }

  const logoutBtn =
document.getElementById("logoutBtn");

if (logoutBtn) logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  window.location.href = "index.html";
});

const notificationsBtn = document.getElementById("notificationsBtn");
if (notificationsBtn) {
  notificationsBtn.addEventListener("click", () => {
    window.location.href = "notification.html";
  });
}

});
