import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";
import { logAudit } from "./audit-helper.js";

let enforcers = [];
let ticketCounts = new Map();
let profilePictures = new Map();
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" }[character]));
const normalize = (value) => String(value || "").toLowerCase().trim();
function showMessage(text, error = false) { const element = document.getElementById("enforcerFormMessage"); element.textContent = text; element.hidden = !text; element.classList.toggle("error", error); }

function renderEnforcers() {
  const term = normalize(document.getElementById("enforcerSearch").value);
  const rows = enforcers.filter((row) => normalize([row.enforcer_id,row.full_name,row.unit_assignment,row.email].join(" ")).includes(term));
  document.getElementById("totalEnforcers").textContent = enforcers.length;
  document.getElementById("activeEnforcers").textContent = enforcers.filter((row) => row.status === "active").length;
  document.getElementById("linkedEnforcers").textContent = enforcers.filter((row) => row.user_id).length;
  document.getElementById("submittedTickets").textContent = [...ticketCounts.values()].reduce((sum, count) => sum + count, 0);
  document.getElementById("enforcerTable").innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${escapeHtml(row.enforcer_id)}</strong></td><td>${escapeHtml(row.full_name)}<br><small>${escapeHtml(row.email || "")}</small></td><td>${escapeHtml(row.contact_number || "—")}</td><td>${escapeHtml(row.unit_assignment || "—")}</td><td><span class="${row.user_id ? "account-linked" : "account-waiting"}">${row.user_id ? "Linked" : "Awaiting signup"}</span></td><td><select class="status-select" data-status-id="${row.id}" aria-label="Status for ${escapeHtml(row.full_name)}"><option value="active"${row.status === "active" ? " selected" : ""}>Active</option><option value="suspended"${row.status === "suspended" ? " selected" : ""}>Suspended</option><option value="inactive"${row.status === "inactive" ? " selected" : ""}>Inactive</option></select></td><td>${ticketCounts.get(row.user_id) || 0}</td><td><div class="registry-actions"><button class="row-action" data-view-id="${row.id}">View Form</button><button class="row-action" data-save-id="${row.id}">Save</button></div></td></tr>`).join("") : '<tr><td class="empty-row" colspan="8">No Traffic Enforcers found.</td></tr>';
}

async function loadData() {
  const [enforcerResult, ticketResult, profileResult] = await Promise.all([
    supabase.from("traffic_enforcers").select("*").order("created_at", { ascending:false }),
    supabase.from("violations").select("recorded_by"),
    supabase.from("profiles").select("id,profile_picture_path"),
  ]);
  if (enforcerResult.error) throw enforcerResult.error;
  if (ticketResult.error) throw ticketResult.error;
  enforcers = enforcerResult.data || [];
  profilePictures = new Map((profileResult.data || []).map((profile) => [profile.id,profile.profile_picture_path]));
  ticketCounts = new Map();
  (ticketResult.data || []).forEach((row) => { if (row.recorded_by) ticketCounts.set(row.recorded_by, (ticketCounts.get(row.recorded_by) || 0) + 1); });
  renderEnforcers();
}

const detail = (label,value) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
async function viewProfile(id) { const row=enforcers.find((item)=>String(item.id)===String(id)); if(!row)return; document.getElementById("enforcerProfileDetails").innerHTML=[detail("Full Name",row.full_name),detail("Enforcer ID",row.enforcer_id),detail("Email",row.email),detail("Contact Number",row.contact_number),detail("Unit / Assignment",row.unit_assignment),detail("Account",row.user_id?"Linked":"Awaiting signup"),detail("Status",row.status),detail("Tickets Submitted",ticketCounts.get(row.user_id)||0),detail("Registered",row.created_at?new Date(row.created_at).toLocaleString("en-PH"):"—")].join(""); const image=document.getElementById("enforcerFormalPhoto"),missing=document.getElementById("enforcerPhotoMissing"); image.hidden=true; image.removeAttribute("src"); missing.hidden=false; const path=profilePictures.get(row.user_id); if(path){const {data}=await supabase.storage.from("account-profile-pictures").createSignedUrl(path,600);if(data?.signedUrl){image.src=data.signedUrl;image.hidden=false;missing.hidden=true;}} document.getElementById("enforcerProfileModal").hidden=false;}

async function createEnforcer(event) {
  event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
  const record = { enforcer_id:values.enforcer_id.trim().toUpperCase(), full_name:values.full_name.trim(), contact_number:values.contact_number.trim() || null, unit_assignment:values.unit_assignment.trim() || null, status:"active" };
  showMessage("Saving Traffic Enforcer ID…");
  const { data, error } = await supabase.from("traffic_enforcers").insert(record).select("*").single();
  if (error) return showMessage(error.code === "23505" ? "That Traffic Enforcer ID is already registered." : error.message, true);
  await logAudit({ action:"Registered Traffic Enforcer ID", actionType:"create", record:data.enforcer_id, description:`Added ${data.full_name} to the authorized Traffic Enforcer roster.` });
  form.reset(); showMessage("Traffic Enforcer ID registered. The Enforcer may now sign up."); await loadData();
}

async function saveStatus(id) {
  const row = enforcers.find((item) => String(item.id) === String(id)), select = document.querySelector(`[data-status-id="${id}"]`); if (!row || !select) return;
  const status = select.value, { error } = await supabase.from("traffic_enforcers").update({ status, updated_at:new Date().toISOString() }).eq("id",id);
  if (error) return alert(`Could not update Enforcer: ${error.message}`);
  await logAudit({ action:"Updated Traffic Enforcer Status", actionType:"update", record:row.enforcer_id, description:`Changed ${row.full_name} from ${row.status} to ${status}.`, previousValue:row.status, newValue:status }); await loadData();
}

async function initialize() {
  const { user } = await requireRole("admin"); if (!user) return;
  try { await loadData(); } catch (error) { alert(`Could not load Traffic Enforcers: ${error.message}`); }
  document.getElementById("showEnforcerForm").addEventListener("click", () => { document.getElementById("enforcerFormPanel").hidden = false; });
  document.getElementById("cancelEnforcerForm").addEventListener("click", () => { document.getElementById("enforcerFormPanel").hidden = true; });
  document.getElementById("enforcerForm").addEventListener("submit", createEnforcer);
  document.getElementById("enforcerSearch").addEventListener("input", renderEnforcers);
  document.getElementById("enforcerTable").addEventListener("click", (event) => { const save = event.target.closest("[data-save-id]"), view=event.target.closest("[data-view-id]"); if(save)void saveStatus(save.dataset.saveId); if(view)void viewProfile(view.dataset.viewId); });
  document.getElementById("closeEnforcerProfile").addEventListener("click",()=>{document.getElementById("enforcerProfileModal").hidden=true;});
  document.getElementById("printEnforcerProfile").addEventListener("click",()=>window.print());
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once:true }); else void initialize();
