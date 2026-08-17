import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";

const currencyFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateFormatter = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" });

function escapeHtml(value) {
  var s = String(value ?? "");
  return s.replace(/[&<>'"]/g, function(c) {
    if (c === "\x26") return "\x26amp;";
    if (c === "\x3C") return "\x26lt;";
    if (c === "\x3E") return "\x26gt;";
    if (c === "\x27") return "\x26#039;";
    if (c === "\x22") return "\x26quot;";
    return c;
  });
}

async function verifyAccess() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return window.location.replace("index.html");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (!profile || !["admin", "staff"].includes(profile.role)) {
    await supabase.auth.signOut();
    return window.location.replace("index.html");
  }
  return session;
}

// Data Loaders

async function loadFranchises() {
  const { data, error } = await supabase.from("franchises").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadOperators() {
  const { data, error } = await supabase.from("operators").select("*").order("full_name");
  if (error) throw error;
  return data || [];
}

async function loadDrivers() {
  const { data, error } = await supabase.from("drivers").select("*").order("full_name");
  if (error) throw error;
  return data || [];
}

async function loadViolations() {
  const { data, error } = await supabase.from("violations").select("*").order("occurred_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadPayments() {
  const { data, error } = await supabase.from("payments").select("*").order("paid_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadAuditLog() {
  const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) {
    console.warn("audit_log table not available:", error.message);
    return [];
  }
  return data || [];
}

// PDF Generation

function generatePDF({ title, subtitle, headers, rows, filename }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.setTextColor(15, 45, 107);
  doc.text("TFRO - Lucena City", 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(title, 14, 28);
  if (subtitle) {
    doc.setFontSize(9);
    doc.text(subtitle, 14, 34);
  }

  doc.setDrawColor(219, 226, 234);
  doc.line(14, 38, 196, 38);

  doc.autoTable({
    startY: 42,
    head: [headers],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: [15, 45, 107],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { top: 42 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Generated on " + new Date().toLocaleString() + " | Page " + i + " of " + pageCount,
      14,
      286
    );
  }

  doc.save(filename);
}

// Report Builders

function buildFranchiseReport(data) {
  const headers = ["#", "Franchise No.", "Operator", "Route", "Type", "Status", "Date"];
  const rows = data.map(function(r, i) {
    return [
      String(i + 1), r.franchise_number, r.operator_name, r.route,
      r.application_type, r.status, r.application_date,
    ];
  });
  generatePDF({
    title: "Franchise Records Report",
    subtitle: "Total: " + data.length + " franchise(s)",
    headers: headers,
    rows: rows,
    filename: "TFRO_Franchise_Report_" + new Date().toISOString().slice(0, 10) + ".pdf",
  });
}

function buildOperatorReport(data) {
  const headers = ["#", "Full Name", "Address", "Contact", "Franchise #", "Status"];
  const rows = data.map(function(r, i) {
    return [
      String(i + 1), r.full_name, r.address, r.contact_number,
      r.franchise_number || "\u2014", r.status,
    ];
  });
  generatePDF({
    title: "Operator Registry Report",
    subtitle: "Total: " + data.length + " operator(s)",
    headers: headers,
    rows: rows,
    filename: "TFRO_Operator_Report_" + new Date().toISOString().slice(0, 10) + ".pdf",
  });
}

function buildDriverReport(data) {
  const headers = ["#", "Full Name", "License No.", "Operator", "Contact", "Violations", "Compliance"];
  const rows = data.map(function(r, i) {
    return [
      String(i + 1), r.full_name, r.license_number, r.operator_name,
      r.contact_number, String(r.violation_count), r.compliance,
    ];
  });
  generatePDF({
    title: "Driver Registry Report",
    subtitle: "Total: " + data.length + " driver(s)",
    headers: headers,
    rows: rows,
    filename: "TFRO_Driver_Report_" + new Date().toISOString().slice(0, 10) + ".pdf",
  });
}

function buildViolationsReport(data) {
  const headers = ["#", "Subject", "Type", "Violation", "Penalty", "Date", "Status"];
  const rows = data.map(function(r, i) {
    return [
      String(i + 1), r.subject_name || "\u2014", r.subject_type || "\u2014",
      r.violation_type, currencyFormatter.format(r.penalty || 0),
      new Date(r.occurred_at).toLocaleDateString(), r.status,
    ];
  });
  generatePDF({
    title: "Violations Report",
    subtitle: "Total: " + data.length + " violation(s)",
    headers: headers,
    rows: rows,
    filename: "TFRO_Violations_Report_" + new Date().toISOString().slice(0, 10) + ".pdf",
  });
}

function buildFinancialReport(data) {
  const total = data.reduce(function(sum, r) { return sum + Number(r.amount || 0); }, 0);
  const headers = ["#", "Amount", "Date"];
  const rows = data.map(function(r, i) {
    return [
      String(i + 1), currencyFormatter.format(r.amount || 0),
      new Date(r.paid_at).toLocaleDateString(),
    ];
  });
  generatePDF({
    title: "Financial Transactions Report",
    subtitle: "Total Payments: " + data.length + " | Total Collected: " + currencyFormatter.format(total),
    headers: headers,
    rows: rows,
    filename: "TFRO_Financial_Report_" + new Date().toISOString().slice(0, 10) + ".pdf",
  });
}

function buildMonthlySummaryReport(franchises, payments, violations) {
  const now = new Date();
  const monthName = now.toLocaleString("en", { month: "long", year: "numeric" });
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const monthlyFranchises = franchises.filter(function(r) { return r.application_date >= monthStart.slice(0, 10); });
  const monthlyPayments = payments.filter(function(r) { return r.paid_at >= monthStart; });
  const monthlyViolations = violations.filter(function(r) { return r.occurred_at >= monthStart; });
  const monthlyRevenue = monthlyPayments.reduce(function(sum, r) { return sum + Number(r.amount || 0); }, 0);

  const headers = ["Metric", "Count"];
  const rows = [
    ["New Franchise Applications", String(monthlyFranchises.length)],
    ["Payments Received", String(monthlyPayments.length)],
    ["Monthly Revenue", currencyFormatter.format(monthlyRevenue)],
    ["Violations Recorded", String(monthlyViolations.length)],
    ["Total Active Franchises", String(franchises.filter(function(r) { return r.status === "active"; }).length)],
    ["Total Registered Operators", String(franchises.length)],
  ];

  generatePDF({
    title: "Monthly Summary Report \u2014 " + monthName,
    subtitle: "Overview of TFRO operations",
    headers: headers,
    rows: rows,
    filename: "TFRO_Monthly_Summary_" + now.toISOString().slice(0, 7) + ".pdf",
  });
}

function buildExpiringFranchisesReport(data) {
  const headers = ["#", "Franchise No.", "Operator", "Route", "Expiration Date", "Days Left"];
  const now = new Date();
  const rows = data.map(function(r, i) {
    const days = Math.ceil((new Date(r.expiration_date + "T00:00:00") - now) / 86400000);
    return [
      String(i + 1), r.franchise_number, r.operator_name, r.route,
      r.expiration_date || "\u2014", days > 0 ? days + " day(s)" : "Expired",
    ];
  });
  generatePDF({
    title: "Expiring Franchises Report",
    subtitle: "Total: " + data.length + " franchise(s) expiring soon",
    headers: headers,
    rows: rows,
    filename: "TFRO_Expiring_Franchises_" + new Date().toISOString().slice(0, 10) + ".pdf",
  });
}

function buildAuditLogReport(data) {
  const headers = ["#", "Action", "Table", "Performed By", "Date"];
  const rows = data.map(function(r, i) {
    return [
      String(i + 1), r.action || "\u2014", r.table_name || "\u2014",
      r.performed_by || "\u2014", r.created_at ? new Date(r.created_at).toLocaleString() : "\u2014",
    ];
  });
  generatePDF({
    title: "Audit Log Report",
    subtitle: "Total: " + data.length + " log entry(ies)",
    headers: headers,
    rows: rows,
    filename: "TFRO_Audit_Log_" + new Date().toISOString().slice(0, 10) + ".pdf",
  });
}

// Print Handler

function printReport(title, headers, rows) {
  const win = window.open("", "_blank");
  const style = [
    "<style>",
    "body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }",
    "h1 { font-size: 22px; color: #0f2d6b; margin-bottom: 4px; }",
    ".subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }",
    "table { width: 100%; border-collapse: collapse; font-size: 12px; }",
    "th { background: #0f2d6b; color: white; padding: 10px; text-align: left; }",
    "td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }",
    "tr:nth-child(even) td { background: #f8fafc; }",
    ".footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center; }",
    "@media print { body { padding: 0; } }",
    "</style>",
  ].join("\n");
  const tableRows = rows.map(function(r) {
    return "<tr>" + r.map(function(c) { return "<td>" + escapeHtml(c) + "</td>"; }).join("") + "</tr>";
  }).join("");
  win.document.write([
    "<!DOCTYPE html>",
    "<html><head><title>" + title + "</title>" + style + "</head><body>",
    "<h1>TFRO - Lucena City</h1>",
    "<div class=\"subtitle\">" + title + "</div>",
    "<table><thead><tr>" + headers.map(function(h) { return "<th>" + escapeHtml(h) + "</th>"; }).join("") + "</tr></thead>",
    "<tbody>" + tableRows + "</tbody></table>",
    "<div class=\"footer\">Generated on " + new Date().toLocaleString() + "</div>",
    "<script>window.print();</script>",
    "</body></html>",
  ].join("\n"));
  win.document.close();
}

// Modal Preview

function showPreview(title, headers, rows) {
  const modal = document.getElementById("reportModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalCount = document.getElementById("modalCount");

  modalTitle.textContent = title;
  modalCount.textContent = rows.length + " record(s)";

  const tableHtml = [
    "<table>",
    "<thead><tr>" + headers.map(function(h) { return "<th>" + escapeHtml(h) + "</th>"; }).join("") + "</tr></thead>",
    "<tbody>" + rows.map(function(r) {
      return "<tr>" + r.map(function(c) { return "<td>" + escapeHtml(c) + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody>",
    "</table>",
  ].join("\n");
  modalBody.innerHTML = tableHtml;
  modal.hidden = false;
}

// Main Handler

async function handleReport(action, reportType) {
  try {
    const session = await verifyAccess();
    if (!session) return;

    var data, title, headers, rows;

    switch (reportType) {
      case "franchise": {
        data = await loadFranchises();
        title = "Franchise Records Report";
        headers = ["#", "Franchise No.", "Operator", "Route", "Type", "Status", "Date"];
        rows = data.map(function(r, i) {
          return [String(i + 1), r.franchise_number, r.operator_name, r.route, r.application_type, r.status, r.application_date];
        });
        if (action === "download") { buildFranchiseReport(data); }
        break;
      }
      case "operator": {
        data = await loadOperators();
        title = "Operator Registry Report";
        headers = ["#", "Full Name", "Address", "Contact", "Franchise #", "Status"];
        rows = data.map(function(r, i) {
          return [String(i + 1), r.full_name, r.address, r.contact_number, r.franchise_number || "\u2014", r.status];
        });
        if (action === "download") { buildOperatorReport(data); }
        break;
      }
      case "driver": {
        data = await loadDrivers();
        title = "Driver Registry Report";
        headers = ["#", "Full Name", "License No.", "Operator", "Contact", "Violations", "Compliance"];
        rows = data.map(function(r, i) {
          return [String(i + 1), r.full_name, r.license_number, r.operator_name, r.contact_number, String(r.violation_count), r.compliance];
        });
        if (action === "download") { buildDriverReport(data); }
        break;
      }
      case "violation": {
        data = await loadViolations();
        title = "Violations Report";
        headers = ["#", "Subject", "Type", "Violation", "Penalty", "Date", "Status"];
        rows = data.map(function(r, i) {
          return [String(i + 1), r.subject_name || "\u2014", r.subject_type || "\u2014", r.violation_type, currencyFormatter.format(r.penalty || 0), new Date(r.occurred_at).toLocaleDateString(), r.status];
        });
        if (action === "download") { buildViolationsReport(data); }
        break;
      }
      case "financial": {
        data = await loadPayments();
        title = "Financial Transactions Report";
        headers = ["#", "Amount", "Date"];
        rows = data.map(function(r, i) {
          return [String(i + 1), currencyFormatter.format(r.amount || 0), new Date(r.paid_at).toLocaleDateString()];
        });
        if (action === "download") { buildFinancialReport(data); }
        break;
      }
      case "monthly": {
        var f = await loadFranchises();
        var p = await loadPayments();
        var v = await loadViolations();
        var now = new Date();
        var monthName = now.toLocaleString("en", { month: "long", year: "numeric" });
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        var mF = f.filter(function(r) { return r.application_date >= monthStart.slice(0, 10); });
        var mP = p.filter(function(r) { return r.paid_at >= monthStart; });
        var mV = v.filter(function(r) { return r.occurred_at >= monthStart; });
        var revenue = mP.reduce(function(sum, r) { return sum + Number(r.amount || 0); }, 0);
        title = "Monthly Summary \u2014 " + monthName;
        headers = ["Metric", "Count"];
        rows = [
          ["New Franchise Applications", String(mF.length)],
          ["Payments Received", String(mP.length)],
          ["Monthly Revenue", currencyFormatter.format(revenue)],
          ["Violations Recorded", String(mV.length)],
          ["Total Active Franchises", String(f.filter(function(r) { return r.status === "active"; }).length)],
          ["Total Registered Operators", String(f.length)],
        ];
        if (action === "download") { buildMonthlySummaryReport(f, p, v); }
        break;
      }
      case "expiring": {
        data = await loadFranchises();
        var now = new Date();
        var expiring = data.filter(function(r) {
          if (!r.expiration_date) return false;
          var days = Math.ceil((new Date(r.expiration_date + "T00:00:00") - now) / 86400000);
          return days >= 0 && days <= 90;
        }).sort(function(a, b) { return new Date(a.expiration_date) - new Date(b.expiration_date); });
        title = "Expiring Franchises Report";
        headers = ["#", "Franchise No.", "Operator", "Route", "Expiration Date", "Days Left"];
        rows = expiring.map(function(r, i) {
          var days = Math.ceil((new Date(r.expiration_date + "T00:00:00") - now) / 86400000);
          return [String(i + 1), r.franchise_number, r.operator_name, r.route, r.expiration_date || "\u2014", days > 0 ? days + " day(s)" : "Expired"];
        });
        if (action === "download") { buildExpiringFranchisesReport(expiring); }
        break;
      }
      case "audit": {
        data = await loadAuditLog();
        title = "Audit Log Report";
        headers = ["#", "Action", "Table", "Performed By", "Date"];
        rows = data.map(function(r, i) {
          return [String(i + 1), r.action || "\u2014", r.table_name || "\u2014", r.performed_by || "\u2014", r.created_at ? new Date(r.created_at).toLocaleString() : "\u2014"];
        });
        if (action === "download") { buildAuditLogReport(data); }
        break;
      }
      default:
        return;
    }

if (action === "view") {
      showPreview(title, headers, rows);
    } else if (action === "print") {
      printReport(title, headers, rows);
    } else if (action === "download") {
      logAudit({
        action: "Generated Report",
        actionType: "create",
        record: title,
        description: `Generated and downloaded the ${title} (${data ? data.length : 0} records).`,
      });
    }
  } catch (err) {
    console.error("Report error:", err);
    alert("Could not generate report: " + err.message);
  }
}

// Report Card Definitions

var reportCards = [
  { title: "Franchise Records Report", desc: "Summary of all franchise applications, renewals, approvals, and rejections.", icon: "ri-file-list-3-line", bg: "background:#dbeafe;", color: "color:#1d4ed8;", report: "franchise" },
  { title: "Operator Registry Report", desc: "Complete list of registered operators with franchise and contact details.", icon: "ri-user-star-line", bg: "background:#ccfbf1;", color: "color:#0f766e;", report: "operator" },
  { title: "Driver Registry Report", desc: "Full driver listing with license information and compliance status.", icon: "ri-steering-2-line", bg: "background:#e0e7ff;", color: "color:#4338ca;", report: "driver" },
  { title: "Violations Report", desc: "Detailed list of recorded violations, penalties, and enforcement actions.", icon: "ri-alert-line", bg: "background:#ffedd5;", color: "color:#ea580c;", report: "violation" },
  { title: "Financial Transactions Report", desc: "Payment history, fee collections, receipts, and revenue summary.", icon: "ri-money-dollar-circle-line", bg: "background:#d1fae5;", color: "color:#047857;", report: "financial" },
  { title: "Monthly Summary Report", desc: "Monthly overview of all TFRO operations.", icon: "ri-bar-chart-box-line", bg: "background:#cffafe;", color: "color:#0891b2;", report: "monthly" },
  { title: "Expiring Franchises Report", desc: "Franchises expiring within 30, 60, and 90 days.", icon: "ri-calendar-close-line", bg: "background:#fef3c7;", color: "color:#d97706;", report: "expiring" },
  { title: "Audit Log Report", desc: "System activity and user actions for accountability.", icon: "ri-history-line", bg: "background:#f3f4f6;", color: "color:#374151;", report: "audit" },
];

function renderReportCards() {
  var grid = document.getElementById("reportsGrid");
  var html = "";
  for (var i = 0; i < reportCards.length; i++) {
    var card = reportCards[i];
    html += [
      '<div class="report-card">',
      '<div class="icon-box" style="' + card.bg + '">',
      '<i class="' + card.icon + '" style="' + card.color + '"></i>',
      "</div>",
      "<h3>" + card.title + "</h3>",
      "<p>" + card.desc + "</p>",
      '<div class="card-actions">',
      '<button class="download-btn" data-action="view" data-report="' + card.report + '"><i class="ri-eye-line"></i> View</button>',
      '<button class="download-btn" data-action="download" data-report="' + card.report + '"><i class="ri-download-line"></i> Download PDF</button>',
      '<button class="print-btn" data-action="print" data-report="' + card.report + '"><i class="ri-printer-line"></i> Print</button>',
      "</div>",
      "</div>",
    ].join("\n");
  }
  grid.innerHTML = html;
}

// Event Binding

document.addEventListener("DOMContentLoaded", async function() {
  await verifyAccess();
  renderReportCards();
  document.getElementById("reportsGrid").addEventListener("click", function(e) {
    var btn = e.target.closest("button[data-action][data-report]");
    if (!btn) return;
    var action = btn.dataset.action;
    var report = btn.dataset.report;
    handleReport(action, report);
  });
});

// Modal close
document.getElementById("closeModalBtn")?.addEventListener("click", function() {
  document.getElementById("reportModal").hidden = true;
});

document.getElementById("reportModal")?.addEventListener("click", function(e) {
  if (e.target === e.currentTarget) {
    document.getElementById("reportModal").hidden = true;
  }
});

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", async function() {
  await supabase.auth.signOut();
  localStorage.clear();
  window.location.href = "index.html";
});
