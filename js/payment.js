const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const payments = [

  {
    receipt:"OR-2024-0441",
    payer:"Antonio Cruz",
    type:"renewal",
    amount:3500,
    date:"2024-01-15",
    status:"paid"
  },

  {
    receipt:"OR-2024-0442",
    payer:"Pedro Gomez",
    type:"renewal",
    amount:3500,
    date:"2024-01-22",
    status:"paid"
  },

  {
    receipt:"OR-2024-0443",
    payer:"Ricardo Lim",
    type:"penalty",
    amount:500,
    date:"2024-04-16",
    status:"paid"
  },

  {
    receipt:"OR-2024-0444",
    payer:"Roberto Dela Cruz",
    type:"application",
    amount:3500,
    date:"2024-05-10",
    status:"pending"
  },

  {
    receipt:"OR-2024-0448",
    payer:"Fernando Santos",
    type:"application",
    amount:3500,
    date:"2024-05-01",
    status:"overdue"
  }

];

const table =
document.getElementById("paymentsTable");

function loadTable(data){

  table.innerHTML = "";

  data.forEach(p => {

    table.innerHTML += `
      <tr>

        <td>${p.receipt}</td>

        <td>${p.payer}</td>

        <td>
          <span class="type ${p.type}">
            ${p.type}
          </span>
        </td>

        <td>₱${p.amount.toLocaleString()}</td>

        <td>${p.date}</td>

        <td>
          <span class="status ${p.status}">
            ${p.status}
          </span>
        </td>

        <td>

          <div class="actions">

            <button title="Receipt">
              <i class="ri-receipt-line"></i>
            </button>

            <button title="Print">
              <i class="ri-printer-line"></i>
            </button>

          </div>

        </td>

      </tr>
    `;
  });

}

loadTable(payments);

/* SEARCH */

document
.getElementById("searchInput")
.addEventListener("keyup", function(){

  const value =
  this.value.toLowerCase();

  const filtered =
  payments.filter(p =>

    p.payer.toLowerCase().includes(value) ||
    p.receipt.toLowerCase().includes(value)

  );

  loadTable(filtered);

});

/* FILTER */

document
.getElementById("statusFilter")
.addEventListener("change", function(){

  const status = this.value;

  if(status === "all"){

    loadTable(payments);

  }

  else{

    const filtered =
    payments.filter(
      p => p.status === status
    );

    loadTable(filtered);

  }

});

/* TOTALS */

const totalCollected =
payments
.filter(p => p.status === "paid")
.reduce((sum,p) => sum + p.amount,0);

document.getElementById(
  "totalCollected"
).innerText =
"₱" + totalCollected.toLocaleString();

document.getElementById(
  "pendingCount"
).innerText =
payments.filter(
  p => p.status === "pending"
).length;

document.getElementById(
  "overdueCount"
).innerText =
payments.filter(
  p => p.status === "overdue"
).length;

