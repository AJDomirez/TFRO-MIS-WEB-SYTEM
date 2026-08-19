import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

let payments = [];
let pendingViolations = [];
let currentUserId = null;
const table = document.getElementById("paymentsTable");
const modal = document.getElementById("paymentModal");
const form = document.getElementById("paymentForm");
const peso = (amount) => "₱" + Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
}

async function verifyAccess() {
  const { user } = await requireRole(["staff"]);
  currentUserId = user?.id || null;
  return Boolean(user);
}

function loadTable(rows) {
  table.innerHTML = rows.length ? rows.map((p) => `
    <tr><td>${escapeHtml(p.receipt)}</td><td>${escapeHtml(p.payer)}</td><td><span class="type ${escapeHtml(p.type)}">${escapeHtml(p.type)}</span></td>
    <td>${peso(p.amount)}</td><td>${escapeHtml(p.date)}</td><td><span class="status ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
    <td><div class="actions">
      <button type="button" data-action="receipt" data-id="${p.id}" title="View receipt" aria-label="View receipt"><i class="ri-receipt-line"></i></button>
      <button type="button" data-action="print" data-id="${p.id}" title="Print receipt" aria-label="Print receipt"><i class="ri-printer-line"></i></button>
    </div></td></tr>`).join("") : '<tr><td colspan="7">No payments recorded.</td></tr>';
}

function updateTotals() {
  const collected = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0);
  document.getElementById("totalCollected").textContent = peso(collected);
  document.getElementById("apprehenderShare").textContent = peso(collected * 0.20);
  document.getElementById("pendingCount").textContent = payments.filter((p) => p.status === "pending").length;
  document.getElementById("overdueCount").textContent = payments.filter((p) => p.status === "overdue").length;
}

function applyFilters() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  loadTable(payments.filter((p) => {
    const payer = String(p.payer || "").toLowerCase();
    const receipt = String(p.receipt || "").toLowerCase();
    return (status === "all" || p.status === status) && (payer.includes(term) || receipt.includes(term));
  }));
}

async function loadPayments() {
  const [{ data, error }, violationResult] = await Promise.all([
    supabase.from("payments").select("id, receipt, payer, payment_type, amount, status, paid_at, violation_id, violations(violation_code, violation_type, ticket_number, classification, franchise_number, apprehending_officers)").order("paid_at", { ascending: false }),
    supabase.from("violations").select("id, subject_name, violation_code, violation_type, ticket_number, penalty, classification, franchise_number, apprehending_officers").eq("status", "pending").order("occurred_at", { ascending: false }),
  ]);
  if (error) return alert("Could not load payments: " + error.message);
  if (violationResult.error) return alert("Could not load unpaid violations: " + violationResult.error.message);
  pendingViolations = violationResult.data || [];
  document.getElementById("paymentViolation").innerHTML = '<option value="">Select an unpaid violation</option>' + pendingViolations.map((v) =>
    `<option value="${escapeHtml(v.id)}">${escapeHtml(v.ticket_number || "No ticket")} · ${escapeHtml(v.violation_code || "")}: ${escapeHtml(v.subject_name)} · ${peso(v.penalty)}</option>`
  ).join("");
  payments = (data || []).map((p) => ({
    ...p,
    receipt: p.receipt || `LEGACY-${p.id}`,
    payer: p.payer || "Unknown payer",
    type: p.payment_type || "Unspecified",
    status: p.status || "paid",
    date: p.paid_at ? String(p.paid_at).slice(0, 10) : "—",
  }));
  updateTotals();
  applyFilters();
}

function receiptMarkup(p) {
  const violation = p.violations;
  return `<main style="font-family:Arial,sans-serif;max-width:760px;margin:40px auto;color:#172033;border:1px solid #bbb;padding:32px"><header style="border-top:12px solid #0b5c41;border-bottom:4px solid #f4c430;padding:16px 0"><h1 style="margin:0">TRICYCLE FRANCHISING AND REGULATORY OFFICE</h1><p>City Government of Lucena</p></header><h2 style="text-align:center;letter-spacing:5px;text-decoration:underline">ORDER OF PAYMENT</h2><p><strong>OR no.:</strong> ${escapeHtml(p.receipt)} &nbsp; <strong>Date paid:</strong> ${escapeHtml(p.date)}</p><p><strong>Payor:</strong> ${escapeHtml(p.payer)}</p>${violation ? `<p><strong>Ticket:</strong> ${escapeHtml(violation.ticket_number || "—")} &nbsp; <strong>Classification:</strong> ${escapeHtml(violation.classification || "—")} &nbsp; <strong>Franchise:</strong> ${escapeHtml(violation.franchise_number || "—")}</p><p><strong>Apprehending officer/s:</strong> ${escapeHtml(violation.apprehending_officers || "—")}</p><table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #555;padding:8px">Code</th><th style="border:1px solid #555;padding:8px">Violation</th><th style="border:1px solid #555;padding:8px">Penalty</th></tr><tr><td style="border:1px solid #555;padding:8px">${escapeHtml(violation.violation_code)}</td><td style="border:1px solid #555;padding:8px">${escapeHtml(violation.violation_type)}</td><td style="border:1px solid #555;padding:8px">${peso(p.amount)}</td></tr></table>` : ""}<p><strong>Status:</strong> ${escapeHtml(p.status)}</p><h2>Total Amount Due: ${peso(p.amount)}</h2><p><strong>20% allocation:</strong> ${peso(Number(p.amount) * 0.20)}</p><br><p style="text-align:center">Assessed by: ____________________<br>TFRO Personnel</p></main>`;
}

function openReceipt(payment, shouldPrint) {
  const tab = window.open("", "_blank");
  if (!tab) return alert("Please allow pop-ups to view or print the receipt.");
  tab.document.write(`<!doctype html><html><head><title>${escapeHtml(payment.receipt)}</title></head><body>${receiptMarkup(payment)}</body></html>`);
  tab.document.close();
  if (shouldPrint) { tab.focus(); tab.print(); }
}

function closeModal() { modal.hidden = true; form.reset(); }

document.getElementById("recordPaymentBtn").addEventListener("click", () => { modal.hidden = false; form.elements.paid_date.value = new Date().toISOString().slice(0, 10); document.getElementById("paymentViolation").focus(); });
document.getElementById("closePaymentModal").addEventListener("click", closeModal);
document.getElementById("cancelPaymentBtn").addEventListener("click", closeModal);
document.getElementById("paymentViolation").addEventListener("change", (event) => {
  const violation = pendingViolations.find((row) => String(row.id) === event.target.value);
  if (!violation) return;
  form.elements.payer.value = violation.subject_name || "";
  form.elements.type.value = "penalty";
  form.elements.amount.value = Number(violation.penalty || 0);
});
modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const receipt = data.receipt.trim();
  const { error } = await supabase.from("payments").insert({
    receipt,
    payer: data.payer.trim(),
    payment_type: data.type,
    amount: Number(data.amount),
    status: data.status,
    paid_at: `${data.paid_date}T00:00:00+08:00`,
    violation_id: data.violation_id || null,
    recorded_by: currentUserId,
  });
  if (error) return alert("Could not save payment: " + error.message);
  closeModal();
  await loadPayments();
});

table.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const payment = payments.find((p) => String(p.id) === button.dataset.id);
  if (payment) openReceipt(payment, button.dataset.action === "print");
});
document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.clear();
  window.location.href = "index.html";
});

(async () => {
  if (!await verifyAccess()) {
    return;
  }
  await loadPayments();
})();
