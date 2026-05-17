const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const operators = [

  {
    name:"Antonio Cruz",
    address:"123 Rizal Ave, Lucena City",
    contact:"0917-123-4567",
    franchise:"FR-2024-0891",
    status:"active"
  },

  {
    name:"Mario Villanueva",
    address:"45 Burgos St, Lucena City",
    contact:"0918-234-5678",
    franchise:"FR-2024-0388",
    status:"active"
  },

  {
    name:"Luis Magno",
    address:"12 Mabini St, Lucena City",
    contact:"0920-456-7890",
    franchise:"FR-2023-0447",
    status:"inactive"
  },

  {
    name:"Fernando Santos",
    address:"67 Jacinto St, Lucena City",
    contact:"0924-890-1234",
    franchise:"FR-2024-0700",
    status:"suspended"
  }

];

const table =
document.getElementById("operatorsTable");

function loadTable(data){

  table.innerHTML = "";

  data.forEach(op => {

    table.innerHTML += `
      <tr>

        <td>${op.name}</td>

        <td>${op.address}</td>

        <td>${op.contact}</td>

        <td>${op.franchise}</td>

        <td>
          <span class="status ${op.status}">
            ${op.status}
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

            <button title="Delete">
              <i class="ri-delete-bin-line"></i>
            </button>

          </div>

        </td>

      </tr>
    `;

  });

}

loadTable(operators);

/* COUNTS */

document.getElementById("totalOperators").innerText =
operators.length;

document.getElementById("activeOperators").innerText =
operators.filter(o => o.status === "active").length;

document.getElementById("inactiveOperators").innerText =
operators.filter(o => o.status === "inactive").length;

document.getElementById("suspendedOperators").innerText =
operators.filter(o => o.status === "suspended").length;

/* SEARCH */

document
.getElementById("searchInput")
.addEventListener("keyup", function(){

  const value =
  this.value.toLowerCase();

  const filtered =
  operators.filter(o =>

    o.name.toLowerCase().includes(value) ||
    o.franchise.toLowerCase().includes(value) ||
    o.address.toLowerCase().includes(value)

  );

  loadTable(filtered);

});

/* FILTER */

document
.getElementById("statusFilter")
.addEventListener("change", function(){

  const status = this.value;

  if(status === "all"){
    loadTable(operators);
  }

  else{

    const filtered =
    operators.filter(
      o => o.status === status
    );

    loadTable(filtered);

  }

});

