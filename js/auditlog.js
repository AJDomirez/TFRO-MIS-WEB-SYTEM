const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const logs = [

  {
    user: "Maria Santos",
    role: "Admin",
    action: "Approved franchise FR-2024-0891",
    ip: "192.168.1.10",
    timestamp: "2024-05-16 08:02:31",
    type: "approval"
  },

  {
    user: "Jose Reyes",
    role: "Staff",
    action: "Recorded violation for Ricardo Lim",
    ip: "192.168.1.12",
    timestamp: "2024-05-16 07:48:15",
    type: "violation"
  },

  {
    user: "Jose Reyes",
    role: "Staff",
    action: "Recorded payment OR-2024-0443",
    ip: "192.168.1.12",
    timestamp: "2024-05-16 07:45:00",
    type: "payment"
  },

  {
    user: "Maria Santos",
    role: "Admin",
    action: "Rejected franchise FR-2024-0700",
    ip: "192.168.1.10",
    timestamp: "2024-05-15 14:11:05",
    type: "rejection"
  },

  {
    user: "Antonio Cruz",
    role: "Operator",
    action: "Logged in to system",
    ip: "192.168.1.25",
    timestamp: "2024-05-15 10:05:00",
    type: "login"
  }

];

const logTable =
document.getElementById("logTable");

const searchInput =
document.getElementById("searchInput");

function getIcon(type){

  switch(type){

    case "approval":
      return "ri-checkbox-circle-line";

    case "rejection":
      return "ri-close-circle-line";

    case "violation":
      return "ri-alert-line";

    case "payment":
      return "ri-money-dollar-circle-line";

    case "create":
      return "ri-user-add-line";

    case "update":
      return "ri-edit-line";

    case "login":
      return "ri-login-box-line";

    case "report":
      return "ri-file-chart-line";

    default:
      return "ri-settings-3-line";

  }

}

function renderLogs(data){

  logTable.innerHTML = "";

  data.forEach((log) => {

    logTable.innerHTML += `

      <tr>

        <td>${log.user}</td>

        <td>
          <span class="role-badge">
            ${log.role}
          </span>
        </td>

        <td>
          <div class="action">

            <i class="${getIcon(log.type)} ${log.type}"></i>

            <span>${log.action}</span>

          </div>
        </td>

        <td>${log.ip}</td>

        <td>${log.timestamp}</td>

      </tr>

    `;

  });

}



renderLogs(logs);

searchInput.addEventListener("keyup", () => {

  const value =
  searchInput.value.toLowerCase();

  const filtered =
  logs.filter((log) => {

    return (
      log.user.toLowerCase().includes(value) ||
      log.action.toLowerCase().includes(value)
    );

  });

  renderLogs(filtered);

});



