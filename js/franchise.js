import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";
import { bindDateCsvExport, isWithinDateRange } from "./csv-export.js";

let franchises = [];
let operatorAccounts = [];
let editingId = null;
let deleteTargetId = null;
let preparedCsvImport = [];

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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function ageFromBirthDate(value) {
  if (!value) return "—";
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) return "—";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
  return String(age);
}

function expirationThreeYearsAfter(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${String(year + 3).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayForInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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

  const driverContactInput = el(editingId ? "edit_driver_contact_number" : "driver_contact_number");
  if (entry.driver_contact_number && !PHONE_RE.test(entry.driver_contact_number.trim())) {
    setFieldError(`${errPrefix}-driver_contact_number`, driverContactInput, "Enter a valid PH mobile number.");
    valid = false;
  } else {
    setFieldError(`${errPrefix}-driver_contact_number`, driverContactInput, "");
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
function filteredFranchises() {
  const searchInput = el("searchInput");
  const statusFilter = el("statusFilter");
  const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filter = statusFilter ? statusFilter.value : "all";
  return franchises.filter((row) => {
    if (row.is_archived) return false;
    if (!isWithinDateRange(row.application_date || row.created_at)) return false;
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
      row.birth_place,
      row.barangay_clearance_cedula,
      row.motorcycle_brand,
      row.toda_name,
      row.official_receipt_number,
      row.driver_name,
      row.driver_contact_number,
    ].map((v) => (v || "").toLowerCase());
    return matchesStatus && searchable.some((value) => value.includes(term));
  });
}

function renderTable() {
  const table = el("franchiseTable");
  if (!table) return;
  const rows = filteredFranchises();

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
      <td>${escapeHtml(formatDate(row.previous_mtop_expiration))}</td>
      <td>${escapeHtml(formatDate(row.expiration_date))}</td>
      <td>${escapeHtml(row.address) || "—"}</td>
      <td>${escapeHtml(ageFromBirthDate(row.birth_date))}</td>
      <td>${escapeHtml(row.birth_place) || "—"}</td>
      <td>${escapeHtml(formatDate(row.birth_date))}</td>
      <td>${escapeHtml(row.civil_status) || "—"}</td>
      <td>${escapeHtml(row.barangay_clearance_cedula) || "—"}</td>
      <td>${escapeHtml(row.motorcycle_brand) || "—"}</td>
      <td>${escapeHtml(row.motorcycle_year_model) || "—"}</td>
      <td>${escapeHtml(row.engine_number) || "—"}</td>
      <td>${escapeHtml(row.engine_cr_number) || "—"}</td>
      <td>${escapeHtml(row.chassis_number) || "—"}</td>
      <td>${escapeHtml(row.chassis_cr_number) || "—"}</td>
      <td>${escapeHtml(row.plate_number) || "—"}</td>
      <td>${escapeHtml(row.contact_number) || "—"}</td>
      <td>${escapeHtml(row.toda_name) || "—"}</td>
      <td>${escapeHtml(row.official_receipt_number) || "—"}</td>
      <td>${escapeHtml(row.driver_name) || "—"}</td>
      <td>${escapeHtml(row.driver_contact_number) || "—"}</td>
      <td>
        <div class="actions">
          <button data-action="view" data-id="${row.id}" title="View"><i class="ri-eye-line"></i></button>
          <button data-action="edit" data-id="${row.id}" title="Edit"><i class="ri-pencil-line"></i></button>
          <button data-action="delete" data-id="${row.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("") : '<tr><td colspan="28">No franchise records found.</td></tr>';
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
  const selector = el("edit_record_selector");
  if (selector) {
    selector.innerHTML = '<option value="">Select a franchise...</option>' + franchises.map((row) =>
      `<option value="${row.id}">${escapeHtml(row.franchise_number)} — ${escapeHtml(row.operator_name || "No operator")}</option>`
    ).join("");
  }
}

async function loadOperatorAccounts() {
  const { data, error } = await supabase
    .from("operators")
    .select("user_id, full_name, email, franchise_number, verified, status")
    .not("user_id", "is", null)
    .order("full_name");
  if (error) throw error;
  const seen = new Set();
  operatorAccounts = (data || []).filter((row) => {
    if (seen.has(row.user_id)) return false;
    seen.add(row.user_id);
    return true;
  });
  const options = '<option value="">Not linked</option>' + operatorAccounts.map((row) =>
    `<option value="${escapeHtml(row.user_id)}">${escapeHtml(row.full_name)}</option>`
  ).join("");
  if (el("operator_id")) el("operator_id").innerHTML = options;
  if (el("edit_operator_id")) el("edit_operator_id").innerHTML = options;
}

/* ---------- CSV import ---------- */
const CSV_FIELDS = Object.freeze({
  franchise_number: ["franchisenumber", "fn", "fnnumber"],
  previous_registration: ["previousregistration"],
  operator_name: ["operatorname", "name", "registeredoperator", "franchiseowner"],
  operator_email: ["operatoremail", "email"],
  operator_id: ["operatoraccountid", "operatorid", "userid"],
  registration_date: ["registrationdate", "dateofregistration"],
  registration_month: ["registrationmonth", "month"],
  registration_day: ["registrationday", "day"],
  registration_year: ["registrationyear", "year"],
  application_date: ["applicationdate"],
  previous_mtop_expiration: ["previousmtopexpiry", "previousmtopexpiration"],
  expiration_date: ["expirationdate", "currentmtopexpiry", "currentmtopexpiration"],
  address: ["address"], birth_date: ["birthdate"], birth_place: ["birthplace"],
  civil_status: ["civilstatus"], barangay_clearance_cedula: ["barangayclearancecedula", "cedula"],
  contact_number: ["contactnumber", "operatorcontact"], motorcycle_brand: ["motorcyclebrandmodel", "motorcyclebrand", "brandmodel"],
  motorcycle_year_model: ["motorcycleyearmodel", "yearmodel"], engine_number: ["enginenumber", "engineno"],
  engine_cr_number: ["enginenumbercr", "enginenocr"], chassis_number: ["chassisnumber", "chassisno"],
  chassis_cr_number: ["chassisnumbercr", "chassisnocr"], plate_number: ["platenumber", "plateno"],
  toda_name: ["todaname", "toda"], official_receipt_number: ["officialreceiptnumber", "ornumber"],
  driver_name: ["drivername"], driver_contact_number: ["drivercontact", "drivercontactnumber"],
  route: ["route"], status: ["status"],
});

function normalizeCsvHeader(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell.trim()); cell = ""; }
    else if (character === "\n") { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (character !== "\r") cell += character;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted value.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    // Validate calendar components in local time. Comparing toISOString() here
    // shifts Philippine midnight to the previous UTC date and rejects valid CSVs.
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const valid = date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;
    return valid ? text : null;
  }
  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    const result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return csvDate(result);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function csvValue(record, field) {
  const aliases = CSV_FIELDS[field] || [];
  const key = Object.keys(record).find((header) => aliases.includes(header));
  return key === undefined ? undefined : String(record[key] || "").trim();
}

function findCsvOperator(accountId, email, name) {
  if (accountId) return operatorAccounts.filter((account) => account.user_id.toLowerCase() === accountId.toLowerCase());
  if (email) return operatorAccounts.filter((account) => String(account.email || "").toLowerCase() === email.toLowerCase());
  if (name) return operatorAccounts.filter((account) => String(account.full_name || "").trim().toLowerCase() === name.trim().toLowerCase());
  return [];
}

function buildCsvPreview(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV must contain a header row and at least one data row.");
  const headers = rows[0].map(normalizeCsvHeader);
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column headings.");
  const existingByNumber = new Map(franchises.map((item) => [String(item.franchise_number || "").toUpperCase(), item]));
  const seen = new Set(), errors = [], preview = [];

  rows.slice(1).forEach((cells, rowIndex) => {
    const csvRowNumber = rowIndex + 2;
    const raw = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const franchiseNumber = String(csvValue(raw, "franchise_number") || "").trim().toUpperCase();
    const operatorName = String(csvValue(raw, "operator_name") || "").trim();
    if (!franchiseNumber) errors.push(`Row ${csvRowNumber}: Franchise Number is required.`);
    if (!operatorName) errors.push(`Row ${csvRowNumber}: Operator Name is required.`);
    if (franchiseNumber && seen.has(franchiseNumber)) errors.push(`Row ${csvRowNumber}: duplicate Franchise Number ${franchiseNumber} in this file.`);
    seen.add(franchiseNumber);

    const existing = existingByNumber.get(franchiseNumber);
    const registrationDateText = csvValue(raw, "registration_date");
    const registrationDate = csvDate(registrationDateText);
    let registrationMonth = Number(csvValue(raw, "registration_month") || registrationDate?.slice(5, 7) || existing?.registration_month || 0);
    let registrationDay = Number(csvValue(raw, "registration_day") || registrationDate?.slice(8, 10) || existing?.registration_day || 0);
    let registrationYear = Number(csvValue(raw, "registration_year") || registrationDate?.slice(0, 4) || existing?.registration_year || 0);
    const maxDay = registrationMonth >= 1 && registrationMonth <= 12 ? new Date(registrationYear, registrationMonth, 0).getDate() : 0;
    if (registrationDateText && !registrationDate) errors.push(`Row ${csvRowNumber}: Registration Date is invalid.`);
    if (!registrationMonth || !registrationDay || !registrationYear || registrationYear < 1900 || registrationYear > 2100 || registrationDay > maxDay) {
      errors.push(`Row ${csvRowNumber}: provide a valid Registration Date (or Month, Day, and Year).`);
    }

    const operatorEmail = csvValue(raw, "operator_email") || "";
    const suppliedOperatorId = csvValue(raw, "operator_id") || "";
    const matches = findCsvOperator(suppliedOperatorId, operatorEmail, operatorName);
    if ((suppliedOperatorId || operatorEmail) && matches.length !== 1) errors.push(`Row ${csvRowNumber}: the supplied operator account was not found or is not unique.`);
    if (!suppliedOperatorId && !operatorEmail && matches.length > 1) errors.push(`Row ${csvRowNumber}: Operator Name matches multiple accounts; add Operator Email.`);
    const linkedOperatorId = matches.length === 1 ? matches[0].user_id : (existing?.operator_id || null);

    const dateField = (field, fallback = null) => {
      const supplied = csvValue(raw, field);
      if (supplied === undefined) return fallback;
      const parsed = csvDate(supplied);
      if (supplied && !parsed) errors.push(`Row ${csvRowNumber}: ${field.replaceAll("_", " ")} is invalid.`);
      return parsed;
    };
    const textField = (field, fallback = "") => {
      const supplied = csvValue(raw, field);
      return supplied === undefined ? (fallback || "") : supplied;
    };
    const statusText = textField("status", existing?.status || "pending").toLowerCase();
    const status = statusText === "approved" ? "active" : statusText;
    if (!["active", "pending", "suspended", "revoked", "expired"].includes(status)) errors.push(`Row ${csvRowNumber}: Status must be approved, pending, suspended, revoked, or expired.`);
    const yearModelText = textField("motorcycle_year_model", existing?.motorcycle_year_model || "");
    const yearModel = yearModelText ? Number(yearModelText) : null;
    if (yearModel !== null && (!Number.isInteger(yearModel) || yearModel < 1900 || yearModel > 2100)) errors.push(`Row ${csvRowNumber}: Motorcycle Year Model is invalid.`);

    const record = {
      franchise_number: franchiseNumber, previous_registration: textField("previous_registration", existing?.previous_registration),
      operator_name: operatorName, operator_id: linkedOperatorId,
      registration_month: registrationMonth, registration_day: registrationDay, registration_year: registrationYear,
      application_date: dateField("application_date", existing?.application_date || todayForInput()),
      previous_mtop_expiration: dateField("previous_mtop_expiration", existing?.previous_mtop_expiration),
      expiration_date: dateField("expiration_date", existing?.expiration_date), address: textField("address", existing?.address),
      birth_date: dateField("birth_date", existing?.birth_date), birth_place: textField("birth_place", existing?.birth_place),
      civil_status: textField("civil_status", existing?.civil_status), barangay_clearance_cedula: textField("barangay_clearance_cedula", existing?.barangay_clearance_cedula),
      contact_number: textField("contact_number", existing?.contact_number), motorcycle_brand: textField("motorcycle_brand", existing?.motorcycle_brand),
      motorcycle_year_model: yearModel, engine_number: textField("engine_number", existing?.engine_number).toUpperCase(),
      engine_cr_number: textField("engine_cr_number", existing?.engine_cr_number).toUpperCase(), chassis_number: textField("chassis_number", existing?.chassis_number).toUpperCase(),
      chassis_cr_number: textField("chassis_cr_number", existing?.chassis_cr_number).toUpperCase(), plate_number: textField("plate_number", existing?.plate_number).toUpperCase(),
      toda_name: textField("toda_name", existing?.toda_name), official_receipt_number: textField("official_receipt_number", existing?.official_receipt_number),
      driver_name: textField("driver_name", existing?.driver_name), driver_contact_number: textField("driver_contact_number", existing?.driver_contact_number),
      route: textField("route", existing?.route), application_type: existing?.application_type || "renewal", status, is_archived: false,
    };
    preview.push({ csvRowNumber, record, action: existing ? "Update" : "Add", linked: Boolean(linkedOperatorId) });
  });
  return { preview, errors };
}

function renderCsvPreview(result) {
  preparedCsvImport = result.errors.length ? [] : result.preview;
  el("csvImportStatus").textContent = result.errors.length
    ? `Found ${result.errors.length} problem(s). Nothing will be saved until they are fixed.`
    : `${result.preview.length} valid record(s): ${result.preview.filter((row) => row.action === "Add").length} new and ${result.preview.filter((row) => row.action === "Update").length} updates.`;
  el("csvImportErrors").hidden = !result.errors.length;
  el("csvImportErrors").innerHTML = result.errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("");
  el("csvPreviewWrap").hidden = !result.preview.length;
  el("csvPreviewBody").innerHTML = result.preview.slice(0, 100).map((item) => `<tr><td>${item.csvRowNumber}</td><td>${escapeHtml(item.record.franchise_number)}</td><td>${escapeHtml(item.record.operator_name)}</td><td>${item.linked ? "Linked" : "Awaiting account"}</td><td>${item.action}</td></tr>`).join("");
  el("confirmCsvImportBtn").disabled = !preparedCsvImport.length;
}

async function readCsvFile(event) {
  preparedCsvImport = [];
  try {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error("CSV file is too large. Maximum size is 5 MB.");
    renderCsvPreview(buildCsvPreview(await file.text()));
  } catch (error) {
    renderCsvPreview({ preview: [], errors: [error.message] });
  }
}

async function importCsvRecords() {
  if (!preparedCsvImport.length) return;
  const button = el("confirmCsvImportBtn");
  button.disabled = true; button.textContent = "Importing...";
  try {
    for (let index = 0; index < preparedCsvImport.length; index += 100) {
      const batch = preparedCsvImport.slice(index, index + 100).map((item) => item.record);
      const { error } = await supabase.from("franchises").upsert(batch, { onConflict: "franchise_number" });
      if (error) throw error;
    }
    const count = preparedCsvImport.length;
    await loadFranchises();
    closeModal("csvImportModal");
    showToast(`${count} franchise record(s) imported successfully.`);
    void logAudit({ action: "Imported Franchise CSV", actionType: "create", record: `${count} records`, description: `Imported or updated ${count} franchise records from CSV.` });
  } catch (error) {
    console.error("CSV franchise import failed:", error);
    el("csvImportStatus").textContent = `Import failed: ${error.message}`;
  } finally {
    button.disabled = !preparedCsvImport.length; button.textContent = "Import Records";
  }
}

function downloadCsvTemplate() {
  const headers = ["Franchise Number", "Previous Registration", "Operator Name", "Operator Email", "Registration Date", "Application Date", "Previous MTOP Expiry", "Expiration Date", "Address", "Birthdate", "Birthplace", "Civil Status", "Barangay Clearance / Cedula", "Contact Number", "Motorcycle Brand / Model", "Motorcycle Year Model", "Engine Number", "Engine Number (CR)", "Chassis Number", "Chassis Number (CR)", "Plate Number", "TODA Name", "Official Receipt Number", "Driver Name", "Driver Contact", "Route", "Status"];
  const example = ["FR-2026-001", "FR-2023-001", "Juan Dela Cruz", "operator@example.com", "2026-08-24", "2026-08-24", "2023-09-30", "2026-09-30", "Lucena City", "1985-01-15", "Lucena City", "Married", "CED-001", "09123456789", "Honda TMX", "2024", "ENG-001", "ENG-CR-001", "CHS-001", "CHS-CR-001", "ABC-123", "Sample TODA", "OR-001", "Pedro Santos", "09987654321", "Lucena Proper", "Approved"];
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const blob = new Blob(["\uFEFF", headers.map(quote).join(","), "\r\n", example.map(quote).join(",")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "tfro_franchise_import_template.csv"; link.click(); URL.revokeObjectURL(link.href);
}

async function verifyAccess() {
  const { user } = await requireRole(["admin"]);
  if (!user) return;
  await Promise.all([loadFranchises(), loadOperatorAccounts()]);
}

/* ---------- Add form ---------- */
function readAddForm() {
  const form = el("franchiseForm");
  const entry = Object.fromEntries(new FormData(form));
  return {
    franchise_number: (entry.franchise_number || "").trim(),
    previous_registration: (entry.previous_registration || "").trim(),
    previous_mtop_expiration: entry.previous_mtop_expiration || null,
    operator_name: (entry.operator_name || "").trim(),
    operator_id: entry.operator_id || null,
    registration_month: entry.registration_month ? Number(entry.registration_month) : null,
    registration_day: entry.registration_day ? Number(entry.registration_day) : null,
    registration_year: entry.registration_year ? Number(entry.registration_year) : null,
    address: (entry.address || "").trim(),
    birth_date: entry.birth_date || null,
    birth_place: (entry.birth_place || "").trim(),
    civil_status: (entry.civil_status || "").trim(),
    barangay_clearance_cedula: (entry.barangay_clearance_cedula || "").trim(),
    motorcycle_brand: (entry.motorcycle_brand || "").trim(),
    motorcycle_year_model: entry.motorcycle_year_model ? Number(entry.motorcycle_year_model) : null,
    engine_number: (entry.engine_number || "").trim().toUpperCase(),
    engine_cr_number: (entry.engine_cr_number || "").trim().toUpperCase(),
    chassis_number: (entry.chassis_number || "").trim().toUpperCase(),
    chassis_cr_number: (entry.chassis_cr_number || "").trim().toUpperCase(),
    plate_number: (entry.plate_number || "").trim().toUpperCase(),
    contact_number: (entry.contact_number || "").trim(),
    toda_name: (entry.toda_name || "").trim(),
    official_receipt_number: (entry.official_receipt_number || "").trim(),
    driver_name: (entry.driver_name || "").trim(),
    driver_contact_number: (entry.driver_contact_number || "").trim(),
    route: (entry.route || "").trim(),
    application_type: "renewal",
    application_date: entry.application_date || todayForInput(),
    expiration_date: entry.expiration_date || null,
    status: entry.status || "pending",
  };
}

function resetAddForm() {
  const form = el("franchiseForm");
  if (!form) return;
  form.reset();
  const applicationDate = el("application_date");
  if (applicationDate) applicationDate.value = todayForInput();
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
    panel.removeAttribute("hidden");
    el("newApplicationBtn")?.setAttribute("aria-expanded", "true");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function onAddSubmit(event) {
  event.preventDefault();
  clearAllErrors("err-");
  const entry = readAddForm();
  if (!validateCommon(entry, "err")) return;

  const saveButton = el("saveBtn");
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }
  try {
    const { data: savedFranchise, error } = await supabase
      .from("franchises")
      .insert({ ...entry, is_archived: false })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        setFieldError("err-franchise_number", el("franchise_number"), "This Fn# already exists. Use a unique franchise number.");
      } else {
        alert(`Could not save franchise: ${error.message}`);
      }
      return;
    }
    franchises.unshift(savedFranchise);
    resetAddForm();
    const panel = el("applicationPanel");
    if (panel) panel.hidden = true;
    el("newApplicationBtn")?.setAttribute("aria-expanded", "false");
    renderTable();
    showToast("Franchise added successfully.");
    void logAudit({
      action: "Created Franchise",
      actionType: "create",
      record: entry.franchise_number,
      description: `Created franchise record ${entry.franchise_number} for ${entry.operator_name}.`,
    });
  } catch (error) {
    console.error("Unexpected franchise save error:", error);
    alert(`Could not save franchise: ${error.message}`);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Franchise";
    }
  }
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
    ["Previous MTOP Expiration", formatDate(row.previous_mtop_expiration)],
    ["Current MTOP Expiry", formatDate(row.expiration_date)],
    ["Address", row.address || "—"],
    ["Age", ageFromBirthDate(row.birth_date)],
    ["Birthplace", row.birth_place || "—"],
    ["Birthdate", formatDate(row.birth_date)],
    ["Civil Status", row.civil_status || "—"],
    ["Barangay Clearance / Cedula", row.barangay_clearance_cedula || "—"],
    ["Motorcycle Brand / Model", row.motorcycle_brand || "—"],
    ["Motorcycle Year Model", row.motorcycle_year_model || "—"],
    ["Engine No.", row.engine_number || "—"],
    ["Engine No. (CR)", row.engine_cr_number || "—"],
    ["Chassis No.", row.chassis_number || "—"],
    ["Chassis No. (CR)", row.chassis_cr_number || "—"],
    ["Plate No.", row.plate_number || "—"],
    ["Contact Number", row.contact_number || "—"],
    ["TODA Name", row.toda_name || "—"],
    ["Official Receipt Number", row.official_receipt_number || "—"],
    ["Driver Name", row.driver_name || "—"],
    ["Driver Contact", row.driver_contact_number || "—"],
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
  if (el("edit_record_selector")) el("edit_record_selector").value = String(row.id);
  clearAllErrors("err-edit-");
  el("edit_franchise_number").value = row.franchise_number || "";
  el("edit_previous_registration").value = row.previous_registration || "";
  el("edit_previous_mtop_expiration").value = row.previous_mtop_expiration || "";
  el("edit_expiration_date").value = row.expiration_date || "";
  el("edit_operator_name").value = row.operator_name || "";
  el("edit_operator_id").value = row.operator_id || "";
  el("edit_registration_month").value = row.registration_month || "";
  el("edit_registration_day").value = row.registration_day || "";
  el("edit_registration_year").value = row.registration_year || "";
  el("edit_address").value = row.address || "";
  el("edit_birth_date").value = row.birth_date || "";
  el("edit_birth_place").value = row.birth_place || "";
  el("edit_civil_status").value = row.civil_status || "";
  el("edit_barangay_clearance_cedula").value = row.barangay_clearance_cedula || "";
  el("edit_motorcycle_brand").value = row.motorcycle_brand || "";
  el("edit_motorcycle_year_model").value = row.motorcycle_year_model || "";
  el("edit_engine_number").value = row.engine_number || "";
  el("edit_engine_cr_number").value = row.engine_cr_number || "";
  el("edit_chassis_number").value = row.chassis_number || "";
  el("edit_chassis_cr_number").value = row.chassis_cr_number || "";
  el("edit_plate_number").value = row.plate_number || "";
  el("edit_contact_number").value = row.contact_number || "";
  el("edit_toda_name").value = row.toda_name || "";
  el("edit_official_receipt_number").value = row.official_receipt_number || "";
  el("edit_driver_name").value = row.driver_name || "";
  el("edit_driver_contact_number").value = row.driver_contact_number || "";
  openModal("editModal");
}

function openEditChooser() {
  if (!franchises.length) {
    showToast("No franchise records are available to edit.");
    return;
  }
  editingId = null;
  el("editForm")?.reset();
  openModal("editModal");
  el("edit_record_selector")?.focus();
}

function readEditForm() {
  return {
    franchise_number: el("edit_franchise_number").value.trim(),
    previous_registration: el("edit_previous_registration").value.trim(),
    previous_mtop_expiration: el("edit_previous_mtop_expiration").value || null,
    expiration_date: el("edit_expiration_date").value || null,
    operator_name: el("edit_operator_name").value.trim(),
    operator_id: el("edit_operator_id").value || null,
    registration_month: el("edit_registration_month").value ? Number(el("edit_registration_month").value) : null,
    registration_day: el("edit_registration_day").value ? Number(el("edit_registration_day").value) : null,
    registration_year: el("edit_registration_year").value ? Number(el("edit_registration_year").value) : null,
    address: el("edit_address").value.trim(),
    birth_date: el("edit_birth_date").value || null,
    birth_place: el("edit_birth_place").value.trim(),
    civil_status: el("edit_civil_status").value,
    barangay_clearance_cedula: el("edit_barangay_clearance_cedula").value.trim(),
    motorcycle_brand: el("edit_motorcycle_brand").value.trim(),
    motorcycle_year_model: el("edit_motorcycle_year_model").value ? Number(el("edit_motorcycle_year_model").value) : null,
    engine_number: el("edit_engine_number").value.trim().toUpperCase(),
    engine_cr_number: el("edit_engine_cr_number").value.trim().toUpperCase(),
    chassis_number: el("edit_chassis_number").value.trim().toUpperCase(),
    chassis_cr_number: el("edit_chassis_cr_number").value.trim().toUpperCase(),
    plate_number: el("edit_plate_number").value.trim().toUpperCase(),
    contact_number: el("edit_contact_number").value.trim(),
    toda_name: el("edit_toda_name").value.trim(),
    official_receipt_number: el("edit_official_receipt_number").value.trim(),
    driver_name: el("edit_driver_name").value.trim(),
    driver_contact_number: el("edit_driver_contact_number").value.trim(),
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
  if (msg) msg.textContent = `Remove franchise ${row.franchise_number} from active records? Its transaction history will be retained.`;
  openModal("deleteModal");
}

async function confirmDelete() {
  if (!deleteTargetId) { closeModal("deleteModal"); return; }
  const target = franchises.find((r) => String(r.id) === String(deleteTargetId));
  const confirmButton = el("confirmDeleteBtn");
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = "Removing...";
  }

  try {
    const { data, error } = await supabase
      .from("franchises")
      .update({ is_archived: true })
      .eq("id", deleteTargetId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) throw new Error("The record was not updated. Check your administrator permissions.");

    deleteTargetId = null;
    closeModal("deleteModal");
    await loadFranchises();
    showToast("Franchise removed from active records.");
    await logAudit({
      action: "Archived Franchise",
      actionType: "update",
      record: target ? target.franchise_number : null,
      description: target
        ? `Archived franchise record ${target.franchise_number} for ${target.operator_name}.`
        : "Archived a franchise record.",
    });
  } catch (error) {
    console.error("Could not archive franchise:", error);
    alert(`Could not remove franchise: ${error.message}`);
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = "Remove";
    }
  }
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
  el("newApplicationBtn")?.addEventListener("click", openEditChooser);
  el("openImportBtn")?.addEventListener("click", () => {
    preparedCsvImport = [];
    el("csvImportFile").value = "";
    el("csvImportStatus").textContent = "Select a CSV file to preview it before importing.";
    el("csvImportErrors").hidden = true;
    el("csvPreviewWrap").hidden = true;
    el("confirmCsvImportBtn").disabled = true;
    openModal("csvImportModal");
  });
  el("csvImportFile")?.addEventListener("change", readCsvFile);
  el("confirmCsvImportBtn")?.addEventListener("click", importCsvRecords);
  el("downloadCsvTemplateBtn")?.addEventListener("click", downloadCsvTemplate);
  el("edit_record_selector")?.addEventListener("change", (event) => {
    const row = franchises.find((item) => String(item.id) === event.target.value);
    if (row) openEditForm(row);
  });
  el("cancelApplicationBtn")?.addEventListener("click", () => {
    resetAddForm();
    const panel = el("applicationPanel");
    if (panel) panel.hidden = true;
    el("newApplicationBtn")?.setAttribute("aria-expanded", "false");
    editingId = null;
  });
  el("franchiseForm")?.addEventListener("submit", onAddSubmit);
  el("editForm")?.addEventListener("submit", onEditSubmit);
  el("confirmDeleteBtn")?.addEventListener("click", confirmDelete);
  el("previous_mtop_expiration")?.addEventListener("change", (event) => {
    el("expiration_date").value = expirationThreeYearsAfter(event.target.value);
  });
  el("edit_previous_mtop_expiration")?.addEventListener("change", (event) => {
    el("edit_expiration_date").value = expirationThreeYearsAfter(event.target.value);
  });
  el("operator_id")?.addEventListener("change", () => {
    const account = operatorAccounts.find((row) => row.user_id === el("operator_id").value);
    if (account) el("operator_name").value = account.full_name;
  });
  el("edit_operator_id")?.addEventListener("change", () => {
    const account = operatorAccounts.find((row) => row.user_id === el("edit_operator_id").value);
    if (account) el("edit_operator_name").value = account.full_name;
  });

  el("franchiseTable")?.addEventListener("click", onTableClick);
  el("searchInput")?.addEventListener("input", renderTable);
  el("statusFilter")?.addEventListener("change", renderTable);
  bindDateCsvExport({
    getRows: filteredFranchises,
    render: renderTable,
    filename: "tfro_franchise_database",
    columns: [
      { header: "Franchise Number", value: (row) => row.franchise_number },
      { header: "Previous Registration", value: (row) => row.previous_registration },
      { header: "Operator Name", value: (row) => row.operator_name },
      { header: "Registration Date", value: formatRegistrationDate },
      { header: "Application Date", value: (row) => row.application_date },
      { header: "Expiration Date", value: (row) => row.expiration_date },
      { header: "Address", value: (row) => row.address },
      { header: "Age", value: (row) => ageFromBirthDate(row.birth_date) },
      { header: "Birthplace", value: (row) => row.birth_place },
      { header: "Birthdate", value: (row) => row.birth_date },
      { header: "Civil Status", value: (row) => row.civil_status },
      { header: "Barangay Clearance / Cedula", value: (row) => row.barangay_clearance_cedula },
      { header: "Contact Number", value: (row) => row.contact_number },
      { header: "Motorcycle Brand / Model", value: (row) => row.motorcycle_brand },
      { header: "Motorcycle Year Model", value: (row) => row.motorcycle_year_model },
      { header: "Engine Number", value: (row) => row.engine_number },
      { header: "Engine Number (CR)", value: (row) => row.engine_cr_number },
      { header: "Chassis Number", value: (row) => row.chassis_number },
      { header: "Chassis Number (CR)", value: (row) => row.chassis_cr_number },
      { header: "Plate Number", value: (row) => row.plate_number },
      { header: "TODA Name", value: (row) => row.toda_name },
      { header: "Official Receipt Number", value: (row) => row.official_receipt_number },
      { header: "Driver Name", value: (row) => row.driver_name },
      { header: "Driver Contact", value: (row) => row.driver_contact_number },
      { header: "Route", value: (row) => row.route },
      { header: "Status", value: (row) => displayStatus(row.status) },
    ],
  });

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
  ["viewModal", "editModal", "deleteModal", "csvImportModal"].forEach((id) => {
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
