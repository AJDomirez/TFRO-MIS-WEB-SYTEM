
document.addEventListener("DOMContentLoaded", () => {

  /* SIDEBAR TOGGLE */

  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleBtn");

  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  /* USER ROLE */

  const userRole = "admin";
  // change to:
  // "staff"
  // "operator"
  // "driver"

  /* MENU ITEMS */

  const paymentMenu = document.getElementById("paymentMenu");
  const reportMenu = document.getElementById("reportMenu");
  const violationMenu = document.getElementById("violationMenu");

  /* ROLE ACCESS */

  if(userRole === "admin"){
    if(paymentMenu){
      paymentMenu.style.display = "none";
    }
  }

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

logoutBtn.addEventListener("click", () => {

  localStorage.removeItem("role");

  window.location.href = "index.html";

});

});
