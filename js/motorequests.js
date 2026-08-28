import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";
import { requireRole } from "./auth-guard.js";
import { bindDateCsvExport, isWithinDateRange } from "./csv-export.js";
import { openSubmissionForm } from "./submission-form.js";

let requests = [];
let currentReq = null;

function operatorName(request) {
  return request.operator_name || request.operator_profile?.full_name || "Operator";
}

function el(id) { return document.getElementById(id); }

function escapeHTML(v) {
  var map = {
    "\x26": "&" + "amp;",
    "\x3C": "&" + "lt;",
    "\x3E": "&" + "gt;",
    "\x22": "&" + "quot;",
    "\x27": "&#" + "039;"
  };
  return String(v ?? "").replace(/[&<>'"]/g, function (c) { return map[c]; });
}

function statusBadge(status) {
  var cls = status === "approved" ? "approved"
    : (status === "rejected" ? "rejected"
    : (status === "reviewing" ? "pending" : "pending"));
  var label = String(status || "pending_review").replace(/_/g, " ")
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  return '<span class="badge ' + cls + '">' + label + "</span>";
}

async function verifyAccess() {
  const { profile } = await requireRole(["admin"]);
  return profile;
}

async function loadRequests() {
  var res = await supabase
    .from("change_motor_requests")
    .select("*, operator_profile:profiles!change_motor_requests_operator_id_fkey(full_name,contact_number), franchise:franchises!change_motor_requests_franchise_id_fkey(franchise_number,operator_name,address,contact_number,toda_name,route,motorcycle_brand,motorcycle_year_model)")
    .order("created_at", { ascending: false });
  if (res.error) { console.error(res.error); return alert("Could not load requests: " + res.error.message); }
  requests = res.data || [];
  renderTable();
}

function filteredRequests() {
  var term = (el("searchInput").value || "").trim().toLowerCase();
  var filter = el("statusFilter").value;
  return requests.filter(function (r) {
    if (!isWithinDateRange(r.created_at)) return false;
    var ok = filter === "all" || r.status === filter;
    if (!ok) return false;
    if (!term) return true;
    return [r.request_code, operatorName(r), r.new_engine_number, r.new_plate_number, String(r.id)]
      .some(function (v) { return String(v || "").toLowerCase().includes(term); });
  });
}

function renderTable() {
  var table = el("motorTable");
  var rows = filteredRequests();

  table.innerHTML = rows.length
    ? rows.map(function (r) {
        return "<tr>" +
          "<td>" + escapeHTML(r.request_code || r.id) + "</td>" +
          "<td>" + escapeHTML(operatorName(r)) + "</td>" +
          "<td>" + escapeHTML(r.old_engine_number) + "</td>" +
          "<td>" + escapeHTML(r.new_engine_number) + "</td>" +
          "<td>" + escapeHTML(r.new_plate_number) + "</td>" +
          "<td>" + statusBadge(r.status) + "</td>" +
          "<td>" + (r.created_at ? new Date(r.created_at).toLocaleDateString() : "—") + "</td>" +
          '<td><div class="actions">' +
            '<button data-action="review" data-id="' + r.id + '" title="Review"><i class="ri-eye-line"></i></button>' +
          "</div></td>" +
        "</tr>";
      }).join("")
    : '<tr><td colspan="8">No change motor requests found.</td></tr>';
}

async function openReview(id) {
  currentReq = requests.find(function (r) { return String(r.id) === String(id); });
  if (!currentReq) return;

  // Resolve operator name via profiles / operators
  var resolvedOperatorName = operatorName(currentReq);
  if (!resolvedOperatorName || resolvedOperatorName === "Operator") {
    var prof = await supabase.from("profiles").select("full_name").eq("id", currentReq.operator_id).maybeSingle();
    if (prof.data && prof.data.full_name) resolvedOperatorName = prof.data.full_name;
  }
  if (!resolvedOperatorName) resolvedOperatorName = "Operator";

  var signedUrl = currentReq.supporting_storage_path ? await getSignedUrl(currentReq.supporting_storage_path) : null;
  var docHtml = signedUrl
    ? '<a href="' + escapeHTML(signedUrl) + '" target="_blank" rel="noopener" class="doc-link"><i class="ri-file-download-line"></i> ' + escapeHTML(currentReq.supporting_file_name || "Supporting Document") + "</a>"
    : '<span class="doc-missing">No supporting document</span>';

  el("reviewBody").innerHTML =
    '<div class="review-info-grid">' +
      safeDetail("Request #", currentReq.request_code || currentReq.id) +
      safeDetail("Operator", resolvedOperatorName) +
      safeDetail("Status", statusBadge(currentReq.status), true) +
      detail("Date Submitted", currentReq.created_at ? new Date(currentReq.created_at).toLocaleString() : "—") +
      safeDetail("Current Engine", currentReq.old_engine_number) +
      safeDetail("Current Chassis", currentReq.old_chassis_number) +
      safeDetail("Current Plate", currentReq.old_plate_number) +
      safeDetail("Current Make", currentReq.old_motor_brand || currentReq.franchise?.motorcycle_brand) +
      safeDetail("Current Model", currentReq.old_motor_model || currentReq.franchise?.motorcycle_year_model) +
      safeDetail("New Engine", currentReq.new_engine_number) +
      safeDetail("New Chassis", currentReq.new_chassis_number) +
      safeDetail("New Plate", currentReq.new_plate_number) +
      safeDetail("Motor Brand", currentReq.new_motor_brand) +
      safeDetail("Motor Serial", currentReq.new_motor_serial) +
      safeDetail("Supporting Doc", docHtml, true) +
    "</div>" +
    '<div class="review-actions motor-form-actions"><button type="button" class="btn-cancel" id="printTfro002Btn"><i class="ri-file-pdf-2-line"></i> TFRO-002</button><button type="button" class="btn-cancel" id="printTfro007Btn"><i class="ri-file-pdf-2-line"></i> TFRO-007</button>' +
      (currentReq.status === "approved" ? '<button type="button" class="btn-accept" id="sendMotorFormsBtn"' + (currentReq.forms_sent_to_operator_at ? " disabled" : "") + '><i class="ri-' + (currentReq.forms_sent_to_operator_at ? "check" : "send-plane") + '-line"></i> ' + (currentReq.forms_sent_to_operator_at ? "Forms Sent" : "Send Forms to Operator") + '</button>' : "") +
    '</div>' +
    renderMotorActions(currentReq);

  el("printTfro002Btn").addEventListener("click", function () { openChangeMotorPdf("TFRO-002"); });
  el("printTfro007Btn").addEventListener("click", function () { openChangeMotorPdf("TFRO-007"); });
  el("sendMotorFormsBtn")?.addEventListener("click", sendChangeMotorForms);

  var acceptBtn = el("reviewBody").querySelector("#acceptBtn");
  var rejectBtn = el("reviewBody").querySelector("#rejectBtn");
  if (acceptBtn) acceptBtn.addEventListener("click", approveRequest);
  if (rejectBtn) rejectBtn.addEventListener("click", function () {
    el("reviewModal").hidden = true;
    el("rejectModal").hidden = false;
  });

  el("reviewModal").hidden = false;
}

async function getSignedUrl(path) {
  var result = await supabase.storage.from("franchise-documents").createSignedUrl(path, 3600);
  if (result.error) {
    console.error("Could not create document URL:", result.error);
    return null;
  }
  return result.data && result.data.signedUrl;
}

function safeDetail(label, value, isHtml) {
  var output = value || "—";
  return '<div><label>' + escapeHTML(label) + '</label><strong>' + (isHtml ? output : escapeHTML(output)) + "</strong></div>";
}

function detail(label, value) {
  return '<div><label>' + label + '</label><strong>' + (value || "—") + "</strong></div>";
}

function getPublicUrl(path) {
  try {
    return supabase.storage.from("franchise-documents").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    return "#";
  }
}

function renderMotorActions(r) {
  if (r.status === "approved") {
    return '<div class="review-actions"><span class="approved-note">This request has been approved.</span></div>';
  }
  if (r.status === "rejected") {
    return '<div class="review-actions"><span class="rejected-note">Rejected: ' + escapeHTML(r.rejection_reason) + "</span></div>";
  }
  return '<div class="review-actions">' +
    '<button type="button" class="btn-reject" id="rejectBtn"><i class="ri-close-circle-line"></i> Reject</button>' +
    '<button type="button" class="btn-accept" id="acceptBtn"><i class="ri-check-double-line"></i> Approve Change Motor</button>' +
  "</div>";
}

async function approveRequest() {
  if (!currentReq) return;

  try {
    // Apply the request as a single database transaction so status, franchise,
    // history, tricycle, and notification records cannot diverge.
    var result = await supabase.rpc("approve_change_motor_request", {
      p_request_id: currentReq.id,
    });
    if (result.error) throw result.error;

alert("Request approved. The franchise/tricycle records have been updated and old info preserved in history.");
    currentReq.status = "approved";
    el("reviewModal").hidden = true;
    loadRequests();

    logAudit({
      action: "Approved Change Motor Request",
      actionType: "approve",
      record: currentReq.request_code || currentReq.id,
      description: `Approved Change Motor/MTOP request ${currentReq.request_code || currentReq.id}.`,
    });
  } catch (err) {
    console.error("Approve error:", err);
    alert("Failed to approve request: " + err.message);
  }
}

async function rejectRequest() {
  if (!currentReq) return;
  var reason = el("rejectReason").value.trim();
  if (!reason) { alert("Please provide a reason for rejection."); return; }

  var sess = await supabase.auth.getUser();
  var user = sess.data && sess.data.user;

  try {
    var up = await supabase.from("change_motor_requests").update({
      status: "rejected",
      admin_id: user ? user.id : null,
      rejection_reason: reason,
      admin_reviewed_at: new Date().toISOString(),
    }).eq("id", currentReq.id);
    if (up.error) throw up.error;

alert("Request rejected. The operator has been notified.");
    el("rejectModal").hidden = true;
    el("rejectReason").value = "";
    loadRequests();

    logAudit({
      action: "Rejected Change Motor Request",
      actionType: "reject",
      record: currentReq.request_code || currentReq.id,
      description: `Rejected Change Motor/MTOP request ${currentReq.request_code || currentReq.id}. Reason: ${reason}`,
    });
  } catch (err) {
    alert("Failed to reject request: " + err.message);
  }
}

async function openChangeMotorPdf(formCode) {
  if (!currentReq) return;
  const module = await import("./pdf-form.js?v=20260826-225000");
  const options = { request: currentReq, franchise: currentReq.franchise || {}, operator: currentReq.operator_profile || {}, editable: true };
  if (formCode === "TFRO-002") module.openDroppingPetitionPdfForm(options);
  else module.openDroppingCertificationPdfForm(options);
}

async function sendChangeMotorForms() {
  if (!currentReq || currentReq.status !== "approved" || currentReq.forms_sent_to_operator_at) return;
  const auth = await supabase.auth.getUser();
  const sentAt = new Date().toISOString();
  const update = await supabase.from("change_motor_requests").update({
    forms_sent_to_operator_at: sentAt,
    forms_sent_by: auth.data.user?.id || null,
  }).eq("id", currentReq.id);
  if (update.error) return alert("Could not send the forms: " + update.error.message);
  currentReq.forms_sent_to_operator_at = sentAt;
  currentReq.forms_sent_by = auth.data.user?.id || null;
  const button = el("sendMotorFormsBtn");
  button.disabled = true;
  button.innerHTML = '<i class="ri-check-line"></i> Forms Sent';
  await logAudit({ action: "Sent Change Motor Forms", actionType: "update", record: currentReq.request_code || currentReq.id, description: `Sent TFRO-002 and TFRO-007 to the operator for ${currentReq.request_code || currentReq.id}.` });
  alert("TFRO-002 and TFRO-007 have been sent to the operator account.");
}

function bindEvents() {
  el("searchInput").addEventListener("input", renderTable);
  el("statusFilter").addEventListener("change", renderTable);
  bindDateCsvExport({
    getRows: filteredRequests,
    render: renderTable,
    filename: "tfro_change_motor_requests",
    columns: [
      { header: "Request Number", value: (row) => row.request_code || row.id },
      { header: "Operator", value: operatorName },
      { header: "Old Engine Number", value: (row) => row.old_engine_number },
      { header: "Old Chassis Number", value: (row) => row.old_chassis_number },
      { header: "Old Plate Number", value: (row) => row.old_plate_number },
      { header: "Old Motor Make", value: (row) => row.old_motor_brand },
      { header: "Old Motor Model", value: (row) => row.old_motor_model },
      { header: "New Engine Number", value: (row) => row.new_engine_number },
      { header: "New Chassis Number", value: (row) => row.new_chassis_number },
      { header: "New Plate Number", value: (row) => row.new_plate_number },
      { header: "Motor Brand", value: (row) => row.new_motor_brand },
      { header: "Motor Serial", value: (row) => row.new_motor_serial },
      { header: "Status", value: (row) => row.status },
      { header: "Forms Sent At", value: (row) => row.forms_sent_to_operator_at },
      { header: "Rejection Reason", value: (row) => row.rejection_reason },
      { header: "Submitted At", value: (row) => row.created_at },
    ],
  });
  el("motorTable").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "review") openReview(btn.dataset.id);
  });
  el("confirmRejectBtn").addEventListener("click", rejectRequest);
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () { el(btn.dataset.close).hidden = true; });
  });
  el("logoutBtn").addEventListener("click", async function () {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = "index.html";
  });
}

async function init() {
  bindEvents();
  var profile = await verifyAccess();
  if (!profile) return;
  await loadRequests();
}

async function printMotorForm(resolvedOperatorName) {
  if (!currentReq) return;
  openSubmissionForm({
    title: "Change Motor / MTOP Request Form", reference: currentReq.request_code || currentReq.id,
    filename: `TFRO-Change-Motor-${currentReq.request_code || currentReq.id}`,
    pictureUrl: await getSignedUrl(currentReq.picture_storage_path),
    fields: [
      { label: "Operator", value: resolvedOperatorName }, { label: "Status", value: currentReq.status },
      { label: "Current Engine", value: currentReq.old_engine_number }, { label: "New Engine", value: currentReq.new_engine_number },
      { label: "Current Chassis", value: currentReq.old_chassis_number }, { label: "New Chassis", value: currentReq.new_chassis_number },
      { label: "Current Plate", value: currentReq.old_plate_number }, { label: "New Plate", value: currentReq.new_plate_number },
      { label: "Motor Brand", value: currentReq.new_motor_brand }, { label: "Motor Serial", value: currentReq.new_motor_serial },
      { label: "Supporting Document", value: currentReq.supporting_file_name },
      { label: "Rejection Reason", value: currentReq.rejection_reason }, { label: "Submitted", value: currentReq.created_at ? new Date(currentReq.created_at).toLocaleString() : "—" },
    ],
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
