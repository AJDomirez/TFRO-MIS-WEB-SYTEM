import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";

let requests = [];
let currentReq = null;

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
  var sess = await supabase.auth.getSession();
  if (!sess || !sess.data || !sess.data.session) { window.location.replace("index.html"); return; }
  var profile = await supabase.from("profiles").select("role").eq("id", sess.data.session.user.id).single();
  if (!profile || !profile.data || !["admin", "staff"].includes(profile.data.role)) {
    await supabase.auth.signOut();
    window.location.replace("index.html");
    return;
  }
  return profile.data;
}

async function loadRequests() {
  var res = await supabase
    .from("change_motor_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (res.error) { console.error(res.error); return alert("Could not load requests: " + res.error.message); }
  requests = res.data || [];
  renderTable();
}

function renderTable() {
  var table = el("motorTable");
  var term = (el("searchInput").value || "").trim().toLowerCase();
  var filter = el("statusFilter").value;

  var rows = requests.filter(function (r) {
    var ok = filter === "all" || r.status === filter;
    if (!ok) return false;
    if (!term) return true;
    return [r.request_code, r.new_engine_number, r.new_plate_number, String(r.id)]
      .some(function (v) { return String(v || "").toLowerCase().includes(term); });
  });

  table.innerHTML = rows.length
    ? rows.map(function (r) {
        return "<tr>" +
          "<td>" + escapeHTML(r.request_code || r.id) + "</td>" +
          "<td>" + escapeHTML(r.operator_name) + "</td>" +
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
  var operatorName = currentReq.operator_name || "Operator";
  if (!operatorName) {
    var prof = await supabase.from("profiles").select("full_name").eq("id", currentReq.operator_id).maybeSingle();
    if (prof.data && prof.data.full_name) operatorName = prof.data.full_name;
  }

  var docHtml = currentReq.supporting_storage_path
    ? '<a href="' + getPublicUrl(currentReq.supporting_storage_path) + '" target="_blank" class="doc-link"><i class="ri-file-download-line"></i> ' + escapeHTML(currentReq.supporting_file_name || "Supporting Document") + "</a>"
    : '<span class="doc-missing">No supporting document</span>';

  el("reviewBody").innerHTML =
    '<div class="review-info-grid">' +
      detail("Request #", currentReq.request_code || currentReq.id) +
      detail("Operator", operatorName) +
      detail("Status", statusBadge(currentReq.status)) +
      detail("Date Submitted", currentReq.created_at ? new Date(currentReq.created_at).toLocaleString() : "—") +
      detail("Current Engine", currentReq.old_engine_number) +
      detail("Current Chassis", currentReq.old_chassis_number) +
      detail("Current Plate", currentReq.old_plate_number) +
      detail("New Engine", currentReq.new_engine_number) +
      detail("New Chassis", currentReq.new_chassis_number) +
      detail("New Plate", currentReq.new_plate_number) +
      detail("Motor Brand", currentReq.new_motor_brand) +
      detail("Motor Serial", currentReq.new_motor_serial) +
      detail("Supporting Doc", docHtml) +
    "</div>" +
    renderMotorActions(currentReq);

  var acceptBtn = el("reviewBody").querySelector("#acceptBtn");
  var rejectBtn = el("reviewBody").querySelector("#rejectBtn");
  if (acceptBtn) acceptBtn.addEventListener("click", approveRequest);
  if (rejectBtn) rejectBtn.addEventListener("click", function () {
    el("reviewModal").hidden = true;
    el("rejectModal").hidden = false;
  });

  el("reviewModal").hidden = false;
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
  var sess = await supabase.auth.getUser();
  var user = sess.data && sess.data.user;
  if (!user) { window.location.href = "index.html"; return; }

  var adminName = null;
  var prof = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (prof.data && prof.data.full_name) adminName = prof.data.full_name;

  try {
    // 1) Update request status
    var up = await supabase.from("change_motor_requests").update({
      status: "approved",
      admin_id: user.id,
      admin_name: adminName,
      admin_reviewed_at: new Date().toISOString(),
    }).eq("id", currentReq.id);
    if (up.error) throw up.error;

    // 2) Update the franchise record (new vehicle info)
    var franUpdate = {};
    if (currentReq.new_engine_number) franUpdate.engine_number = currentReq.new_engine_number;
    if (currentReq.new_chassis_number) franUpdate.chassis_number = currentReq.new_chassis_number;
    if (currentReq.new_plate_number) franUpdate.plate_number = currentReq.new_plate_number;
    if (Object.keys(franUpdate).length) {
      var fu = await supabase.from("franchises").update(franUpdate).eq("id", currentReq.franchise_id);
      if (fu.error) throw fu.error;
    }

    // 3) Insert into change_motor_history (preserve old info)
    await supabase.from("change_motor_history").insert({
      franchise_id: currentReq.franchise_id,
      old_engine_number: currentReq.old_engine_number,
      old_chassis_number: currentReq.old_chassis_number,
      old_plate_number: currentReq.old_plate_number,
      new_engine_number: currentReq.new_engine_number,
      new_chassis_number: currentReq.new_chassis_number,
      new_plate_number: currentReq.new_plate_number,
      changed_by: user.id,
    });

    // 4) Update / insert the tricycle record (is_current)
    var tric = await supabase
      .from("tricycles")
      .update({ engine_number: currentReq.new_engine_number, chassis_number: currentReq.new_chassis_number, plate_number: currentReq.new_plate_number })
      .eq("franchise_id", currentReq.franchise_id).eq("is_current", true);
    if (tric.error) console.error("Tricycle update:", tric.error);

    // 5) Notify operator
    await supabase.from("notifications").insert({
      user_id: currentReq.operator_id,
      message: "Your Change Motor/MTOP request (" + (currentReq.request_code || "#" + currentReq.id) + ") has been approved.",
      link: "operatorportal.html",
      type: "success",
    });

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

    await supabase.from("notifications").insert({
      user_id: currentReq.operator_id,
      message: "Your Change Motor/MTOP request (" + (currentReq.request_code || "#" + currentReq.id) + ") was rejected: " + reason,
      link: "operatorportal.html",
      type: "warning",
    });

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

function bindEvents() {
  el("searchInput").addEventListener("input", renderTable);
  el("statusFilter").addEventListener("change", renderTable);
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

function init() {
  bindEvents();
  verifyAccess().then(loadRequests);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
