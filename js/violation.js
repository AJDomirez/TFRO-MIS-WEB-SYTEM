import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";
import { bindDateCsvExport, isWithinDateRange } from "./csv-export.js";
import { openPaymentOrderPdfForm } from "./pdf-form.js";

let violations = [];
let catalog = [];
let currentUserId = null;
let editingViolationId = null;
let toastTimer = null;
let canManageViolations = false;

const table = document.getElementById("violationsTable");
const formPanel = document.getElementById("violationFormPanel");
const form = document.getElementById("violationForm");
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
  }[character]));
}

function dateForInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-PH");
}

function classificationLabel(value) {
  const labels = { with_franchise: "C", colorum: "Colorum", temporary: "Temporary" };
  return labels[value] || value || "—";
}

function paidPayment(row) {
  const related = Array.isArray(row.payments) ? row.payments : [];
  return related.find((payment) => payment.status === "paid") || null;
}

function netAmount(row) {
  return Math.max(Number(row.penalty || 0) - Number(row.discounted || 0), 0);
}

function showToast(message) {
  const toast = document.getElementById("violationToast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function filteredViolations() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  return violations.filter((row) => isWithinDateRange(row.occurred_at)
    && (status === "all" || row.status === status)
    && [row.subject_name || "", row.violation_code || "", row.ticket_number || "", row.violation_type || "", row.description || "", row.apprehending_officers || "", ...(row.payments || []).map((payment) => payment.receipt || "")]
      .some((value) => value.toLowerCase().includes(term)));
}

function render() {
  const rows = filteredViolations();
  document.getElementById("violationTotal").textContent = violations.length;
  document.getElementById("violationPending").textContent = violations.filter((row) => row.status === "pending").length;
  document.getElementById("violationPaid").textContent = violations.filter((row) => row.status === "paid").length;
  document.getElementById("violationAmount").textContent = money.format(violations.reduce((sum, row) => sum + netAmount(row), 0));
  table.innerHTML = rows.length ? rows.map((row) => {
    const payment = paidPayment(row);
    return `<tr>
      <td>${formatDate(row.occurred_at)}</td>
      <td>${escapeHtml(classificationLabel(row.classification || row.subject_type))}</td>
      <td>${money.format(Number(row.discounted || 0))}</td>
      <td>${escapeHtml(row.subject_name || "—")}</td>
      <td><strong>${escapeHtml(row.violation_code || "—")}</strong><br>${escapeHtml(row.violation_type)}</td>
      <td>${formatDate(payment?.paid_at)}</td>
      <td>${escapeHtml(row.ticket_number || "—")}</td>
      <td>${money.format(Number(payment?.amount ?? netAmount(row)))}</td>
      <td>${escapeHtml(payment?.receipt || "—")}</td>
      <td>${escapeHtml(row.apprehending_officers || "—")}</td>
      <td><div class="actions">
        ${canManageViolations ? `<button type="button" data-action="edit" data-id="${row.id}" title="Edit violation" aria-label="Edit violation for ${escapeHtml(row.subject_name || "record")}">
          <i class="ri-pencil-line"></i>
        </button>` : ""}
        ${row.ticket_photo_path ? `<button type="button" data-action="photo" data-id="${row.id}" title="View submitted ticket photo" aria-label="View ticket photo for ${escapeHtml(row.subject_name || "record")}"><i class="ri-image-line"></i></button>` : ""}
        <button type="button" data-action="order" data-id="${row.id}" title="View TFRO-009 Order of Payment"><i class="ri-file-pdf-2-line"></i></button>
        <button type="button" data-action="notice" data-id="${row.id}" title="Print violation notice"><i class="ri-printer-line"></i></button>
      </div></td>
    </tr>`;
  }).join("") : '<tr><td colspan="11">No violations found.</td></tr>';
}

function printNotice(row) {
  const tab = window.open("", "_blank");
  if (!tab) return window.alert("Please allow pop-ups to print the violation notice.");
  tab.document.write(`<!doctype html><html><head><title>Violation Notice ${escapeHtml(row.ticket_number || "")}</title><style>body{font-family:Arial,sans-serif;color:#172033}.page{max-width:760px;margin:25px auto;border:1px solid #aebbb5;padding:28px}.head{border-top:12px solid #0b5c41;border-bottom:5px solid #f4c430;padding:16px 0}.head h1{font-size:20px;margin:0}.title{text-align:center;letter-spacing:4px;text-decoration:underline;margin:30px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{border-bottom:1px solid #555;padding:8px 0}.field b{display:block;font-size:11px;color:#5b6870;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{border:1px solid #555;padding:10px;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:55px;text-align:center}@media print{.page{border:0;margin:0}}</style></head><body><main class="page"><header class="head"><h1>TRICYCLE FRANCHISING AND REGULATORY OFFICE</h1><p>City Government of Lucena</p></header><h2 class="title">NOTICE OF VIOLATION</h2><section class="grid"><div class="field"><b>Ticket number</b>${escapeHtml(row.ticket_number || "—")}</div><div class="field"><b>Violation date</b>${new Date(row.occurred_at).toLocaleDateString("en-PH")}</div><div class="field"><b>Name</b>${escapeHtml(row.subject_name)}</div><div class="field"><b>Classification</b>${escapeHtml(row.classification || row.subject_type)}</div><div class="field"><b>Franchise number</b>${escapeHtml(row.franchise_number || "—")}</div><div class="field"><b>Apprehending officer/s</b>${escapeHtml(row.apprehending_officers || "—")}</div></section><table><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr><tr><td>${escapeHtml(row.violation_code || "—")}</td><td>${escapeHtml(row.violation_type)}</td><td>${money.format(Number(row.penalty || 0))}</td></tr></table><p><strong>Status:</strong> ${escapeHtml(row.status)}</p><div class="sign"><p>_________________________<br>Operator / Driver</p><p>_________________________<br>TFRO Personnel</p></div></main><script>window.onload=()=>window.print()<\/script></body></html>`);
  tab.document.close();
}

function printOrderPayment(row) {
  const payment = paidPayment(row) || {};
  void openPaymentOrderPdfForm({
    payment: {
      ...payment,
      payer: row.subject_name,
      amount: payment.amount ?? netAmount(row),
    },
    violation: row,
  });
}

async function openTicketPhoto(row) {
  if (!row.ticket_photo_path) return;
  const { data, error } = await supabase.storage.from("violation-tickets").createSignedUrl(row.ticket_photo_path, 300);
  if (error) {
    window.alert(`Could not open ticket photo: ${error.message}`);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

async function loadViolations() {
  const { data, error } = await supabase
    .from("violations")
    .select("*, payments!payments_violation_id_fkey(receipt, amount, paid_at, status)")
    .order("occurred_at", { ascending: false })
    .order("paid_at", { referencedTable: "payments", ascending: false });
  if (error) {
    console.error("Could not load violations:", error);
    window.alert(`Could not load violations: ${error.message}`);
    return;
  }
  violations = data || [];
  render();
}

async function loadCatalog() {
  const { data, error } = await supabase.from("violation_catalog").select("code, violation, penalty").eq("active", true).order("code");
  if (error) throw error;
  catalog = data || [];
  document.getElementById("violationCode").innerHTML = '<option value="">Select official violation</option>' + catalog.map((item) =>
    `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} — ${escapeHtml(item.violation)} (${money.format(Number(item.penalty))})</option>`
  ).join("");
}

function applyCatalogSelection() {
  const item = catalog.find((entry) => entry.code === form.elements.violation_code.value);
  form.elements.violation_type.value = item?.violation || "";
  form.elements.penalty.value = item ? Number(item.penalty) : "";
}

function setFormMode(mode, row = null) {
  form.reset();
  editingViolationId = mode === "edit" ? row.id : null;
  document.getElementById("violationFormTitle").textContent = mode === "edit" ? "Edit Violation" : "Record Violation";
  document.getElementById("saveViolationBtn").textContent = mode === "edit" ? "Save Changes" : "Save Violation";

  if (mode === "edit") {
    form.elements.subject_name.value = row.subject_name || "";
    form.elements.subject_type.value = row.subject_type || "driver";
    form.elements.violation_code.value = row.violation_code || "";
    form.elements.violation_type.value = row.violation_type || "";
    form.elements.classification.value = row.classification || "with_franchise";
    form.elements.discounted.value = Number(row.discounted || 0).toFixed(2);
    form.elements.franchise_number.value = row.franchise_number || "";
    form.elements.ticket_number.value = row.ticket_number || "";
    form.elements.apprehending_officers.value = row.apprehending_officers || "";
    form.elements.penalty.value = Number(row.penalty || 0);
    form.elements.occurred_date.value = dateForInput(row.occurred_at);
    form.elements.status.value = row.status || "pending";
    form.elements.description.value = row.description || "";
  } else {
    form.elements.occurred_date.value = dateForInput();
    form.elements.discounted.value = "0";
    form.elements.penalty.value = "";
    form.elements.status.value = "pending";
  }

  formPanel.removeAttribute("hidden");
  document.getElementById("addViolationBtn").setAttribute("aria-expanded", "true");
  formPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  form.elements.subject_name.focus({ preventScroll: true });
}

function closeViolationForm() {
  form.reset();
  editingViolationId = null;
  formPanel.hidden = true;
  document.getElementById("addViolationBtn").setAttribute("aria-expanded", "false");
}

function readEntry() {
  const values = Object.fromEntries(new FormData(form));
  const penalty = Number(values.penalty);
  const discounted = Number(values.discounted);
  if (!values.subject_name?.trim()) throw new Error("Subject name is required.");
  if (!values.violation_code) throw new Error("Select an official violation code.");
  if (!values.violation_type?.trim()) throw new Error("Violation type is required.");
  if (!values.occurred_date) throw new Error("Violation date is required.");
  if (!Number.isFinite(penalty) || penalty < 0) throw new Error("Penalty must be zero or greater.");
  if (!Number.isFinite(discounted) || discounted < 0) throw new Error("Discounted amount must be zero or greater.");
  if (discounted > penalty) throw new Error("Discounted amount cannot be greater than the penalty.");
  return {
    subject_name: values.subject_name.trim(),
    subject_type: values.subject_type,
    violation_code: values.violation_code,
    violation_type: values.violation_type.trim(),
    classification: values.classification,
    discounted,
    franchise_number: values.franchise_number?.trim() || null,
    ticket_number: values.ticket_number?.trim() || null,
    apprehending_officers: values.apprehending_officers?.trim() || null,
    recorded_by: currentUserId,
    description: values.description?.trim() || null,
    penalty,
    status: values.status,
    occurred_at: `${values.occurred_date}T00:00:00+08:00`,
  };
}

async function saveViolation(event) {
  event.preventDefault();
  const button = document.getElementById("saveViolationBtn");
  const originalLabel = button.textContent;
  const previous = violations.find((row) => String(row.id) === String(editingViolationId));
  try {
    const entry = readEntry();
    button.disabled = true;
    button.textContent = "Saving...";

    const query = editingViolationId
      ? supabase.from("violations").update(entry).eq("id", editingViolationId)
      : supabase.from("violations").insert(entry);
    const { data: saved, error } = await query.select("*").single();
    if (error) throw error;

    if (editingViolationId) {
      violations = violations.map((row) => String(row.id) === String(saved.id) ? saved : row);
    } else {
      violations.unshift(saved);
    }
    const wasEditing = Boolean(editingViolationId);
    closeViolationForm();
    render();
    showToast(wasEditing ? "Violation updated successfully." : "Violation recorded successfully.");
    void logAudit({
      action: wasEditing ? "Updated Violation" : "Recorded Violation",
      actionType: wasEditing ? "update" : "create",
      record: saved.subject_name,
      description: `${wasEditing ? "Updated" : "Recorded"} ${saved.violation_type} violation for ${saved.subject_name} (${saved.subject_type}) with penalty ${money.format(Number(saved.penalty))}.`,
      previousValue: previous ? JSON.stringify(previous) : null,
      newValue: JSON.stringify(saved),
    });
  } catch (error) {
    console.error("Could not save violation:", error);
    window.alert(`Could not save violation: ${error.message}`);
  } finally {
    button.disabled = false;
    if (!formPanel.hidden) button.textContent = originalLabel;
  }
}

function bindEvents() {
  if (canManageViolations) {
    document.getElementById("addViolationBtn").addEventListener("click", () => setFormMode("add"));
    document.getElementById("cancelViolationBtn").addEventListener("click", closeViolationForm);
    form.addEventListener("submit", saveViolation);
    document.getElementById("violationCode").addEventListener("change", applyCatalogSelection);
  }
  document.getElementById("searchInput").addEventListener("input", render);
  document.getElementById("statusFilter").addEventListener("change", render);
  table.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = violations.find((item) => String(item.id) === String(button.dataset.id));
    if (!row) return;
    if (button.dataset.action === "edit") setFormMode("edit", row);
    if (button.dataset.action === "photo") void openTicketPhoto(row);
    if (button.dataset.action === "order") printOrderPayment(row);
    if (button.dataset.action === "notice") printNotice(row);
  });
  bindDateCsvExport({
    getRows: filteredViolations,
    render,
    filename: "tfro_violations",
    columns: [
      { header: "Violation Date", value: (row) => row.occurred_at },
      { header: "Classification", value: (row) => row.classification || row.subject_type },
      { header: "Discounted", value: (row) => Number(row.discounted || 0) },
      { header: "Name", value: (row) => row.subject_name },
      { header: "Violation", value: (row) => `${row.violation_code || ""} ${row.violation_type || ""}`.trim() },
      { header: "Date Paid", value: (row) => paidPayment(row)?.paid_at || "" },
      { header: "Ticket No.", value: (row) => row.ticket_number },
      { header: "Total Amount", value: (row) => paidPayment(row)?.amount ?? netAmount(row) },
      { header: "OR No./Receipt", value: (row) => paidPayment(row)?.receipt || "" },
      { header: "Apprehender", value: (row) => row.apprehending_officers },
    ],
  });
}

async function initialize() {
  const { user, profile } = await requireRole(["admin", "staff"]);
  if (user) {
    currentUserId = user.id;
    canManageViolations = ["admin", "staff"].includes(profile?.role);
    const isAdmin = profile?.role === "admin";
    document.getElementById("violationPortalTitle").textContent = isAdmin
      ? "Administrator — Violations"
      : "TFRO Staff — Violations";
    document.getElementById("violationPortalDescription").textContent = isAdmin
      ? "Review, encode, and update TFRO violation records"
      : "Encode tickets, issue notices, and monitor violation settlement";
    document.getElementById("addViolationBtn").hidden = !canManageViolations;
    if (!canManageViolations) formPanel.hidden = true;
    bindEvents();
    try { await Promise.all([loadCatalog(), loadViolations()]); }
    catch (error) { console.error(error); window.alert(`Could not load violation data: ${error.message}`); }
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else void initialize();
