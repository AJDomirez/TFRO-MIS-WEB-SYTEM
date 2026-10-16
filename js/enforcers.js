import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";
import { logAudit } from "./audit-helper.js";

let enforcers = [];
let ticketCounts = new Map();
let commissionTotals = new Map();
let commissionRanks = new Map();
let accountStatuses = new Map();
let registryChanges = null;
const money = new Intl.NumberFormat("en-PH", { style:"currency", currency:"PHP" });
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" }[character]));
const normalize = (value) => String(value || "").toLowerCase().trim();
const rankClass = (id) => `enforcer-rank-${commissionRanks.get(String(id)) || "neutral"}`;
const rankLabel = (id) => ({ 1:"#1 Highest commission", 2:"#2 Second highest", 3:"#3 Third highest" }[commissionRanks.get(String(id))] || "Not in top 3");
function updateCommissionRanks() {
  const ranked = enforcers
    .map((row) => ({ id:String(row.id), enforcerId:String(row.enforcer_id || ""), total:Number(commissionTotals.get(row.id) || 0) }))
    .filter((row) => row.total > 0)
    .sort((left, right) => right.total - left.total || left.enforcerId.localeCompare(right.enforcerId))
    .slice(0, 3);
  commissionRanks = new Map(ranked.map((row, index) => [row.id, index + 1]));
}
function showMessage(text, error = false) { const element = document.getElementById("enforcerFormMessage"); element.textContent = text; element.hidden = !text; element.classList.toggle("error", error); }

function renderEnforcers() {
  const term = normalize(document.getElementById("enforcerSearch").value);
  const rows = enforcers.filter((row) => normalize([row.enforcer_id,row.full_name,row.unit_assignment,row.email].join(" ")).includes(term));
  document.getElementById("totalEnforcers").textContent = enforcers.length;
  document.getElementById("activeEnforcers").textContent = enforcers.filter((row) => row.status === "active").length;
  document.getElementById("linkedEnforcers").textContent = enforcers.filter((row) => row.user_id).length;
  document.getElementById("submittedTickets").textContent = [...ticketCounts.values()].reduce((sum, count) => sum + count, 0);
  const allCommissionTotal = [...commissionTotals.values()].reduce((sum, amount) => sum + amount, 0);
  document.getElementById("totalEnforcerCommissions").textContent = money.format(allCommissionTotal);
  document.getElementById("enforcerTicketTotal").textContent = rows.reduce((sum, row) => sum + (ticketCounts.get(row.id) || 0), 0);
  document.getElementById("enforcerCommissionFooter").textContent = money.format(rows.reduce((sum, row) => sum + (commissionTotals.get(row.id) || 0), 0));
  document.getElementById("enforcerTable").innerHTML = rows.length ? rows.map((row) => {
    const colorClass = rankClass(row.id);
    return `<tr class="enforcer-registry-row ${colorClass}"><td><strong>${escapeHtml(row.enforcer_id)}</strong></td><td><span class="enforcer-name-chip ${colorClass}"><i class="ri-shield-user-line"></i>${escapeHtml(row.full_name)}</span><br><small>${escapeHtml(row.email || "")}</small></td><td>${escapeHtml(row.contact_number || "—")}</td><td>${escapeHtml(row.unit_assignment || "—")}</td><td><span class="${row.user_id ? "account-linked" : "account-waiting"}">${row.user_id ? "Linked" : "Awaiting signup"}</span></td><td><select class="status-select" data-status-id="${row.id}" aria-label="Status for ${escapeHtml(row.full_name)}"><option value="active"${row.status === "active" ? " selected" : ""}>Active</option><option value="suspended"${row.status === "suspended" ? " selected" : ""}>Suspended</option><option value="inactive"${row.status === "inactive" ? " selected" : ""}>Inactive</option></select></td><td><strong>${ticketCounts.get(row.id) || 0}</strong></td><td><span class="enforcer-total-commission ${colorClass}"><small>${rankLabel(row.id)}</small><strong>${money.format(commissionTotals.get(row.id) || 0)}</strong></span></td><td><div class="registry-actions"><button class="row-action" data-view-id="${row.id}">View Form</button><button class="row-action" data-save-id="${row.id}">Save</button></div></td></tr>`;
  }).join("") : '<tr><td class="empty-row" colspan="9">No TFRO Enforcers found.</td></tr>';
  rows.forEach((row, index) => {
    const tableRow = document.getElementById("enforcerTable").rows[index];
    if (!tableRow) return;
    const approval = row.user_id ? (accountStatuses.get(row.user_id) || "pending_approval") : "awaiting_signup";
    const accountLabel = { active:"Approved", pending_approval:"Pending approval", rejected:"Rejected", suspended:"Suspended", awaiting_signup:"Awaiting signup" }[approval] || approval;
    tableRow.cells[4].innerHTML = `<span class="account-state account-${escapeHtml(approval)}">${escapeHtml(accountLabel)}</span>`;
    if (approval === "pending_approval") tableRow.cells[8].querySelector(".registry-actions")?.insertAdjacentHTML("beforeend", `<button class="row-action approve-account" data-approve-id="${row.id}"><i class="ri-user-follow-line"></i> Approve Account</button><button class="row-action reject-account" data-reject-id="${row.id}">Reject</button>`);
  });
}

async function loadData() {
  const [enforcerResult, ticketResult, commissionResult] = await Promise.all([
    supabase.from("traffic_enforcers").select("*").order("created_at", { ascending:false }),
    supabase.from("violation_enforcers").select("enforcer_id"),
    supabase.from("payment_enforcer_commissions").select("enforcer_id,commission_amount"),
  ]);
  if (enforcerResult.error) throw enforcerResult.error;
  if (ticketResult.error) throw ticketResult.error;
  if (commissionResult.error) throw commissionResult.error;
  enforcers = enforcerResult.data || [];
  const linkedUserIds = enforcers.map((row) => row.user_id).filter(Boolean);
  accountStatuses = new Map();
  if (linkedUserIds.length) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,account_status").in("id", linkedUserIds);
    if (profilesError) throw profilesError;
    accountStatuses = new Map((profiles || []).map((profile) => [profile.id, profile.account_status]));
  }
  ticketCounts = new Map();
  (ticketResult.data || []).forEach((row) => { if (row.enforcer_id) ticketCounts.set(row.enforcer_id, (ticketCounts.get(row.enforcer_id) || 0) + 1); });
  commissionTotals = new Map();
  (commissionResult.data || []).forEach((row) => { if (row.enforcer_id) commissionTotals.set(row.enforcer_id, (commissionTotals.get(row.enforcer_id) || 0) + Number(row.commission_amount || 0)); });
  updateCommissionRanks();
  renderEnforcers();
}

function watchRegistryChanges() {
  if (registryChanges) return;
  registryChanges = supabase.channel("admin-enforcer-ticket-counts")
    .on("postgres_changes", { event:"*", schema:"public", table:"violations" }, () => void loadData())
    .on("postgres_changes", { event:"*", schema:"public", table:"traffic_enforcers" }, () => void loadData())
    .on("postgres_changes", { event:"*", schema:"public", table:"payment_enforcer_commissions" }, () => void loadData())
    .subscribe();
  window.addEventListener("focus", () => void loadData());
}

const detail = (label,value) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
async function viewProfile(id) { const row=enforcers.find((item)=>String(item.id)===String(id)); if(!row)return; document.getElementById("enforcerProfileDetails").innerHTML=[detail("Full Name",row.full_name),detail("Enforcer ID",row.enforcer_id),detail("Email",row.email),detail("Contact Number",row.contact_number),detail("Unit / Assignment",row.unit_assignment),detail("Account",row.user_id?"Linked":"Awaiting signup"),detail("Status",row.status),detail("Assigned Tickets",ticketCounts.get(row.id)||0),detail("Total Commission",money.format(commissionTotals.get(row.id)||0)),detail("Registered",row.created_at?new Date(row.created_at).toLocaleString("en-PH"):"—")].join(""); document.getElementById("enforcerProfileModal").hidden=false;}

async function createEnforcer(event) {
  event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
  const record = { enforcer_id:values.enforcer_id.trim().toUpperCase(), full_name:values.full_name.trim(), contact_number:values.contact_number.trim() || null, unit_assignment:values.unit_assignment.trim() || null, status:"active" };
  showMessage("Saving TFRO Enforcer ID…");
  const { data, error } = await supabase.from("traffic_enforcers").insert(record).select("*").single();
  if (error) return showMessage(error.code === "23505" ? "That TFRO Enforcer ID is already registered." : error.message, true);
  await logAudit({ action:"Registered TFRO Enforcer ID", actionType:"create", record:data.enforcer_id, description:`Added ${data.full_name} to the authorized TFRO Enforcer roster.` });
  form.reset(); showMessage("TFRO Enforcer ID registered. The Enforcer may now sign up."); await loadData();
}

async function saveStatus(id) {
  const row = enforcers.find((item) => String(item.id) === String(id)), select = document.querySelector(`[data-status-id="${id}"]`); if (!row || !select) return;
  const status = select.value, { error } = await supabase.from("traffic_enforcers").update({ status, updated_at:new Date().toISOString() }).eq("id",id);
  if (error) return alert(`Could not update Enforcer: ${error.message}`);
  await logAudit({ action:"Updated TFRO Enforcer Status", actionType:"update", record:row.enforcer_id, description:`Changed ${row.full_name} from ${row.status} to ${status}.`, previousValue:row.status, newValue:status }); await loadData();
}

async function decideAccount(id, approved) {
  const row = enforcers.find((item) => String(item.id) === String(id));
  if (!row?.user_id) return alert("This Enforcer ID does not have a linked signup account yet.");
  const verb = approved ? "approve" : "reject";
  if (!window.confirm(`Are you sure you want to ${verb} the account for ${row.full_name}?`)) return;
  const { error } = await supabase.rpc("approve_enforcer_account", { p_enforcer_record_id:Number(id), p_approved:approved });
  if (error) return alert(`Could not ${verb} the Enforcer account: ${error.message}`);
  await logAudit({ action:approved?"Approved TFRO Enforcer Account":"Rejected TFRO Enforcer Account", actionType:"update", record:row.enforcer_id, description:`${approved?"Approved":"Rejected"} the portal account linked to ${row.full_name}.` });
  alert(approved ? "Enforcer account approved. The confirmed user will be sent to the Enforcer homepage." : "Enforcer account rejected.");
  await loadData();
}

async function initialize() {
  const { user } = await requireRole(["admin", "admin_viewer"]); if (!user) return;
  try { await loadData(); } catch (error) { alert(`Could not load TFRO Enforcers: ${error.message}`); }
  watchRegistryChanges();
  document.getElementById("showEnforcerForm").addEventListener("click", () => { document.getElementById("enforcerFormPanel").hidden = false; });
  document.getElementById("cancelEnforcerForm").addEventListener("click", () => { document.getElementById("enforcerFormPanel").hidden = true; });
  document.getElementById("enforcerForm").addEventListener("submit", createEnforcer);
  document.getElementById("enforcerSearch").addEventListener("input", renderEnforcers);
  document.getElementById("enforcerTable").addEventListener("click", (event) => { const save = event.target.closest("[data-save-id]"), view=event.target.closest("[data-view-id]"), approve=event.target.closest("[data-approve-id]"), reject=event.target.closest("[data-reject-id]"); if(save)void saveStatus(save.dataset.saveId); if(view)void viewProfile(view.dataset.viewId); if(approve)void decideAccount(approve.dataset.approveId,true); if(reject)void decideAccount(reject.dataset.rejectId,false); });
  document.getElementById("closeEnforcerProfile").addEventListener("click",()=>{document.getElementById("enforcerProfileModal").hidden=true;});
  document.getElementById("printEnforcerProfile").addEventListener("click",()=>window.print());
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once:true }); else void initialize();
