/* ROLE PROTECTION */

const role =
localStorage.getItem("role");

if(role !== "driver"){

  alert("Access Denied");

  window.location.href =
  "index.html";

}

/* DATE */

const today =
new Date();

document.getElementById("dateToday")
.textContent =
today.toDateString();

/* VIOLATIONS */

const violations = [

  {
    violation: "Route Deviation",
    date: "2024-04-15",
    penalty: "₱500",
    status: "Paid"
  }

];

/* TABLE */

const violationTable =
document.getElementById("violationTable");

function loadViolations(){

  violationTable.innerHTML = "";

  violations.forEach(v => {

    violationTable.innerHTML += `

      <tr>

        <td>${v.violation}</td>

        <td>${v.date}</td>

        <td>${v.penalty}</td>

        <td>
          <span class="badge">
            ${v.status}
          </span>
        </td>

      </tr>

    `;

  });

}

loadViolations();

/* LOGOUT */

const logoutBtn =
document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", () => {

  localStorage.removeItem("role");

  window.location.href =
  "index.html";

});

