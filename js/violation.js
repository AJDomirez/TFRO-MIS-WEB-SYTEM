const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const violations = [

  {
    subject:"Ricardo Lim",
    type:"driver",
    violation:"Route Deviation",
    penalty:500,
    status:"paid",
    date:"2024-04-15"
  },

  {
    subject:"Eduardo Reyes",
    type:"driver",
    violation:"No Helmet",
    penalty:300,
    status:"pending",
    date:"2024-04-18"
  },

  {
    subject:"Antonio Cruz",
    type:"operator",
    violation:"No Franchise",
    penalty:2000,
    status:"paid",
    date:"2024-03-22"
  },

  {
    subject:"Luis Magno",
    type:"operator",
    violation:"Overloading",
    penalty:800,
    status:"dismissed",
    date:"2024-02-10"
  }

];

const table =
document.getElementById("violationsTable");

function loadTable(data){

  table.innerHTML = "";

  data.forEach(v => {

    table.innerHTML += `
      <tr>

        <td>${v.subject}</td>

        <td>
          <span class="type ${v.type}">
            ${v.type}
          </span>
        </td>

        <td>${v.violation}</td>

        <td>₱${v.penalty}</td>

        <td>${v.date}</td>

        <td>
          <span class="status ${v.status}">
            ${v.status}
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

loadTable(violations);

/* SEARCH */

document
.getElementById("searchInput")
.addEventListener("keyup", function(){

  const value =
  this.value.toLowerCase();

  const filtered =
  violations.filter(v =>

    v.subject.toLowerCase().includes(value) ||
    v.violation.toLowerCase().includes(value)

  );

  loadTable(filtered);

});

/* FILTER */

document
.getElementById("statusFilter")
.addEventListener("change", function(){

  const status = this.value;

  if(status === "all"){

    loadTable(violations);

  }

  else{

    const filtered =
    violations.filter(
      v => v.status === status
    );

    loadTable(filtered);

  }

});

