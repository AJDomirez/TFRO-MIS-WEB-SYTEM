const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const notifications = [

  {
    title: "Franchise Expiring Soon",
    message: "FR-2024-0451 — Ernesto Bautista expires in 3 days.",
    time: "Just now",
    type: "urgent",
    read: false
  },

  {
    title: "Franchise Expiring Soon",
    message: "FR-2024-0388 — Mario Villanueva expires in 7 days.",
    time: "1 hour ago",
    type: "urgent",
    read: false
  },

  {
    title: "Pending Application",
    message: "New franchise application FR-2024-0892 from Roberto Dela Cruz awaits review.",
    time: "2 hours ago",
    type: "info",
    read: false
  },

  {
    title: "Unpaid Penalty",
    message: "Eduardo Reyes has an unpaid penalty of ₱300.",
    time: "3 hours ago",
    type: "warning",
    read: true
  },

  {
    title: "Franchise Expired",
    message: "FR-2023-0447 — Luis Magno has officially expired.",
    time: "Yesterday",
    type: "error",
    read: true
  }

];

const container =
document.getElementById("notificationContainer");

const unreadCount =
document.getElementById("unreadCount");

const totalCount =
document.getElementById("totalCount");

function renderNotifications(){

  container.innerHTML = "";

  let unread = 0;

  notifications.forEach((n,index) => {

    if(!n.read){
      unread++;
    }

    const card =
    document.createElement("div");

    card.className =
    `notification-card ${n.read ? "" : "unread"}`;

    card.innerHTML = `
    
      <div class="notification-icon ${n.type}">
        <i class="ri-notification-3-line"></i>
      </div>

      <div class="notification-content">

        <div class="notification-top">
          <div class="notification-title">
            ${n.title}
          </div>

          <div class="notification-time">
            ${n.time}
          </div>
        </div>

        <div class="notification-message">
          ${n.message}
        </div>

      </div>

      <button class="close-btn"
      onclick="removeNotification(${index})">
        <i class="ri-close-line"></i>
      </button>

    `;

    container.appendChild(card);

  });

  unreadCount.textContent = unread;
  totalCount.textContent = notifications.length;

}

function removeNotification(index){

  notifications.splice(index,1);

  renderNotifications();

}

function markAllRead(){

  notifications.forEach((n) => {
    n.read = true;
  });

  renderNotifications();

}

renderNotifications();