import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";
import { bindDateCsvExport, isWithinDateRange } from "./csv-export.js";
import { openPaymentOrderPdfForm, openUnitReleasePdfForm } from "./pdf-form.js?v=20260831-3";
import { sendOperatorForm } from "./form-delivery.js";

let violations = [];
let catalog = [];
let currentUserId = null;
let editingViolationId = null;
let toastTimer = null;
let canManageViolations = false;
let canEditPdfFields = false;
let ticketPhotoObjectUrl = "";
let ticketPhotoFilename = "ticket-image.jpg";

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
      <td>${row.ticket_photo_path
        ? `<button type="button" class="photo-link" data-action="photo" data-id="${row.id}" title="View ticket image submitted by the Traffic Enforcer"><i class="ri-image-line"></i> View Ticket Image</button>`
        : '<span class="ticket-image-missing">No image submitted</span>'}</td>
      <td><div class="actions">
        ${canManageViolations ? `<button type="button" data-action="edit" data-id="${row.id}" title="Edit violation" aria-label="Edit violation for ${escapeHtml(row.subject_name || "record")}">
          <i class="ri-pencil-line"></i>
        </button>` : ""}
        <button type="button" data-action="order" data-id="${row.id}" title="View TFRO-009 Order of Payment"><i class="ri-file-pdf-2-line"></i></button>
        ${payment
          ? `<button type="button" class="release-action" data-action="release" data-id="${row.id}" title="View and print TFRO-010 Vehicle/Unit Releasing Slip"><i class="ri-file-check-line"></i><span>Vehicle Release</span></button>`
          : !canEditPdfFields && row.status === "pending" && row.treasurer_receipt_path
            ? `<button type="button" class="payment-action" data-action="record-payment" data-id="${row.id}" title="Verify the submitted Treasurer receipt, record payment, and enter vehicle-release details"><i class="ri-money-peso-circle-line"></i><span>Record Payment & Release</span></button>`
            : !canEditPdfFields && row.status === "pending"
              ? `<span class="workflow-waiting" title="The Operator must submit the City Treasurer receipt before payment can be recorded"><i class="ri-time-line"></i> Awaiting receipt</span>`
              : ""}
      </div></td>
    </tr>`;
  }).join("") : '<tr><td colspan="12">No violations found.</td></tr>';
}

function printNotice(row) {
  const tab = window.open("", "_blank");
  if (!tab) return window.alert("Please allow pop-ups to print the violation notice.");
  tab.document.write(`<!doctype html><html><head><title>Violation Notice ${escapeHtml(row.ticket_number || "")}</title><style>body{font-family:Arial,sans-serif;color:#172033}.page{max-width:760px;margin:25px auto;border:1px solid #aebbb5;padding:28px}.head{border-top:12px solid #123f73;border-bottom:5px solid #f4c430;padding:16px 0}.head h1{font-size:20px;margin:0}.title{text-align:center;letter-spacing:4px;text-decoration:underline;margin:30px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{border-bottom:1px solid #555;padding:8px 0}.field b{display:block;font-size:11px;color:#5b6870;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{border:1px solid #555;padding:10px;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:55px;text-align:center}@media print{.page{border:0;margin:0}}</style></head><body><main class="page"><header class="head"><h1>TRICYCLE FRANCHISING AND REGULATORY OFFICE</h1><p>City Government of Lucena</p></header><h2 class="title">NOTICE OF VIOLATION</h2><section class="grid"><div class="field"><b>Ticket number</b>${escapeHtml(row.ticket_number || "—")}</div><div class="field"><b>Violation date</b>${new Date(row.occurred_at).toLocaleDateString("en-PH")}</div><div class="field"><b>Name</b>${escapeHtml(row.subject_name)}</div><div class="field"><b>Classification</b>${escapeHtml(row.classification || row.subject_type)}</div><div class="field"><b>Franchise number</b>${escapeHtml(row.franchise_number || "—")}</div><div class="field"><b>Apprehending officer/s</b>${escapeHtml(row.apprehending_officers || "—")}</div></section><table><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr><tr><td>${escapeHtml(row.violation_code || "—")}</td><td>${escapeHtml(row.violation_type)}</td><td>${money.format(Number(row.penalty || 0))}</td></tr></table><p><strong>Status:</strong> ${escapeHtml(row.status)}</p><div class="sign"><p>_________________________<br>Operator / Driver</p><p>_________________________<br>TFRO Personnel</p></div></main><script>window.onload=()=>window.print()<\/script></body></html>`);
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
    editable: canEditPdfFields,
    onSend: canEditPdfFields && payment.id ? () => sendOperatorForm({
      formCode: "TFRO-009",
      recordType: "payment",
      recordId: payment.id,
      recordLabel: payment.receipt || payment.id,
    }) : null,
  });
}

function openVehicleReleaseSlip(row) {
  const payment = paidPayment(row);
  if (!payment) return window.alert("TFRO-010 is available after TFRO Staff records the payment and releasing details.");
  void openUnitReleasePdfForm({
    payment,
    violation: row,
    editable: canEditPdfFields,
    onSend: canEditPdfFields ? () => sendOperatorForm({
      formCode: "TFRO-010",
      recordType: "payment",
      recordId: payment.id,
      recordLabel: payment.receipt || payment.id,
    }) : null,
  });
}

async function openTicketPhoto(row) {
  if (!row.ticket_photo_path) return;
  const modal = document.getElementById("ticketPhotoModal");
  const image = document.getElementById("ticketPhotoImage");
  const status = document.getElementById("ticketPhotoStatus");
  const controls = [document.getElementById("saveTicketPhotoBtn"), document.getElementById("printTicketPhotoBtn")];
  document.getElementById("ticketPhotoTitle").textContent = `Ticket ${row.ticket_number || row.id}`;
  status.textContent = "Loading ticket imageâ€¦";
  status.hidden = false;
  image.hidden = true;
  controls.forEach((control) => { control.disabled = true; });
  modal.hidden = false;
  document.body.classList.add("ticket-photo-open");
  const { data, error } = await supabase.storage.from("violation-tickets").createSignedUrl(row.ticket_photo_path, 300);
  if (error) {
    status.textContent = `Could not open ticket photo: ${error.message}`;
    return;
  }
  try {
    const response = await fetch(data.signedUrl);
    if (!response.ok) throw new Error(`Image request failed (${response.status})`);
    const blob = await response.blob();
    if (ticketPhotoObjectUrl) URL.revokeObjectURL(ticketPhotoObjectUrl);
    ticketPhotoObjectUrl = URL.createObjectURL(blob);
    ticketPhotoFilename = `ticket-${String(row.ticket_number || row.id).replace(/[^a-zA-Z0-9._-]/g, "-")}.${blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg"}`;
    image.src = ticketPhotoObjectUrl;
    image.hidden = false;
    status.hidden = true;
    controls.forEach((control) => { control.disabled = false; });
  } catch (fetchError) {
    status.textContent = `Could not load ticket photo: ${fetchError.message}`;
  }
}

function closeTicketPhoto() {
  document.getElementById("ticketPhotoModal").hidden = true;
  document.body.classList.remove("ticket-photo-open");
}

function saveTicketPhoto() {
  if (!ticketPhotoObjectUrl) return;
  const link = document.createElement("a");
  link.href = ticketPhotoObjectUrl;
  link.download = ticketPhotoFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadViolations() {
  const { data, error } = await supabase
    .from("violations")
    .select("*, payments!payments_violation_id_fkey(*)")
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
  document.getElementById("violationChecklist").innerHTML = catalog.map((item) => `
    <label class="violation-check-option"><input type="checkbox" name="violation_codes" value="${escapeHtml(item.code)}"><span><strong>${escapeHtml(item.code)}</strong>${escapeHtml(item.violation)}<b>${money.format(Number(item.penalty))}</b></span></label>`
  ).join("");
}

function applyCatalogSelection() {
  const selected = [...form.querySelectorAll('input[name="violation_codes"]:checked')]
    .map((input) => catalog.find((entry) => entry.code === input.value)).filter(Boolean);
  form.elements.penalty.value = selected.length ? selected.reduce((sum, item) => sum + Number(item.penalty || 0), 0).toFixed(2) : "";
}

function setFormMode(mode, row = null) {
  form.reset();
  editingViolationId = mode === "edit" ? row.id : null;
  document.getElementById("violationFormTitle").textContent = mode === "edit" ? "Edit Violation" : "Record Violation";
  document.getElementById("saveViolationBtn").textContent = mode === "edit" ? "Save Changes" : "Save Selected Violations";

  if (mode === "edit") {
    form.elements.subject_name.value = row.subject_name || "";
    form.elements.subject_type.value = row.subject_type || "driver";
    const selectedCode = [...form.querySelectorAll('input[name="violation_codes"]')]
      .find((input) => input.value === row.violation_code);
    if (selectedCode) selectedCode.checked = true;
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

function readEntries() {
  const values = Object.fromEntries(new FormData(form));
  const discounted = Number(values.discounted);
  const selected = [...form.querySelectorAll('input[name="violation_codes"]:checked')]
    .map((input) => catalog.find((item) => item.code === input.value)).filter(Boolean);
  if (!values.subject_name?.trim()) throw new Error("Subject name is required.");
  if (!selected.length) throw new Error("Select at least one official violation.");
  if (editingViolationId && selected.length !== 1) throw new Error("Select exactly one violation when editing.");
  if (!values.occurred_date) throw new Error("Violation date is required.");
  if (!Number.isFinite(discounted) || discounted < 0) throw new Error("Discounted amount must be zero or greater.");
  const base = {
    subject_name: values.subject_name.trim(),
    subject_type: values.subject_type,
    classification: values.classification,
    franchise_number: values.franchise_number?.trim() || null,
    ticket_number: values.ticket_number?.trim() || null,
    apprehending_officers: values.apprehending_officers?.trim() || null,
    recorded_by: currentUserId,
    description: values.description?.trim() || null,
    status: values.status,
    occurred_at: `${values.occurred_date}T00:00:00+08:00`,
  };
  return selected.map((item) => ({ ...base, violation_code: item.code,
    violation_type: item.violation, penalty: Number(item.penalty || 0),
    discounted: selected.length === 1 ? discounted : 0 }));
}

async function saveViolation(event) {
  event.preventDefault();
  const button = event.submitter || document.getElementById("saveViolationBtn");
  const submitButtons = [...form.querySelectorAll('button[type="submit"]')];
  const originalLabel = button.textContent;
  const previous = violations.find((row) => String(row.id) === String(editingViolationId));
  try {
    const entries = readEntries();
    submitButtons.forEach((submitButton) => { submitButton.disabled = true; });
    button.textContent = "Saving...";

    const query = editingViolationId
      ? supabase.from("violations").update(entries[0]).eq("id", editingViolationId)
      : supabase.from("violations").insert(entries);
    const { data: savedRows, error } = await query.select("*");
    if (error) throw error;
    const saved = savedRows[0];

    if (editingViolationId) {
      violations = violations.map((row) => String(row.id) === String(saved.id) ? saved : row);
    } else {
      violations.unshift(...savedRows);
    }
    const wasEditing = Boolean(editingViolationId);
    closeViolationForm();
    render();
    showToast(wasEditing
      ? "Violation updated successfully."
      : `${savedRows.length} violation${savedRows.length === 1 ? "" : "s"} recorded separately.`);
    void logAudit({
      action: wasEditing ? "Updated Violation" : "Recorded Violation",
      actionType: wasEditing ? "update" : "create",
      record: saved.subject_name,
      description: `${wasEditing ? "Updated" : "Recorded"} ${savedRows.length} separate violation record(s) for ${saved.subject_name} (${saved.subject_type}).`,
      previousValue: previous ? JSON.stringify(previous) : null,
      newValue: JSON.stringify(saved),
    });
  } catch (error) {
    console.error("Could not save violation:", error);
    window.alert(`Could not save violation: ${error.message}`);
  } finally {
    submitButtons.forEach((submitButton) => { submitButton.disabled = false; });
    button.textContent = originalLabel;
  }
}

function bindEvents() {
  if (canManageViolations) {
    document.getElementById("addViolationBtn").addEventListener("click", () => setFormMode("add"));
    document.getElementById("cancelViolationBtn").addEventListener("click", closeViolationForm);
    form.addEventListener("submit", saveViolation);
    document.getElementById("violationChecklist").addEventListener("change", applyCatalogSelection);
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
    if (button.dataset.action === "record-payment") window.location.href = `payment.html?violation=${encodeURIComponent(row.id)}`;
    if (button.dataset.action === "order") printOrderPayment(row);
    if (button.dataset.action === "release") openVehicleReleaseSlip(row);
  });
  document.getElementById("closeTicketPhotoBtn").addEventListener("click", closeTicketPhoto);
  document.getElementById("cancelTicketPhotoBtn").addEventListener("click", closeTicketPhoto);
  document.getElementById("saveTicketPhotoBtn").addEventListener("click", saveTicketPhoto);
  document.getElementById("printTicketPhotoBtn").addEventListener("click", () => window.print());
  document.getElementById("ticketPhotoModal").addEventListener("click", (event) => {
    if (event.target.id === "ticketPhotoModal") closeTicketPhoto();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("ticketPhotoModal").hidden) closeTicketPhoto();
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
    canEditPdfFields = isAdmin;
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
