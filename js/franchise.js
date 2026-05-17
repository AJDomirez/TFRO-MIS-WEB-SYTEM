const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const franchises = [

  {
    number: "FR-2024-0891",
    operator: "Antonio Cruz",
    route: "Route 3 — Cotta to Market",
    applied: "2024-01-15",
    expiry: "2025-01-15",
    status: "approved"
  },

  {
    number: "FR-2024-0892",
    operator: "Roberto Dela Cruz",
    route: "Route 5 — Dalahican",
    applied: "2024-05-10",
    expiry: "—",
    status: "pending"
  },

  {
    number: "FR-2024-0700",
    operator: "Fernando Santos",
    route: "Route 4 — Gulang-gulang",
    applied: "2024-05-01",
    expiry: "—",
    status: "rejected"
  }

];

/* TABLE */

const table =
document.getElementById("franchiseTable");

/* LOAD TABLE */

function loadTable(data) {

  table.innerHTML = "";

  data.forEach(f => {

    table.innerHTML += `

      <tr>

        <td>${f.number}</td>

        <td>${f.operator}</td>

        <td>${f.route}</td>

        <td>${f.applied}</td>

        <td>${f.expiry}</td>

        <td>
          <span class="status ${f.status}">
            ${f.status}
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

            ${
              f.status === "pending"
              ?
              `
              <button title="Approve">
                <i class="ri-checkbox-circle-line"></i>
              </button>

              <button title="Reject">
                <i class="ri-close-circle-line"></i>
              </button>
              `
              :
              ""
            }

          </div>

        </td>

      </tr>

    `;

  });

}

/* INITIAL LOAD */

loadTable(franchises);

/* SEARCH */

document
.getElementById("searchInput")
.addEventListener("keyup", function () {

  const value =
  this.value.toLowerCase();

  const filtered =
  franchises.filter(f =>

    f.number.toLowerCase().includes(value) ||
    f.operator.toLowerCase().includes(value) ||
    f.route.toLowerCase().includes(value)

  );

  loadTable(filtered);

});

/* FILTER */

document
.getElementById("statusFilter")
.addEventListener("change", function () {

  const status = this.value;

  if(status === "all") {

    loadTable(franchises);

  } else {

    const filtered =
    franchises.filter(
      f => f.status === status
    );

    loadTable(filtered);

  }

});

/* NAVIGATION */

function goToNewForm() {

  window.location.href =
  "new-franchise.html";

}

