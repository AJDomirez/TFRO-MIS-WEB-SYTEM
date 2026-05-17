const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

function showTab(tab){

  const profileTab =
    document.getElementById("profileTab");

  const passwordTab =
    document.getElementById("passwordTab");

  const buttons =
    document.querySelectorAll(".tab-btn");

  buttons.forEach(btn => {
    btn.classList.remove("active");
  });

  if(tab === "profile"){

    profileTab.classList.add("active");
    passwordTab.classList.remove("active");

    buttons[0].classList.add("active");

  }else{

    passwordTab.classList.add("active");
    profileTab.classList.remove("active");

    buttons[1].classList.add("active");
  }
}

/* PROFILE SAVE */

document.getElementById("profileForm")
.addEventListener("submit", function(e){

  e.preventDefault();

  alert("Profile Updated Successfully");

});

/* PASSWORD CHANGE */

document.getElementById("passwordForm")
.addEventListener("submit", function(e){

  e.preventDefault();

  const newPassword =
    document.getElementById("newPassword").value;

  const confirmPassword =
    document.getElementById("confirmPassword").value;

  if(newPassword !== confirmPassword){

    alert("Passwords do not match");
    return;
  }

  if(newPassword.length < 6){

    alert("Password must be at least 6 characters");
    return;
  }

  alert("Password Updated Successfully");

});

