import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";
import { bindDateCsvExport, isWithinDateRange } from "./csv-export.js";

let violations = [];
let editingViolationId = null;
let toastTimer = null;

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
    && [row.subject_name || "", row.violation_type || "", row.description || ""]
      .some((value) => value.toLowerCase().includes(term)));
}

function render() {
  const rows = filteredViolations();
  table.innerHTML = rows.length ? rows.map((row) => {
    const subjectType = ["driver", "operator"].includes(row.subject_type) ? row.subject_type : "";
    const status = ["pending", "paid", "dismissed"].includes(row.status) ? row.status : "";
    return `<tr>
      <td>${escapeHtml(row.subject_name || "—")}</td>
      <td><span class="type ${subjectType}">${escapeHtml(row.subject_type || "—")}</span></td>
      <td>${escapeHtml(row.violation_type)}</td>
      <td>${money.format(Number(row.penalty || 0))}</td>
      <td>${new Date(row.occurred_at).toLocaleDateString("en-PH")}</td>
      <td><span class="status ${status}">${escapeHtml(row.status)}</span></td>
      <td><div class="actions">
        <button type="button" data-action="edit" data-id="${row.id}" title="Edit violation" aria-label="Edit violation for ${escapeHtml(row.subject_name || "record")}">
          <i class="ri-pencil-line"></i>
        </button>
      </div></td>
    </tr>`;
  }).join("") : '<tr><td colspan="7">No violations found.</td></tr>';
}

async function loadViolations() {
  const { data, error } = await supabase
    .from("violations")
    .select("*")
    .order("occurred_at", { ascending: false });
  if (error) {
    console.error("Could not load violations:", error);
    window.alert(`Could not load violations: ${error.message}`);
    return;
  }
  violations = data || [];
  render();
}

function setFormMode(mode, row = null) {
  form.reset();
  editingViolationId = mode === "edit" ? row.id : null;
  document.getElementById("violationFormTitle").textContent = mode === "edit" ? "Edit Violation" : "Record Violation";
  document.getElementById("saveViolationBtn").textContent = mode === "edit" ? "Save Changes" : "Save Violation";

  if (mode === "edit") {
    form.elements.subject_name.value = row.subject_name || "";
    form.elements.subject_type.value = row.subject_type || "driver";
    form.elements.violation_type.value = row.violation_type || "";
    form.elements.penalty.value = Number(row.penalty || 0);
    form.elements.occurred_date.value = dateForInput(row.occurred_at);
    form.elements.status.value = row.status || "pending";
    form.elements.description.value = row.description || "";
  } else {
    form.elements.occurred_date.value = dateForInput();
    form.elements.penalty.value = "0";
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
  if (!values.subject_name?.trim()) throw new Error("Subject name is required.");
  if (!values.violation_type?.trim()) throw new Error("Violation type is required.");
  if (!values.occurred_date) throw new Error("Violation date is required.");
  if (!Number.isFinite(penalty) || penalty < 0) throw new Error("Penalty must be zero or greater.");
  return {
    subject_name: values.subject_name.trim(),
    subject_type: values.subject_type,
    violation_type: values.violation_type.trim(),
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
  document.getElementById("addViolationBtn").addEventListener("click", () => setFormMode("add"));
  document.getElementById("cancelViolationBtn").addEventListener("click", closeViolationForm);
  document.getElementById("searchInput").addEventListener("input", render);
  document.getElementById("statusFilter").addEventListener("change", render);
  table.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='edit']");
    if (!button) return;
    const row = violations.find((item) => String(item.id) === String(button.dataset.id));
    if (row) setFormMode("edit", row);
  });
  form.addEventListener("submit", saveViolation);

  bindDateCsvExport({
    getRows: filteredViolations,
    render,
    filename: "tfro_violations",
    columns: [
      { header: "Violation Date", value: (row) => row.occurred_at },
      { header: "Subject Classification", value: (row) => row.subject_type },
      { header: "Name", value: (row) => row.subject_name },
      { header: "Violation", value: (row) => row.violation_type },
      { header: "Description", value: (row) => row.description },
      { header: "Penalty", value: (row) => row.penalty },
      { header: "Status", value: (row) => row.status },
      { header: "Created At", value: (row) => row.created_at },
    ],
  });
}

async function initialize() {
  bindEvents();
  const { user } = await requireRole(["admin", "staff"]);
  if (user) await loadViolations();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else void initialize();
