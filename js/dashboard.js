const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

/* APPLICATIONS CHART */

const applicationsChart =
document.getElementById("applicationsChart");

new Chart(applicationsChart, {

  type: "bar",

  data: {
    labels: ["Jan","Feb","Mar","Apr","May","Jun"],

    datasets: [
      {
        label: "Applications",
        data: [30,45,50,40,60,75],
        backgroundColor: "#1d4ed8"
      },

      {
        label: "Renewals",
        data: [20,30,35,25,40,55],
        backgroundColor: "#60a5fa"
      }
    ]
  }

});

/* VIOLATIONS CHART */

const violationsChart =
document.getElementById("violationsChart");

new Chart(violationsChart, {

  type: "pie",

  data: {
    labels: [
      "No Franchise",
      "Overloading",
      "No License",
      "Colorum"
    ],

    datasets: [
      {
        data: [12,19,7,10],

        backgroundColor: [
          "#1d4ed8",
          "#16a34a",
          "#f59e0b",
          "#dc2626"
        ]
      }
    ]
  }

});