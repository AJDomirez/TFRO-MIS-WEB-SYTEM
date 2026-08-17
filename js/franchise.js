import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";

let franchises = [];
let editingId = null;
let deleteTargetId = null;

/* ---------- Safe element access ---------- */
function el(id) { return document.getElementById(id); }

function escapeHtml(value) {
  const map = {
    "&": String.fromCharCode(38, 97, 109, 112, 59),
    "<": String.fromCharCode(38, 108, 116, 59),
    ">": String.fromCharCode(38, 103, 116, 59),
    "'": String.fromCharCode(38, 35, 48, 51, 57, 59),
    '"': String.fromCharCode(38, 113, 117, 111, 116, 59),
  };
  return String(value ?? "").replace(/[&<>'"]/g, (c) => map[c]);
}

function displayStatus(status) { return status === "active" ? "approved" : status; }

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthName(m) {
  const n = Number(m);
  return n >= 1 && n <= 12 ? MONTH_NAMES[n] : "—";
}

function formatRegistrationDate(row) {
  const m = Number(row.registration_month);
  const d = Number(row.registration_day);
  const y = Number(row.registration_year);
  if (m && d && y && MONTH_NAMES[m]) return `${MONTH_NAMES[m]} ${d}, ${y}`;
  return "—";
}

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(message) {
  const toast = el("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

/* ---------- Modal helpers ---------- */
function openModal(id) {
  const m = el(id);
  if (m) m.hidden = false;
}
function closeModal(id) {
  const m = el(id);
  if (m) m.hidden = true;
}

/* ---------- Validation ---------- */
function setFieldError(errId, input, message) {
  const span = el(errId);
  if (span) span.textContent = message || "";
  if (input) input.classList.toggle("input-invalid", !!message);
}
function clearAllErrors(prefix) {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach((s) => { s.textContent = ""; });
  document.querySelectorAll(".input-invalid").forEach((i) => i.classList.remove("input-invalid"));
}

const PHONE_RE = /^(09\d{9}|\+639\d{9}|639\d{9})$/;
const SAFE_TEXT_RE = /^[A-Za-z0-9\-\s/.,]+$/;

function validateCommon(entry, errPrefix) {
  let valid = true;

  // Fn# unique
  const dup = franchises.find((r) => r.franchise_number === entry.franchise_number && r.id !== editingId);
  if (!entry.franchise_number) {
    setFieldError(`${errPrefix}-franchise_number`, el(editingId ? "edit_franchise_number" : "franchise_number"), "Fn# is required.");
    valid = false;
  } else if (dup) {
    setFieldError(`${errPrefix}-franchise_number`, el(editingId ? "edit_franchise_number" : "franchise_number"), "This Fn# already exists. Use a unique franchise number.");
    valid = false;
  } else {
    setFieldError(`${errPrefix}-franchise_number`, el(editingId ? "edit_franchise_number" : "franchise_number"), "");
  }

  // Name required
  if (!entry.operator_name) {
    setFieldError(`${errPrefix}-operator_name`, el(editingId ? "edit_operator_name" : "operator_name"), "Name cannot be empty.");
    valid = false;
  } else {
    setFieldError(`${errPrefix}-operator_name`, el(editingId ? "edit_operator_name" : "operator_name"), "");
  }

  // Registration date validity
  const month = Number(entry.registration_month);
  const day = Number(entry.registration_day);
  const year = Number(entry.registration_year);
  let dateMsg = "";
  if (!month || month < 1 || month > 12) dateMsg = "Select a valid month (1–12).";
  else if (!day || day < 1 || day > 31) dateMsg = "Enter a valid day (1–31).";
  else if (!year || year < 1900 || year > 2100) dateMsg = "Enter a valid year (1900–2100).";
  else {
    // Real calendar check
    const maxDay = new Date(year, month, 0).getDate();
    if (day > maxDay) dateMsg = `Invalid day for ${MONTH_NAMES[month]}: only ${maxDay} days.`;
  }
  if (dateMsg) {
    setFieldError(`${errPrefix}-registration_date`, null, dateMsg);
    valid = false;
  } else {
    setFieldError(`${errPrefix}-registration_date`, null, "");
  }

  // Contact number (PH mobile)
  if (entry.contact_number && !PHONE_RE.test(entry.contact_number.trim())) {
    setFieldError(`${errPrefix}-contact_number`, el(editingId ? "edit_contact_number" : "contact_number"), "Enter a valid PH mobile number (e.g. 09123456789).");
    valid = false;
  } else {
    setFieldError(`${errPrefix}-contact_number`, el(editingId ? "edit_contact_number" : "contact_number"), "");
  }

  // Engine / Chassis / Plate — no invalid characters
  [["engine_number", "edit_engine_number", "engine_number"], ["chassis_number", "edit_chassis_number", "chassis_number"], ["plate_number", "edit_plate_number", "plate_number"]].forEach(([key, editId, addId]) => {
    const val = entry[key] || "";
    const input = el(editingId ? editId : addId);
    if (val && !SAFE_TEXT_RE.test(val)) {
      setFieldError(`${errPrefix}-${key}`, input, "Contains invalid characters. Use letters, numbers, dashes, slashes, spaces, or periods.");
      valid = false;
    } else {
      setFieldError(`${errPrefix}-${key}`, input, "");
    }
  });

  return valid;
}

/* ---------- Table rendering ---------- */
function renderTable() {
  const table = el("franchiseTable");
  const searchInput = el("searchInput");
  const statusFilter = el("statusFilter");
  if (!table) return;

  const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filter = statusFilter ? statusFilter.value : "all";

  const rows = franchises.filter((row) => {
    if (row.is_archived) return false;
    const matchesStatus = filter === "all" || displayStatus(row.status) === filter;
    if (!term) return matchesStatus;
    const searchable = [
      row.franchise_number,
      row.previous_registration,
      row.operator_name,
      row.plate_number,
      row.engine_number,
      row.chassis_number,
      row.contact_number,
      row.address,
    ].map((v) => (v || "").toLowerCase());
    return matchesStatus && searchable.some((value) => value.includes(term));
  });

  table.innerHTML = rows.length ? rows.map((row) => {
    const status = displayStatus(row.status);
    return `<tr>
      <td>${escapeHtml(row.franchise_number)}</td>
      <td>${escapeHtml(row.previous_registration) || "—"}</td>
      <td>${escapeHtml(row.operator_name)}</td>
      <td>${formatRegistrationDate(row)}</td>
      <td>${escapeHtml(monthName(row.registration_month))}</td>
      <td>${escapeHtml(row.registration_day) || "—"}</td>
      <td>${escapeHtml(row.registration_year) || "—"}</td>
      <td>${escapeHtml(row.address) || "—"}</td>
      <td>${escapeHtml(row.engine_number) || "—"}</td>
      <td>${escapeHtml(row.chassis_number) || "—"}</td>
      <td>${escapeHtml(row.plate_number) || "—"}</td>
      <td>${escapeHtml(row.contact_number) || "—"}</td>
      <td>
        <div class="actions">
          <button data-action="view" data-id="${row.id}" title="View"><i class="ri-eye-line"></i></button>
          <button data-action="edit" data-id="${row.id}" title="Edit"><i class="ri-pencil-line"></i></button>
          <button data-action="delete" data-id="${row.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("") : '<tr><td colspan="13">No franchise records found.</td></tr>';
}

async function loadFranchises() {
  const { data, error } = await supabase.from("franchises").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showToast("Could not load franchises. Check database setup.");
    return;
  }
  franchises = data || [];
  renderTable();
}

async function verifyAccess() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return window.location.replace("index.html");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", sessionData.session.user.id).single();
  if (!profile || !["admin", "staff"].includes(profile.role)) { await supabase.auth.signOut(); return window.location.replace("index.html"); }
  await loadFranchises();
}

/* ---------- Add form ---------- */
function readAddForm() {
  const form = el("franchiseForm");
  const entry = Object.fromEntries(new FormData(form));
  return {
    franchise_number: (entry.franchise_number || "").trim(),
    previous_registration: (entry.previous_registration || "").trim(),
    operator_name: (entry.operator_name || "").trim(),
    registration_month: entry.registration_month ? Number(entry.registration_month) : null,
    registration_day: entry.registration_day ? Number(entry.registration_day) : null,
    registration_year: entry.registration_year ? Number(entry.registration_year) : null,
    address: (entry.address || "").trim(),
    engine_number: (entry.engine_number || "").trim().toUpperCase(),
    chassis_number: (entry.chassis_number || "").trim().toUpperCase(),
    plate_number: (entry.plate_number || "").trim().toUpperCase(),
    contact_number: (entry.contact_number || "").trim(),
    route: (entry.route || "").trim(),
    application_type: entry.application_type || "new",
    application_date: entry.application_date || null,
    expiration_date: entry.expiration_date || null,
    status: entry.status || "pending",
  };
}

function resetAddForm() {
  const form = el("franchiseForm");
  if (form) form.reset();
}

function openAddForm() {
  editingId = null;
  resetAddForm();
  clearAllErrors("err-");
  const formTitle = el("formTitle");
  const saveBtn = el("saveBtn");
  if (formTitle) formTitle.textContent = "Add Franchise";
  if (saveBtn) saveBtn.textContent = "Save Franchise";
  const panel = el("applicationPanel");
  if (panel) {
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function onAddSubmit(event) {
  event.preventDefault();
  clearAllErrors("err-");
  const entry = readAddForm();
  if (!validateCommon(entry, "err")) return;

  supabase.from("franchises").insert({ ...entry, is_archived: false }).then(({ error }) => {
    if (error) {
      if (error.code === "23505") {
        setFieldError("err-franchise_number", el("franchise_number"), "This Fn# already exists. Use a unique franchise number.");
      } else {
        alert(`Could not save franchise: ${error.message}`);
      }
      return;
    }
    resetAddForm();
    const panel = el("applicationPanel");
    if (panel) panel.hidden = true;
    loadFranchises();
    showToast("Franchise added successfully.");
    logAudit({
      action: "Created Franchise",
      actionType: "create",
      record: entry.franchise_number,
      description: `Created franchise record ${entry.franchise_number} for ${entry.operator_name}.`,
    });
  });
}

/* ---------- View modal ---------- */
function showView(row) {
  const items = [
    ["Fn#", row.franchise_number],
    ["Previous Registration", row.previous_registration || "—"],
    ["Name", row.operator_name],
    ["Date of Registration", formatRegistrationDate(row)],
    ["Month", monthName(row.registration_month)],
    ["Day", row.registration_day || "—"],
    ["Year", row.registration_year || "—"],
    ["Address", row.address || "—"],
    ["Engine No.", row.engine_number || "—"],
    ["Chassis No.", row.chassis_number || "—"],
    ["Plate No.", row.plate_number || "—"],
    ["Contact Number", row.contact_number || "—"],
  ];
  const viewBody = el("viewBody");
  if (viewBody) {
    viewBody.innerHTML = items
      .map(([label, value]) => `<div class="detail-row"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value">${escapeHtml(value)}</div></div>`)
      .join("");
  }
  openModal("viewModal");
}

/* ---------- Edit modal ---------- */
function openEditForm(row) {
  editingId = row.id;
  clearAllErrors("err-edit-");
  el("edit_franchise_number").value = row.franchise_number || "";
  el("edit_previous_registration").value = row.previous_registration || "";
  el("edit_operator_name").value = row.operator_name || "";
  el("edit_registration_month").value = row.registration_month || "";
  el("edit_registration_day").value = row.registration_day || "";
  el("edit_registration_year").value = row.registration_year || "";
  el("edit_address").value = row.address || "";
  el("edit_engine_number").value = row.engine_number || "";
  el("edit_chassis_number").value = row.chassis_number || "";
  el("edit_plate_number").value = row.plate_number || "";
  el("edit_contact_number").value = row.contact_number || "";
  openModal("editModal");
}

function readEditForm() {
  return {
    franchise_number: el("edit_franchise_number").value.trim(),
    previous_registration: el("edit_previous_registration").value.trim(),
    operator_name: el("edit_operator_name").value.trim(),
    registration_month: el("edit_registration_month").value ? Number(el("edit_registration_month").value) : null,
    registration_day: el("edit_registration_day").value ? Number(el("edit_registration_day").value) : null,
    registration_year: el("edit_registration_year").value ? Number(el("edit_registration_year").value) : null,
    address: el("edit_address").value.trim(),
    engine_number: el("edit_engine_number").value.trim().toUpperCase(),
    chassis_number: el("edit_chassis_number").value.trim().toUpperCase(),
    plate_number: el("edit_plate_number").value.trim().toUpperCase(),
    contact_number: el("edit_contact_number").value.trim(),
  };
}

function onEditSubmit(event) {
  event.preventDefault();
  clearAllErrors("err-edit-");
  const entry = readEditForm();
  if (!validateCommon(entry, "err-edit")) return;

  supabase.from("franchises").update(entry).eq("id", editingId).then(({ error }) => {
    if (error) {
      if (error.code === "23505") {
        setFieldError("err-edit-franchise_number", el("edit_franchise_number"), "This Fn# already exists. Use a unique franchise number.");
      } else {
        alert(`Could not update franchise: ${error.message}`);
      }
      return;
    }
closeModal("editModal");
    editingId = null;
    loadFranchises();
    showToast("Franchise updated successfully.");
    logAudit({
      action: "Updated Franchise",
      actionType: "update",
      record: entry.franchise_number,
      description: `Updated franchise record ${entry.franchise_number}.`,
    });
  });
}

/* ---------- Delete modal ---------- */
function openDeleteModal(row) {
  deleteTargetId = row.id;
  const msg = el("deleteMessage");
  if (msg) msg.textContent = `Are you sure you want to delete franchise ${row.franchise_number}? This action cannot be undone.`;
  openModal("deleteModal");
}

function confirmDelete() {
  if (!deleteTargetId) { closeModal("deleteModal"); return; }
  const target = franchises.find((r) => String(r.id) === String(deleteTargetId));
  supabase.from("franchises").delete().eq("id", deleteTargetId).then(({ error }) => {
    if (error) {
      alert(`Could not delete franchise: ${error.message}`);
      return;
    }
    deleteTargetId = null;
    closeModal("deleteModal");
    loadFranchises();
    showToast("Franchise record deleted.");
    logAudit({
      action: "Deleted Franchise",
      actionType: "delete",
      record: target ? target.franchise_number : null,
      description: target
        ? `Deleted franchise record ${target.franchise_number} for ${target.operator_name}.`
        : "Deleted a franchise record.",
    });
  });
}

/* ---------- Table actions ---------- */
function onTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  // dataset values are strings; row.id comes from Supabase as a number/bigint,
  // so compare them as strings to avoid strict type mismatch.
  const row = franchises.find((r) => String(r.id) === String(button.dataset.id));
  if (!row) return;
  const action = button.dataset.action;
  if (action === "view") showView(row);
  else if (action === "edit") openEditForm(row);
  else if (action === "delete") openDeleteModal(row);
}

/* ---------- Event bindings ---------- */
function bindEvents() {
  el("newApplicationBtn")?.addEventListener("click", openAddForm);
  el("cancelApplicationBtn")?.addEventListener("click", () => { resetAddForm(); const p = el("applicationPanel"); if (p) p.hidden = true; editingId = null; });
  el("franchiseForm")?.addEventListener("submit", onAddSubmit);
  el("editForm")?.addEventListener("submit", onEditSubmit);
  el("confirmDeleteBtn")?.addEventListener("click", confirmDelete);

  el("franchiseTable")?.addEventListener("click", onTableClick);
  el("searchInput")?.addEventListener("input", renderTable);
  el("statusFilter")?.addEventListener("change", renderTable);

  // Close buttons (data-close="modalId")
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = el(btn.dataset.close);
      if (m) m.hidden = true;
      if (btn.dataset.close === "editModal") editingId = null;
      if (btn.dataset.close === "deleteModal") deleteTargetId = null;
    });
  });

  // Close on backdrop click
  ["viewModal", "editModal", "deleteModal"].forEach((id) => {
    el(id)?.addEventListener("click", (e) => {
      if (e.target === el(id)) { el(id).hidden = true; if (id === "editModal") editingId = null; if (id === "deleteModal") deleteTargetId = null; }
    });
  });

  el("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });
}

function init() {
  bindEvents();
  verifyAccess();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
