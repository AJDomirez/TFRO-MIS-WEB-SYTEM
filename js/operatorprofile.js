/* LOGOUT */

const logoutBtn =
document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", () => {

  localStorage.removeItem("role");

  window.location.href = "index.html";

});