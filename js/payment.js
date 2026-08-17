import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";

let payments = [];
const table = document.getElementById("paymentsTable");
const modal = document.getElementById("paymentModal");
const form = document.getElementById("paymentForm");
const peso = (amount) => "₱" + Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
}

async function verifyAccess() {
  const { user } = await requireRole(["admin", "staff"]);
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
  document.getElementById("totalCollected").textContent = peso(payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0));
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
  const { data, error } = await supabase.from("payments")
    .select("id, receipt, payer, payment_type, amount, status, paid_at")
    .order("paid_at", { ascending: false });
  if (error) return alert("Could not load payments: " + error.message);
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
  return `<main style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#172033"><h1>TFRO Lucena City</h1><h2>Official Receipt</h2><hr><p><strong>Receipt no.:</strong> ${escapeHtml(p.receipt)}</p><p><strong>Payer:</strong> ${escapeHtml(p.payer)}</p><p><strong>Payment type:</strong> ${escapeHtml(p.type)}</p><p><strong>Date:</strong> ${escapeHtml(p.date)}</p><p><strong>Status:</strong> ${escapeHtml(p.status)}</p><h2>Total: ${peso(p.amount)}</h2></main>`;
}

function openReceipt(payment, shouldPrint) {
  const tab = window.open("", "_blank");
  if (!tab) return alert("Please allow pop-ups to view or print the receipt.");
  tab.document.write(`<!doctype html><html><head><title>${escapeHtml(payment.receipt)}</title></head><body>${receiptMarkup(payment)}</body></html>`);
  tab.document.close();
  if (shouldPrint) { tab.focus(); tab.print(); }
}

function closeModal() { modal.hidden = true; form.reset(); }

document.getElementById("recordPaymentBtn").addEventListener("click", () => { modal.hidden = false; document.getElementById("paymentPayer").focus(); });
document.getElementById("closePaymentModal").addEventListener("click", closeModal);
document.getElementById("cancelPaymentBtn").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const receipt = `OR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { error } = await supabase.from("payments").insert({
    receipt,
    payer: data.payer.trim(),
    payment_type: data.type,
    amount: Number(data.amount),
    status: data.status,
    paid_at: new Date().toISOString(),
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
