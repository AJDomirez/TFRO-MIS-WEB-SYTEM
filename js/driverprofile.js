/* SAVE PROFILE */

const profileForm =
document.getElementById("profileForm");

profileForm.addEventListener("submit", (e) => {

  e.preventDefault();

  alert("Profile updated successfully!");

});

/* LOGOUT */

const logoutBtn =
document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", () => {

  localStorage.removeItem("role");

  window.location.href = "index.html";

});