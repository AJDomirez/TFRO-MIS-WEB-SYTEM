import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const reportState = { current: null, access: null };

function text(value, fallback = "—") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return includeTime
    ? date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
  }[character]));
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function selectedPeriod() {
  const startValue = document.getElementById("reportStartDate")?.value || "";
  const endValue = document.getElementById("reportEndDate")?.value || "";
  const start = startValue ? new Date(`${startValue}T00:00:00`) : null;
  const end = endValue ? new Date(`${endValue}T23:59:59.999`) : null;
  if (start && end && start > end) throw new Error("Start date cannot be later than end date.");
  return { start, end };
}

function periodLabel(period) {
  if (!period.start && !period.end) return "All available records";
  return `${period.start ? formatDate(period.start) : "Beginning"} to ${period.end ? formatDate(period.end) : "Present"}`;
}

function withinPeriod(value, period) {
  if (!period.start && !period.end) return true;
  const date = normalizeDate(value);
  if (!date) return false;
  if (period.start && date < period.start) return false;
  if (period.end && date > period.end) return false;
  return true;
}

async function selectRows(table, columns = "*", options = {}) {
  let query = supabase.from(table).select(columns);
  if (options.order) query = query.order(options.order, { ascending: options.ascending ?? false });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new Error(`${options.label || table}: ${error.message}`);
  return data || [];
}

const reportDefinitions = {
  executive: {
    title: "Dashboard Executive Summary",
    description: "A consolidated overview of TFRO records, transactions, and pending work.",
    icon: "ri-dashboard-line", accent: "blue", headers: ["Metric", "Value"],
    sampleRows: [
      ["SAMPLE • Active franchises", "128"], ["SAMPLE • Pending applications", "6"],
      ["SAMPLE • Renewals this month", "14"], ["SAMPLE • Payments collected", currency.format(48500)],
    ],
    async load(period) {
      const [franchises, applications, renewals, motors, operators, drivers, violations, payments] = await Promise.all([
        selectRows("franchises", "status,created_at,application_date"),
        selectRows("franchise_applications", "status,created_at"),
        selectRows("franchise_renewals", "status,created_at"),
        selectRows("change_motor_requests", "status,created_at"),
        selectRows("operators", "status,created_at"),
        selectRows("drivers", "compliance,created_at"),
        selectRows("violations", "status,created_at,occurred_at,penalty"),
        selectRows("payments", "status,created_at,paid_at,amount"),
      ]);
      const filter = (rows, fields) => rows.filter((row) => withinPeriod(fields.map((field) => row[field]).find(Boolean), period));
      const filtered = {
        franchises: filter(franchises, ["application_date", "created_at"]),
        applications: filter(applications, ["created_at"]), renewals: filter(renewals, ["created_at"]),
        motors: filter(motors, ["created_at"]), operators: filter(operators, ["created_at"]),
        drivers: filter(drivers, ["created_at"]), violations: filter(violations, ["occurred_at", "created_at"]),
        payments: filter(payments, ["paid_at", "created_at"]),
      };
      const totalPayments = filtered.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      return [
        ["Franchise records", String(filtered.franchises.length)],
        ["Franchise applications", String(filtered.applications.length)],
        ["Pending franchise applications", String(filtered.applications.filter((row) => String(row.status).toLowerCase() === "pending").length)],
        ["Franchise renewals", String(filtered.renewals.length)],
        ["Change motor requests", String(filtered.motors.length)],
        ["Registered operators", String(filtered.operators.length)],
        ["Registered drivers", String(filtered.drivers.length)],
        ["Recorded violations", String(filtered.violations.length)],
        ["Payments received", String(filtered.payments.length)],
        ["Total payment amount", currency.format(totalPayments)],
      ];
    },
  },
  franchises: {
    title: "Franchise Records Report", description: "Master list of franchises, operators, routes, status, and expiration dates.",
    icon: "ri-file-list-3-line", accent: "green",
    headers: ["Franchise No.", "Operator", "Route", "Type", "Status", "Application Date", "Expiration"],
    sampleRows: [
      ["SAMPLE-MTOP-2026-001", "Juan Dela Cruz", "Lucena Proper", "Renewal", "Active", "Aug 1, 2026", "Aug 1, 2029"],
      ["SAMPLE-MTOP-2026-002", "Maria Santos", "Ibabang Dupay", "New", "Pending", "Aug 10, 2026", "—"],
    ],
    async load(period) {
      const rows = await selectRows("franchises", "franchise_number,operator_name,route,application_type,status,application_date,expiration_date,created_at", { order: "created_at" });
      return rows.filter((row) => withinPeriod(row.application_date || row.created_at, period)).map((row) => [
        text(row.franchise_number), text(row.operator_name), text(row.route), text(row.application_type), text(row.status), formatDate(row.application_date), formatDate(row.expiration_date),
      ]);
    },
  },
  applications: {
    title: "Franchise Applications Report", description: "Submitted MTOP/franchise applications with verification and approval status.",
    icon: "ri-file-add-line", accent: "teal",
    headers: ["Application Code", "Franchise No.", "Operator", "Route", "Status", "Complete", "Submitted"],
    sampleRows: [
      ["SAMPLE-APP-001", "SAMPLE-MTOP-001", "Pedro Reyes", "Dalahican", "Pending", "Yes", "Aug 12, 2026"],
      ["SAMPLE-APP-002", "—", "Ana Mendoza", "Cotta", "Needs correction", "No", "Aug 14, 2026"],
    ],
    async load(period) {
      const rows = await selectRows("franchise_applications", "application_code,franchise_number,operator_name,route,status,info_complete,created_at", { order: "created_at" });
      return rows.filter((row) => withinPeriod(row.created_at, period)).map((row) => [
        text(row.application_code), text(row.franchise_number), text(row.operator_name), text(row.route), text(row.status), row.info_complete ? "Yes" : "No", formatDate(row.created_at),
      ]);
    },
  },
  renewals: {
    title: "Franchise Renewals / MTOP Report", description: "Renewal requests, assessment, payment, MTOP issuance, and current status.",
    icon: "ri-refresh-line", accent: "yellow",
    headers: ["Renewal Code", "Franchise / MTOP", "Operator", "Renewal Type", "Status", "Payment", "Submitted"],
    sampleRows: [
      ["SAMPLE-REN-001", "SAMPLE-MTOP-101", "Roberto Garcia", "Regular", "Documents verified", "Pending", "Aug 8, 2026"],
      ["SAMPLE-REN-002", "SAMPLE-MTOP-102", "Elena Flores", "Expired OR", "Awaiting payment", "Paid", "Aug 11, 2026"],
    ],
    async load(period) {
      const rows = await selectRows("franchise_renewals", "renewal_code,franchise_id,franchise:franchises!franchise_renewals_franchise_id_fkey(franchise_number),operator_name,renewal_type,status,payment_status,created_at", { order: "created_at" });
      return rows.filter((row) => withinPeriod(row.created_at, period)).map((row) => [
        text(row.renewal_code), text(row.franchise?.franchise_number || row.franchise_id), text(row.operator_name), text(row.renewal_type), text(row.status), text(row.payment_status), formatDate(row.created_at),
      ]);
    },
  },
  motorRequests: {
    title: "Change Motor Requests Report", description: "Change motor applications with old/new vehicle details and review status.",
    icon: "ri-settings-5-line", accent: "orange",
    headers: ["Request Code", "Franchise", "New Brand", "New Engine", "New Chassis", "Status", "Submitted"],
    sampleRows: [
      ["SAMPLE-MOTOR-001", "SAMPLE-MTOP-201", "Honda", "ENG-SAMPLE-1001", "CHS-SAMPLE-1001", "Reviewing", "Aug 9, 2026"],
      ["SAMPLE-MOTOR-002", "SAMPLE-MTOP-202", "Kawasaki", "ENG-SAMPLE-1002", "CHS-SAMPLE-1002", "Approved", "Aug 13, 2026"],
    ],
    async load(period) {
      const rows = await selectRows("change_motor_requests", "request_code,franchise_id,franchise:franchises!change_motor_requests_franchise_id_fkey(franchise_number),new_motor_brand,new_engine_number,new_chassis_number,status,created_at", { order: "created_at" });
      return rows.filter((row) => withinPeriod(row.created_at, period)).map((row) => [
        text(row.request_code), text(row.franchise?.franchise_number || row.franchise_id), text(row.new_motor_brand), text(row.new_engine_number), text(row.new_chassis_number), text(row.status), formatDate(row.created_at),
      ]);
    },
  },
  operators: {
    title: "Operator Registry Report", description: "Registered operators with contact, franchise, verification, and account status.",
    icon: "ri-user-star-line", accent: "green",
    headers: ["Full Name", "Address", "Contact", "Franchise No.", "Status", "Verified", "Registered"],
    sampleRows: [
      ["SAMPLE • Juan Dela Cruz", "Brgy. 3, Lucena City", "0917-123-4567", "SAMPLE-MTOP-301", "Active", "Yes", "Jan 15, 2026"],
      ["SAMPLE • Maria Santos", "Brgy. Cotta, Lucena City", "0918-222-3344", "SAMPLE-MTOP-302", "Active", "Yes", "Feb 2, 2026"],
    ],
    async load(period) {
      const rows = await selectRows("operators", "full_name,address,contact_number,franchise_number,status,verified,created_at", { order: "created_at" });
      return rows.filter((row) => withinPeriod(row.created_at, period)).map((row) => [
        text(row.full_name), text(row.address), text(row.contact_number), text(row.franchise_number), text(row.status), row.verified ? "Yes" : "No", formatDate(row.created_at),
      ]);
    },
  },
  drivers: {
    title: "Driver Registry Report", description: "Drivers under operators with license, expiration, and compliance information.",
    icon: "ri-steering-2-line", accent: "purple",
    headers: ["Full Name", "License No.", "Operator", "Contact", "License Status", "Expiration", "Compliance"],
    sampleRows: [
      ["SAMPLE • Ramon Bautista", "SAMPLE-D01-23-456789", "Juan Dela Cruz", "0919-111-2233", "Verified", "Dec 20, 2027", "Compliant"],
      ["SAMPLE • Leo Ramos", "SAMPLE-D02-24-987654", "Maria Santos", "0920-444-5566", "Not verified", "Apr 5, 2027", "Compliant"],
    ],
    async load(period) {
      const rows = await selectRows("drivers", "full_name,license_number,operator_name,contact_number,license_status,license_expiration,compliance,created_at", { order: "created_at" });
      return rows.filter((row) => withinPeriod(row.created_at, period)).map((row) => [
        text(row.full_name), text(row.license_number), text(row.operator_name), text(row.contact_number), text(row.license_status), formatDate(row.license_expiration), text(row.compliance),
      ]);
    },
  },
  violations: {
    title: "Violations Report", description: "Violations, subjects, penalties, occurrence dates, and payment status.",
    icon: "ri-alert-line", accent: "red",
    headers: ["Subject", "Subject Type", "Violation", "Penalty", "Occurrence Date", "Status"],
    sampleRows: [
      ["SAMPLE • Ramon Bautista", "Driver", "Refusal to convey passenger", currency.format(200), "Aug 4, 2026", "Pending"],
      ["SAMPLE • Juan Dela Cruz", "Operator", "Operating on banned day", currency.format(200), "Aug 7, 2026", "Paid"],
    ],
    async load(period) {
      const rows = await selectRows("violations", "subject_name,subject_type,violation_type,penalty,occurred_at,status,created_at", { order: "occurred_at" });
      return rows.filter((row) => withinPeriod(row.occurred_at || row.created_at, period)).map((row) => [
        text(row.subject_name), text(row.subject_type), text(row.violation_type), currency.format(Number(row.penalty || 0)), formatDate(row.occurred_at), text(row.status),
      ]);
    },
  },
  payments: {
    title: "Payments Report", description: "Treasurer payments, payors, receipts, payment types, and collection totals.",
    icon: "ri-money-dollar-circle-line", accent: "green",
    headers: ["Payor", "Receipt", "Payment Type", "Amount", "Status", "Paid Date"],
    sampleRows: [
      ["SAMPLE • Juan Dela Cruz", "SAMPLE-OR-2026-001", "Franchise renewal", currency.format(1500), "Paid", "Aug 10, 2026"],
      ["SAMPLE • Maria Santos", "SAMPLE-OR-2026-002", "Violation penalty", currency.format(200), "Paid", "Aug 12, 2026"],
    ],
    async load(period) {
      const rows = await selectRows("payments", "payer,receipt,payment_type,amount,status,paid_at,created_at", { order: "paid_at" });
      return rows.filter((row) => withinPeriod(row.paid_at || row.created_at, period)).map((row) => [
        text(row.payer), text(row.receipt), text(row.payment_type), currency.format(Number(row.amount || 0)), text(row.status), formatDate(row.paid_at),
      ]);
    },
  },
  notifications: {
    title: "Notifications Report", description: "System notices, approval updates, read status, and delivery dates.",
    icon: "ri-notification-3-line", accent: "blue",
    headers: ["Title", "Message", "Type", "Read", "Created"],
    sampleRows: [
      ["SAMPLE • Renewal approved", "Your franchise renewal has been approved.", "Success", "Unread", "Aug 15, 2026, 9:30 AM"],
      ["SAMPLE • Requirements incomplete", "Please upload the updated insurance document.", "Warning", "Read", "Aug 14, 2026, 2:15 PM"],
    ],
    async load(period) {
      const rows = await selectRows("notifications", "title,message,type,is_read,created_at", { order: "created_at" });
      return rows.filter((row) => withinPeriod(row.created_at, period)).map((row) => [
        text(row.title), text(row.message), text(row.type), row.is_read ? "Read" : "Unread", formatDate(row.created_at, true),
      ]);
    },
  },
  audit: {
    title: "Audit Log Report", description: "Administrative activity, user actions, affected records, and timestamps.",
    icon: "ri-history-line", accent: "gray",
    headers: ["User", "Role", "Action", "Type", "Record", "Date"],
    sampleRows: [
      ["SAMPLE • TFRO Admin", "Admin", "Approved renewal", "Approve", "SAMPLE-REN-001", "Aug 15, 2026, 10:15 AM"],
      ["SAMPLE • TFRO Staff", "Staff", "Verified documents", "Verification", "SAMPLE-APP-001", "Aug 14, 2026, 3:40 PM"],
    ],
    async load(period) {
      const rows = await selectRows("audit_logs", "user_name,role,action,action_type,record,created_at", { order: "created_at", limit: 1000 });
      return rows.filter((row) => withinPeriod(row.created_at, period)).map((row) => [
        text(row.user_name), text(row.role), text(row.action), text(row.action_type), text(row.record), formatDate(row.created_at, true),
      ]);
    },
  },
};

const accentStyles = {
  blue: ["#dbeafe", "#1d4ed8"], green: ["#d1fae5", "#047857"], teal: ["#ccfbf1", "#0f766e"],
  yellow: ["#fef3c7", "#b45309"], orange: ["#ffedd5", "#c2410c"], purple: ["#ede9fe", "#6d28d9"],
  red: ["#fee2e2", "#b91c1c"], gray: ["#f1f5f9", "#475569"],
};

function renderReportCards() {
  const grid = document.getElementById("reportsGrid");
  if (!grid) return;
  grid.innerHTML = Object.entries(reportDefinitions).map(([key, report]) => {
    const [background, color] = accentStyles[report.accent] || accentStyles.green;
    return `<article class="report-card"><div class="icon-box" style="background:${background};color:${color}"><i class="${report.icon}"></i></div><h3>${escapeHtml(report.title)}</h3><p>${escapeHtml(report.description)}</p><div class="card-actions"><button type="button" class="download-btn report-action-btn" data-action="view" data-report="${key}"><i class="ri-eye-line"></i> View</button><button type="button" class="download-btn report-action-btn" data-action="pdf" data-report="${key}"><i class="ri-file-pdf-2-line"></i> Save PDF</button><button type="button" class="print-btn report-action-btn" data-action="print" data-report="${key}"><i class="ri-printer-line"></i> Print</button></div></article>`;
  }).join("");
}

async function ensureAccess() {
  if (reportState.access) return reportState.access;
  const { user, profile } = await requireRole(["admin", "staff"]);
  if (!user || !profile) return null;
  reportState.access = { user, profile };
  return reportState.access;
}

function createTableHtml(headers, rows) {
  if (!rows.length) return `<div class="empty-report-state"><i class="ri-inbox-2-line"></i>No records found for the selected report period.</div>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function showPreview(payload) {
  reportState.current = payload;
  document.getElementById("modalTitle").textContent = payload.title;
  document.getElementById("modalCount").textContent = `${payload.rows.length} record(s) • ${payload.periodText}`;
  const sampleBanner = payload.isSample ? '<div class="sample-report-banner"><i class="ri-flask-line"></i> SAMPLE DATA — FOR TESTING ONLY. These records are not stored in Supabase.</div>' : "";
  document.getElementById("modalBody").innerHTML = sampleBanner + createTableHtml(payload.headers, payload.rows);
  document.getElementById("reportModal").hidden = false;
}

function safeFilename(title) {
  return `TFRO_${title.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}_${new Date().toISOString().slice(0, 10)}.pdf`;
}

function savePdf(payload) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) throw new Error("The PDF library did not load. Check the internet connection and try again.");
  const landscape = payload.headers.length > 6;
  const doc = new JsPdf({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setTextColor(15, 77, 61); doc.setFontSize(17); doc.text("TFRO - Lucena City", 14, 18);
  doc.setTextColor(30, 41, 59); doc.setFontSize(12); doc.text(payload.title, 14, 26);
  doc.setTextColor(payload.isSample ? 180 : 100, payload.isSample ? 83 : 116, payload.isSample ? 9 : 139);
  doc.setFontSize(9); doc.text(payload.isSample ? `SAMPLE DATA - FOR TESTING ONLY | Records: ${payload.rows.length}` : `Period: ${payload.periodText} | Records: ${payload.rows.length}`, 14, 32);
  doc.autoTable({
    startY: 37, head: [payload.headers],
    body: payload.rows.length ? payload.rows : [["No records found for the selected report period.", ...payload.headers.slice(1).map(() => "")]],
    theme: "grid", headStyles: { fillColor: [15, 118, 88], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] }, alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
    didDrawPage() {
      doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${new Date().toLocaleString("en-PH")}`, 10, doc.internal.pageSize.getHeight() - 7);
      doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pageWidth - 25, doc.internal.pageSize.getHeight() - 7);
    },
  });
  doc.save(safeFilename(payload.title));
}

function printReport(payload) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("The print window was blocked. Allow pop-ups for this site and try again.");
  printWindow.opener = null;
  const table = payload.rows.length
    ? `<table><thead><tr>${payload.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${payload.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : '<p class="empty">No records found for the selected report period.</p>';
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(payload.title)}</title><style>@page{size:auto;margin:14mm}body{font:12px Arial,sans-serif;color:#17202a}h1{color:#0f4d3d;margin:0 0 4px}p{margin:0 0 18px;color:#5f6b76}.sample{padding:8px 10px;background:#fff4d6;border:1px solid #e8b94f;color:#7a4b00;font-weight:bold}table{width:100%;border-collapse:collapse}th,td{padding:7px;border:1px solid #b8c3cc;text-align:left;vertical-align:top}th{background:#0f7658;color:#fff}.empty{padding:35px;text-align:center;border:1px solid #ccd6dd}.footer{margin-top:14px;font-size:10px;color:#68737d}</style></head><body><h1>TFRO - Lucena City</h1><p>${escapeHtml(payload.title)}<br>Period: ${escapeHtml(payload.periodText)} · ${payload.rows.length} record(s)</p>${payload.isSample ? '<p class="sample">SAMPLE DATA — FOR TESTING ONLY. Not stored in Supabase.</p>' : ""}${table}<div class="footer">Generated ${escapeHtml(new Date().toLocaleString("en-PH"))}</div></body></html>`);
  printWindow.document.close();
  printWindow.addEventListener("load", () => { printWindow.focus(); printWindow.print(); }, { once: true });
}

async function loadPayload(reportKey) {
  const report = reportDefinitions[reportKey];
  if (!report) throw new Error("Unknown report type.");
  const sampleMode = document.getElementById("sampleDataMode")?.checked ?? false;
  const period = selectedPeriod();
  const rows = sampleMode ? report.sampleRows : await report.load(period);
  return {
    key: reportKey, title: report.title, headers: report.headers, rows: rows || [],
    periodText: sampleMode ? "Sample preview (date filter not applied)" : periodLabel(period),
    isSample: sampleMode,
  };
}

async function runReportAction(action, reportKey, button) {
  const originalHtml = button?.innerHTML;
  try {
    if (button) { button.disabled = true; button.innerHTML = '<i class="ri-loader-4-line"></i> Loading'; }
    if (!(await ensureAccess())) return;
    const payload = await loadPayload(reportKey);
    if (action === "view") showPreview(payload);
    if (action === "pdf") savePdf(payload);
    if (action === "print") printReport(payload);
    if (action === "pdf" || action === "print") void logAudit({
      action: action === "pdf" ? "Saved PDF Report" : "Printed Report", actionType: "create", record: payload.title,
      description: `${action === "pdf" ? "Saved" : "Printed"} ${payload.title} for ${payload.periodText} (${payload.rows.length} records).`,
    });
  } catch (error) {
    console.error("Report action failed:", error);
    window.alert(`Could not generate the report. ${error.message}`);
  } finally {
    if (button) { button.disabled = false; button.innerHTML = originalHtml; }
  }
}

function closeModal() { document.getElementById("reportModal").hidden = true; }

function runCurrentAction(action) {
  if (!reportState.current) return;
  try {
    if (action === "pdf") savePdf(reportState.current);
    if (action === "print") printReport(reportState.current);
    void logAudit({
      action: action === "pdf" ? "Saved PDF Report" : "Printed Report",
      actionType: "create",
      record: reportState.current.title,
      description: `${action === "pdf" ? "Saved" : "Printed"} ${reportState.current.title} from the report preview.`,
    });
  } catch (error) {
    console.error("Preview report action failed:", error);
    window.alert(`Could not generate the report. ${error.message}`);
  }
}

function bindEvents() {
  document.getElementById("reportsGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action][data-report]");
    if (button) void runReportAction(button.dataset.action, button.dataset.report, button);
  });
  document.getElementById("resetReportDates")?.addEventListener("click", () => {
    document.getElementById("reportStartDate").value = ""; document.getElementById("reportEndDate").value = "";
  });
  document.getElementById("closeModalBtn")?.addEventListener("click", closeModal);
  document.getElementById("reportModal")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal(); });
  document.getElementById("modalSavePdfBtn")?.addEventListener("click", () => runCurrentAction("pdf"));
  document.getElementById("modalPrintBtn")?.addEventListener("click", () => runCurrentAction("print"));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
}

function initializeReports() {
  renderReportCards();
  bindEvents();
  void ensureAccess().catch((error) => console.error("Report page authorization failed:", error));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeReports, { once: true });
else initializeReports();
