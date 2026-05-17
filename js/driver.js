const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const drivers = [

  {
    name:"Ricardo Lim",
    license:"N01-23-456789",
    contact:"0917-111-2222",
    operator:"Antonio Cruz",
    compliance:"compliant",
    violations:1
  },

  {
    name:"Fernando Aquino",
    license:"N01-22-334455",
    contact:"0918-222-3333",
    operator:"Mario Villanueva",
    compliance:"compliant",
    violations:0
  },

  {
    name:"Eduardo Reyes",
    license:"N01-21-556677",
    contact:"0919-333-4444",
    operator:"Carmen Navarro",
    compliance:"non-compliant",
    violations:3
  }

];

const table =
document.getElementById("driversTable");

function loadTable(data){

  table.innerHTML = "";

  data.forEach(d => {

    let violationClass = "none";

    if(d.violations >= 3){
      violationClass = "high";
    }

    else if(d.violations > 0){
      violationClass = "low";
    }

    const initials =
    d.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0,2);

    table.innerHTML += `
      <tr>

        <td>

          <div class="driver-info">

            <div class="avatar">
              ${initials}
            </div>

            <span>${d.name}</span>

          </div>

        </td>

        <td class="license">
          ${d.license}
        </td>

        <td>
          ${d.operator}
        </td>

        <td>
          ${d.contact}
        </td>

        <td>

          <div class="violation-badge ${violationClass}">
            ${d.violations}
          </div>

        </td>

        <td>

          <span class="status ${d.compliance}">
            ${d.compliance}
          </span>

        </td>

        <td>

          <div class="actions">

            <button title="View">
              <i class="ri-eye-line"></i>
            </button>

            <button title="Edit">
              <i class="ri-edit-line"></i>
            </button>

          </div>

        </td>

      </tr>
    `;

  });

}

loadTable(drivers);

/* SEARCH */

document
.getElementById("searchInput")
.addEventListener("keyup", function(){

  const value =
  this.value.toLowerCase();

  const filtered =
  drivers.filter(d =>

    d.name.toLowerCase().includes(value) ||
    d.license.toLowerCase().includes(value) ||
    d.operator.toLowerCase().includes(value)

  );

  loadTable(filtered);

});

/* FILTER */

document
.getElementById("complianceFilter")
.addEventListener("change", function(){

  const compliance = this.value;

  if(compliance === "all"){
    loadTable(drivers);
  }

  else{

    const filtered =
    drivers.filter(
      d => d.compliance === compliance
    );

    loadTable(filtered);

  }

});

