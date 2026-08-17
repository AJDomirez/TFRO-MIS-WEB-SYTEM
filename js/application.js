import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";

let applications = [];
let currentApp = null;
let currentDocs = [];
const DOC_TYPES = ["voters", "barangay", "cedula", "ohcr", "insurance", "pmbl"];
const DOC_LABELS = {
  voters: "Voters Certificate",
  barangay: "Barangay Clearance",
  cedula: "Cedula",
  ohcr: "OHCR",
  insurance: "Insurance",
  pmbl: "PMBL",
};

function el(id) { return document.getElementById(id); }
function escapeHtml(v) {
  var e = {
    "\x26": "&" + "amp;",
    "\x3C": "&" + "lt;",
    "\x3E": "&" + "gt;",
    "\x27": "&#" + "039;",
    "\x22": "&" + "quot;"
  };
  return String(v ?? "").replace(/[&<>'"]/g, function (c) { return e[c]; });
}

function statusBadge(status) {
  const map = {
    pending_review: ["pending", "Pending Review"],
    reviewing: ["pending", "Reviewing"],
    approved: ["approved", "Approved"],
    rejected: ["rejected", "Rejected"],
    needs_correction: ["rejected", "Needs Correction"],
  };
  const [cls, label] = map[status] || ["pending", status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function docStatusBadge(app) {
  const verified = DOC_TYPES.filter((t) => app[`${t}_verified`]).length;
  return `${verified}/${DOC_TYPES.length} verified`;
}

async function verifyAccess() {
  const { profile } = await requireRole(["admin", "staff"]);
  return profile;
}

async function loadApplications() {
  const { data, error } = await supabase
    .from("franchise_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return alert("Could not load applications: " + error.message); }
  applications = data || [];
  renderTable();
}

function renderTable() {
  const table = el("applicationsTable");
  const term = el("searchInput").value.trim().toLowerCase();
  const filter = el("statusFilter").value;

  const rows = applications.filter((a) => {
    const matchesStatus = filter === "all" ||
      (filter === "rejected" ? (a.status === "rejected" || a.status === "needs_correction") : a.status === filter);
    if (!matchesStatus) return false;
    if (!term) return true;
    return [a.franchise_number, a.operator_name, a.contact_number, a.application_code]
      .some((v) => String(v || "").toLowerCase().includes(term));
  });

  table.innerHTML = rows.length ? rows.map((a) => `
    <tr>
      <td>${escapeHtml(a.application_code || a.id)}</td>
      <td>${escapeHtml(a.franchise_number)}</td>
      <td>${escapeHtml(a.operator_name)}</td>
      <td>${escapeHtml(a.address)}</td>
      <td>${escapeHtml(a.contact_number)}</td>
      <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="doc-status">${docStatusBadge(a)}</td>
      <td>
        <div class="actions">
          <button data-action="review" data-id="${a.id}" title="Review"><i class="ri-eye-line"></i></button>
        </div>
      </td>
    </tr>
  `).join("") : '<tr><td colspan="9">No applications found.</td></tr>';
}

/* Open review modal and load documents */
async function openReview(id) {
  currentApp = applications.find((a) => String(a.id) === String(id));
  if (!currentApp) return;

  const { data: docs, error } = await supabase
    .from("franchise_documents")
    .select("*")
    .eq("application_id", id);
  if (error) console.error("Load docs error:", error);
  currentDocs = docs || [];

  await renderReview(currentApp, currentDocs);
  el("reviewModal").hidden = false;
}

function getDefaultDocStatus(app, docType) {
  if (app[`${docType}_verified`]) return "verified";
  return "pending";
}

async function renderReview(app, docs) {
  const body = el("reviewBody");

  const urls = new Map(await Promise.all(docs.map(async (doc) => [doc.id, await getSignedUrl(doc.storage_path)])));

  // Build document rows
  const docRows = DOC_TYPES.map((type) => {
    const doc = docs.find((d) => d.doc_type === type);
    const status = doc ? (doc.verified ? "verified" : "pending") : "pending";
    const fileHtml = doc
      ? (urls.get(doc.id)
        ? `<a href="${escapeHtml(urls.get(doc.id))}" target="_blank" rel="noopener" class="doc-link"><i class="ri-file-download-line"></i> ${escapeHtml(doc.file_name)}</a>`
        : '<span class="doc-missing">Document unavailable</span>')
      : '<span class="doc-missing">No document uploaded</span>';
    return `
      <div class="review-doc" data-doc="${type}">
        <div class="review-doc-label">
          <i class="ri-file-pdf-line"></i>
          <span>${DOC_LABELS[type]}</span>
        </div>
        <div class="review-doc-file">${fileHtml}</div>
        <div class="review-doc-actions">
          <button type="button" class="verify-btn ${status === "verified" ? "active" : ""}" data-doc="${type}" data-mark="verified">
            <i class="ri-checkbox-circle-line"></i> Verified
          </button>
          <button type="button" class="correct-btn ${status === "needs_correction" ? "active" : ""}" data-doc="${type}" data-mark="needs_correction">
            <i class="ri-error-warning-line"></i> Needs Correction
          </button>
        </div>
      </div>
    `;
  }).join("");

  const verifiedCount = DOC_TYPES.filter((t) => app[`${t}_verified`]).length;
  const allVerified = verifiedCount === DOC_TYPES.length && app.info_complete;

  body.innerHTML = `
    <div class="review-info-grid">
      <div><label>App ID</label><strong>${escapeHtml(app.application_code || app.id)}</strong></div>
      <div><label>Fn#</label><strong>${escapeHtml(app.franchise_number)}</strong></div>
      <div><label>Operator</label><strong>${escapeHtml(app.operator_name)}</strong></div>
      <div><label>Contact</label><strong>${escapeHtml(app.contact_number)}</strong></div>
      <div><label>Address</label><strong>${escapeHtml(app.address)}</strong></div>
      <div><label>Date Submitted</label><strong>${app.created_at ? new Date(app.created_at).toLocaleString() : "—"}</strong></div>
      <div><label>Engine No.</label><strong>${escapeHtml(app.engine_number)}</strong></div>
      <div><label>Chassis No.</label><strong>${escapeHtml(app.chassis_number)}</strong></div>
      <div><label>Plate No.</label><strong>${escapeHtml(app.plate_number)}</strong></div>
      <div><label>Date of Registration</label><strong>${app.registration_month ? `${app.registration_month}/${app.registration_day}/${app.registration_year}` : "—"}</strong></div>
      <div><label>Previous Reg.</label><strong>${escapeHtml(app.previous_registration)}</strong></div>
      <div><label>Route</label><strong>${escapeHtml(app.route) || "—"}</strong></div>
    </div>

    <div class="review-checklist">
      <h4>Review Checklist</h4>

      <div class="check-item">
        <div class="check-label"><i class="ri-file-list-3-line"></i> Franchise Information</div>
        <button type="button" class="verify-btn ${app.info_complete ? "active" : ""}" id="infoToggle">
          <i class="ri-${app.info_complete ? "checkbox-circle" : "circle"}-line"></i>
          ${app.info_complete ? "Information Complete" : "Mark Information Complete"}
        </button>
      </div>

      ${docRows}

      <div class="review-summary">
        <span><strong>${verifiedCount}</strong> of <strong>${DOC_TYPES.length}</strong> documents verified</span>
        <span class="${allVerified ? "ok" : "incomplete"}">${allVerified ? "✓ Ready to Accept" : "Review all documents before accepting"}</span>
      </div>
    </div>

    ${renderActions(app, allVerified)}
  `;

  // Bind doc verify buttons
  body.querySelectorAll("[data-mark]").forEach((btn) => {
    btn.addEventListener("click", () => markDoc(btn.dataset.doc, btn.dataset.mark));
  });
  const infoBtn = body.querySelector("#infoToggle");
  if (infoBtn) infoBtn.addEventListener("click", toggleInfoComplete);

  // Bind accept/reject
  const acceptBtn = body.querySelector("#acceptBtn");
  const rejectBtn = body.querySelector("#rejectBtn");
  if (acceptBtn) acceptBtn.addEventListener("click", acceptApplication);
  if (rejectBtn) rejectBtn.addEventListener("click", () => { el("reviewModal").hidden = true; el("rejectModal").hidden = false; });
}

function renderActions(app, allVerified) {
  if (app.status === "approved") {
    return `<div class="review-actions"><span class="approved-note">✓ This application has been approved.</span></div>`;
  }
  if (app.status === "rejected" || app.status === "needs_correction") {
    return `<div class="review-actions"><span class="rejected-note">Rejected: ${escapeHtml(app.rejection_reason)}</span></div>`;
  }
  return `
    <div class="review-actions">
      <button type="button" class="btn-reject" id="rejectBtn"><i class="ri-close-circle-line"></i> Reject</button>
      <button type="button" class="btn-accept" id="acceptBtn" ${allVerified ? "" : "disabled"}>
        <i class="ri-check-double-line"></i> Accept Tricycle Franchise
      </button>
    </div>
  `;
}

async function getSignedUrl(path) {
  const { data, error } = await supabase.storage.from("franchise-documents").createSignedUrl(path, 3600);
  if (error) {
    console.error("Could not create document URL:", error);
    return null;
  }
  return data.signedUrl;
}

/* Toggle info complete */
async function toggleInfoComplete() {
  const newVal = !currentApp.info_complete;
  const { error } = await supabase.from("franchise_applications").update({ info_complete: newVal }).eq("id", currentApp.id);
  if (error) return alert("Update failed: " + error.message);
  currentApp.info_complete = newVal;
  await renderReview(currentApp, currentDocs);
}

/* Mark a document verified or needs correction */
async function markDoc(docType, mark) {
  const verified = mark === "verified";
  // Update application flag
  const update = {};
  update[`${docType}_verified`] = verified;
  const { error } = await supabase.from("franchise_applications").update(update).eq("id", currentApp.id);
  if (error) return alert("Update failed: " + error.message);
  currentApp[`${docType}_verified`] = verified;

// Update the document row if it exists
  const doc = currentDocs.find((d) => d.doc_type === docType);
  if (doc) {
    await supabase.from("franchise_documents").update({ verified, status: mark }).eq("id", doc.id);
    doc.verified = verified;
    doc.status = mark;
  }

  await renderReview(currentApp, currentDocs);

  logAudit({
    action: mark === "verified" ? "Verified Requirement" : "Marked Requirement Needs Correction",
    actionType: mark === "verified" ? "verification" : "reject",
    record: currentApp.franchise_number || currentApp.application_code,
    description: `${DOC_LABELS[docType]} for application ${currentApp.franchise_number || currentApp.application_code} marked as ${mark}.`,
  });
}

/* Show signed URL for opening/downloading a PDF properly */
async function getDocUrl(path) {
  const { data, error } = await supabase.storage.from("franchise-documents").createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

/* Accept application -> create franchise record */
async function acceptApplication() {
  const allVerified = DOC_TYPES.every((t) => currentApp[`${t}_verified`]) && currentApp.info_complete;
  if (!allVerified) {
    alert("Please verify all required documents and mark the information as complete before accepting.");
    return;
  }

  try {
    // The database function performs approval, franchise creation, tricycle
    // creation, and notification in one transaction. A failure rolls back all
    // changes instead of leaving a partially approved application.
    const { error } = await supabase.rpc("approve_franchise_application", {
      p_application_id: currentApp.id,
    });
    if (error) throw error;

    currentApp.status = "approved";
    alert("Franchise approved! The record has been added to Franchise Records.");
    el("reviewModal").hidden = true;
    loadApplications();

    logAudit({
      action: "Approved Franchise Application",
      actionType: "approve",
      record: currentApp.franchise_number,
      description: `Approved franchise application submitted by ${currentApp.operator_name}. Created franchise record ${currentApp.franchise_number}.`,
    });
  } catch (err) {
    console.error("Accept error:", err);
    alert("Failed to accept application: " + err.message);
  }
}

/* Reject application */
async function rejectApplication() {
  const reason = el("rejectReason").value.trim();
  if (!reason) { alert("Please provide a reason for rejection/correction."); return; }

  const { data: { user } } = await supabase.auth.getUser();
  try {
    const { error } = await supabase
      .from("franchise_applications")
      .update({
        status: "needs_correction",
        admin_id: user.id,
        rejection_reason: reason,
      })
      .eq("id", currentApp.id);
    if (error) throw error;

alert("Application rejected. The operator has been notified.");
    el("rejectModal").hidden = true;
    el("rejectReason").value = "";
    loadApplications();

    logAudit({
      action: "Rejected Franchise Application",
      actionType: "reject",
      record: currentApp.franchise_number || currentApp.application_code,
      description: `Rejected franchise application ${currentApp.franchise_number || currentApp.application_code} submitted by ${currentApp.operator_name}. Reason: ${reason}`,
    });
  } catch (err) {
    alert("Failed to reject application: " + err.message);
  }
}

/* Event bindings */
function bindEvents() {
  el("searchInput")?.addEventListener("input", renderTable);
  el("statusFilter")?.addEventListener("change", renderTable);
  el("applicationsTable")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "review") openReview(btn.dataset.id);
  });
  el("confirmRejectBtn")?.addEventListener("click", rejectApplication);
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => { el(btn.dataset.close).hidden = true; });
  });
  el("logoutBtn")?.addEventListener("click", async () => { await supabase.auth.signOut(); localStorage.clear(); window.location.href = "index.html"; });
}

async function init() {
  bindEvents();
  const profile = await verifyAccess();
  if (!profile) return;
  await loadApplications();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
