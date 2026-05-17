

document.getElementById("loginForm")
.addEventListener("submit", function(e){

  e.preventDefault();

  const email =
    document.getElementById("email").value;

  const password =
    document.getElementById("password").value;

  // ADMIN
  if(email === "admin@tfro.gov.ph" &&
     password === "admin123"){

      // SAVE ROLE
      localStorage.setItem("role", "admin");

      alert("Admin Login Success");

      window.location.href = "dashboard.html";
  }

  // STAFF
  else if(email === "staff@tfro.gov.ph" &&
          password === "staff123"){

      // SAVE ROLE
      localStorage.setItem("role", "staff");

      alert("Staff Login Success");

      window.location.href = "dashboard.html";
  }

  // OPERATOR
  else if(email === "operator@tfro.gov.ph" &&
          password === "oper123"){

      // SAVE ROLE
      localStorage.setItem("role", "operator");

      alert("Operator Login Success");

      window.location.href = "operatorportal.html";
  }

  // DRIVER
  else if(email === "driver@tfro.gov.ph" &&
          password === "driver123"){

      // SAVE ROLE
      localStorage.setItem("role", "driver");

      alert("Driver Login Success");

      window.location.href = "driverportal.html";
  }

  else{
    alert("Invalid Email or Password");
  }

});