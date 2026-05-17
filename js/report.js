const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

  logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("role");

    window.location.href = "index.html";

  });

}

const reports = [

  {
    title:"Franchise Records Report",
    desc:"Summary of all franchise applications, renewals, approvals, and rejections.",
    icon:"ri-file-list-3-line",
    bg:"background:#dbeafe;",
    color:"color:#1d4ed8;"
  },

  {
    title:"Operator Registry Report",
    desc:"Complete list of registered operators with franchise and contact details.",
    icon:"ri-user-star-line",
    bg:"background:#ccfbf1;",
    color:"color:#0f766e;"
  },

  {
    title:"Driver Registry Report",
    desc:"Full driver listing with license information and compliance status.",
    icon:"ri-steering-2-line",
    bg:"background:#e0e7ff;",
    color:"color:#4338ca;"
  },

  {
    title:"Violations Report",
    desc:"Detailed list of recorded violations, penalties, and enforcement actions.",
    icon:"ri-alert-line",
    bg:"background:#ffedd5;",
    color:"color:#ea580c;"
  },

  {
    title:"Financial Transactions Report",
    desc:"Payment history, fee collections, receipts, and revenue summary.",
    icon:"ri-money-dollar-circle-line",
    bg:"background:#d1fae5;",
    color:"color:#047857;"
  },

  {
    title:"Monthly Summary Report",
    desc:"Monthly overview of all TFRO operations.",
    icon:"ri-bar-chart-box-line",
    bg:"background:#cffafe;",
    color:"color:#0891b2;"
  },

  {
    title:"Expiring Franchises Report",
    desc:"Franchises expiring within 30, 60, and 90 days.",
    icon:"ri-calendar-close-line",
    bg:"background:#fef3c7;",
    color:"color:#d97706;"
  },

  {
    title:"Audit Log Report",
    desc:"System activity and user actions for accountability.",
    icon:"ri-history-line",
    bg:"background:#f3f4f6;",
    color:"color:#374151;"
  }

];

const reportsGrid =
document.getElementById("reportsGrid");

reports.forEach(report => {

  reportsGrid.innerHTML += `

    <div class="report-card">

      <div class="icon-box"
        style="${report.bg}"
      >

        <i class="${report.icon}"
           style="${report.color}">
        </i>

      </div>

      <h3>${report.title}</h3>

      <p>${report.desc}</p>

      <div class="card-actions">

        <button class="download-btn">
          <i class="ri-download-line"></i>
          Download PDF
        </button>

        <button class="print-btn">
          <i class="ri-printer-line"></i>
          Print
        </button>

      </div>

    </div>

  `;

});

