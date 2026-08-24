import { supabase } from "./supabase.js";
import { requireRole } from "./auth-guard.js";
import { logAudit } from "./audit-helper.js";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
let currentUser = null;
let enforcer = null;
let selectedDriver = null;
let catalog = [];
let cameraStream = null;
let capturedTicketPhoto = null;
let capturedPreviewUrl = "";
const enforcerAudit = (entry) => logAudit({ ...entry, description: `Traffic Enforcer ${enforcer?.enforcer_id || "account"}: ${entry.description || entry.action}.` });

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[character]));
const localDate = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function message(element, text, isError = false) {
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle("error", isError);
}

function cameraMessage(text, type = "") {
  const output = document.getElementById("cameraStatus");
  output.textContent = text;
  output.classList.toggle("success", type === "success");
  output.classList.toggle("error", type === "error");
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  const video = document.getElementById("ticketCamera");
  video.srcObject = null;
  video.hidden = true;
  document.getElementById("captureTicketBtn").hidden = true;
  document.getElementById("stopCameraBtn").hidden = true;
  if (!capturedTicketPhoto) document.getElementById("cameraStage").hidden = true;
}

function clearCapturedPhoto() {
  capturedTicketPhoto = null;
  if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
  capturedPreviewUrl = "";
  const preview = document.getElementById("ticketPhotoPreview");
  preview.removeAttribute("src");
  preview.hidden = true;
  document.getElementById("retakeTicketBtn").hidden = true;
}

async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraMessage("Live camera is not supported in this browser. Use the picture upload option below.", "error");
    return;
  }
  stopCamera();
  clearCapturedPhoto();
  cameraMessage("Waiting for camera permission…");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    const video = document.getElementById("ticketCamera");
    video.srcObject = cameraStream;
    video.hidden = false;
    await video.play();
    document.getElementById("cameraStage").hidden = false;
    document.getElementById("captureTicketBtn").hidden = false;
    document.getElementById("stopCameraBtn").hidden = false;
    document.getElementById("requestCameraBtn").hidden = true;
    cameraMessage("Camera permission granted. Place the entire ticket inside the frame, then select Take Picture.", "success");
    void enforcerAudit({ action: "Granted Ticket Camera Access", actionType: "verification", record: enforcer.enforcer_id, description: "opened the camera for violation-ticket evidence" });
  } catch (error) {
    const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    const missing = error?.name === "NotFoundError" || error?.name === "OverconstrainedError";
    cameraMessage(denied ? "Camera permission was denied. Allow camera access in your browser settings or upload a picture instead." : missing ? "No usable camera was found. Upload an existing picture instead." : `The camera could not start: ${error.message}`, "error");
    void enforcerAudit({ action: denied ? "Denied Ticket Camera Access" : "Ticket Camera Unavailable", actionType: "verification", record: enforcer?.enforcer_id, description: denied ? "camera permission was denied by the user" : "could not start a ticket evidence camera" });
  }
}

async function captureTicketPhoto() {
  const video = document.getElementById("ticketCamera");
  if (!cameraStream || !video.videoWidth) return cameraMessage("The camera is not ready yet. Please wait and try again.", "error");
  const canvas = document.getElementById("ticketCanvas");
  const scale = Math.min(1, 1800 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return cameraMessage("The picture could not be captured. Please try again.", "error");
  capturedTicketPhoto = new File([blob], `ticket-${Date.now()}.jpg`, { type: "image/jpeg" });
  capturedPreviewUrl = URL.createObjectURL(blob);
  const preview = document.getElementById("ticketPhotoPreview");
  preview.src = capturedPreviewUrl;
  preview.hidden = false;
  document.getElementById("ticketPhotoFile").value = "";
  document.getElementById("retakeTicketBtn").hidden = false;
  document.getElementById("requestCameraBtn").hidden = false;
  stopCamera();
  document.getElementById("cameraStage").hidden = false;
  cameraMessage("Ticket picture captured and ready to submit privately to TFRO Staff.", "success");
  void enforcerAudit({ action: "Captured Ticket Evidence", actionType: "upload", record: selectedDriver?.license_number, description: `captured photo evidence${selectedDriver ? ` for Driver license ${selectedDriver.license_number}` : ""}` });
}

function handleFilePhoto(event) {
  stopCamera();
  clearCapturedPhoto();
  const file = event.target.files[0];
  if (!file) return cameraMessage("No photo selected yet.");
  cameraMessage(`Selected ${file.name}. It is ready to submit to TFRO Staff.`, "success");
  document.getElementById("requestCameraBtn").hidden = false;
  void enforcerAudit({ action: "Selected Ticket Evidence File", actionType: "upload", record: selectedDriver?.license_number, description: `selected an image file for ticket evidence${selectedDriver ? ` for Driver license ${selectedDriver.license_number}` : ""}` });
}

async function loadIdentity() {
  const { data, error } = await supabase.from("traffic_enforcers").select("*").eq("user_id", currentUser.id).maybeSingle();
  if (error || !data || data.status !== "active") throw error || new Error("Your Traffic Enforcer ID is not active.");
  enforcer = data;
  document.getElementById("enforcerBadge").textContent = `ID ${data.enforcer_id}`;
}

async function loadCatalog() {
  const { data, error } = await supabase.from("violation_catalog").select("code,violation,penalty").eq("active", true).order("code");
  if (error) throw error;
  catalog = data || [];
  document.getElementById("violationCode").innerHTML = '<option value="">Select official violation</option>' + catalog.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} — ${escapeHtml(item.violation)} (${money.format(item.penalty)})</option>`).join("");
}

async function searchDriver(event) {
  event.preventDefault();
  const output = document.getElementById("driverResult");
  const status = document.getElementById("searchMessage");
  const license = document.getElementById("licenseSearch").value.trim();
  selectedDriver = null;
  output.hidden = true;
  document.getElementById("ticketSection").hidden = true;
  message(status, "Searching Driver records…");

  const { data: driver, error } = await supabase.from("drivers").select("id,full_name,license_number,license_type,license_expiration,license_status,operator_name,franchise_id,violation_count,compliance").ilike("license_number", license).maybeSingle();
  if (error) { void enforcerAudit({ action: "Driver Search Failed", actionType: "verification", record: license, description: `Driver license search failed for ${license}` }); return message(status, `Search failed: ${error.message}`, true); }
  if (!driver) { void enforcerAudit({ action: "Driver Record Not Found", actionType: "verification", record: license, description: `searched for Driver license ${license}; no exact record was found` }); return message(status, "No Driver was found with that exact license number.", true); }
  const { data: history, error: historyError } = await supabase.from("violations").select("id,ticket_number,violation_type,occurred_at,status,penalty").eq("driver_id", driver.id).order("occurred_at", { ascending: false });
  if (historyError) return message(status, `Driver found, but violation history could not be loaded: ${historyError.message}`, true);

  selectedDriver = driver;
  message(status, "Driver verified in TFRO records.");
  output.innerHTML = `<div class="driver-result-grid"><div><span>Driver</span><strong>${escapeHtml(driver.full_name)}</strong></div><div><span>License</span><strong>${escapeHtml(driver.license_number)}</strong></div><div><span>License status</span><strong>${escapeHtml(driver.license_status || "—")}</strong></div><div><span>Expiration</span><strong>${escapeHtml(driver.license_expiration || "—")}</strong></div><div><span>Operator</span><strong>${escapeHtml(driver.operator_name || "—")}</strong></div><div><span>Compliance</span><strong>${escapeHtml(driver.compliance || "—")}</strong></div><div><span>Past violations</span><strong>${history.length}</strong></div></div>${history.length ? `<ul class="history-list">${history.slice(0, 8).map((row) => `<li>${new Date(row.occurred_at).toLocaleDateString("en-PH")} — ${escapeHtml(row.violation_type)} (${escapeHtml(row.status)})</li>`).join("")}</ul>` : "<p>No recorded violations were found for this Driver.</p>"}`;
  output.hidden = false;
  document.getElementById("ticketDriver").value = driver.full_name;
  document.getElementById("ticketLicense").value = driver.license_number;
  document.getElementById("ticketSection").hidden = false;
  void enforcerAudit({ action: "Verified Driver Record", actionType: "verification", record: driver.license_number, description: `viewed Driver ${driver.full_name}, license status, compliance, and violation history` });
}

function applyViolationCode() {
  const item = catalog.find((entry) => entry.code === document.getElementById("violationCode").value);
  const form = document.getElementById("ticketForm");
  form.elements.violation_type.value = item?.violation || "";
  form.elements.penalty.value = item?.penalty ?? "";
}

async function submitTicket(event) {
  event.preventDefault();
  if (!selectedDriver) return;
  const form = event.currentTarget;
  const status = document.getElementById("ticketMessage");
  const button = document.getElementById("submitTicketBtn");
  const photo = capturedTicketPhoto || document.getElementById("ticketPhotoFile").files[0];
  if (!photo || !["image/jpeg", "image/png", "image/webp"].includes(photo.type) || photo.size > 10 * 1024 * 1024) return message(status, "Upload a JPG, PNG, or WebP ticket photo no larger than 10 MB.", true);
  const item = catalog.find((entry) => entry.code === form.elements.violation_code.value);
  if (!item) return message(status, "Select an official violation.", true);

  button.disabled = true;
  message(status, "Uploading ticket photo and submitting to TFRO…");
  const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${currentUser.id}/${Date.now()}-${safeName}`;
  try {
    const uploaded = await supabase.storage.from("violation-tickets").upload(path, photo, { contentType: photo.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const record = {
      driver_id: selectedDriver.id, subject_name: selectedDriver.full_name, subject_type: "driver",
      violation_code: item.code, violation_type: item.violation, classification: "with_franchise",
      ticket_number: form.elements.ticket_number.value.trim(), apprehending_officers: enforcer.full_name,
      penalty: Number(item.penalty), occurred_at: `${form.elements.occurred_date.value}T00:00:00+08:00`,
      description: form.elements.description.value.trim() || null, status: "pending", recorded_by: currentUser.id,
      ticket_photo_path: path,
    };
    const saved = await supabase.from("violations").insert(record).select("id,ticket_number").single();
    if (saved.error) { await supabase.storage.from("violation-tickets").remove([path]); throw saved.error; }
    await logAudit({ action: "Submitted Violation Ticket", actionType: "create", record: saved.data.ticket_number, description: `Traffic Enforcer ${enforcer.enforcer_id} submitted ${item.code} for Driver license ${selectedDriver.license_number}.` });
    form.reset();
    document.getElementById("ticketPhotoFile").value = "";
    stopCamera();
    clearCapturedPhoto();
    document.getElementById("requestCameraBtn").hidden = false;
    document.getElementById("cameraStage").hidden = true;
    cameraMessage("No photo selected yet.");
    form.elements.occurred_date.value = localDate();
    document.getElementById("ticketDriver").value = selectedDriver.full_name;
    document.getElementById("ticketLicense").value = selectedDriver.license_number;
    message(status, "Ticket and photo submitted successfully to TFRO Staff.");
    await loadTickets();
  } catch (error) {
    message(status, `Ticket submission failed: ${error.message}`, true);
  } finally { button.disabled = false; }
}

async function openPhoto(path) {
  const { data, error } = await supabase.storage.from("violation-tickets").createSignedUrl(path, 300);
  if (error) return window.alert(`Could not open ticket photo: ${error.message}`);
  window.open(data.signedUrl, "_blank", "noopener");
  void enforcerAudit({ action: "Viewed Ticket Evidence", actionType: "verification", record: path.split("/").pop(), description: "opened previously submitted ticket photo evidence" });
}

async function loadTickets() {
  const body = document.getElementById("ticketHistory");
  const { data, error } = await supabase.from("violations").select("id,occurred_at,ticket_number,subject_name,violation_type,penalty,status,ticket_photo_path").eq("recorded_by", currentUser.id).order("created_at", { ascending: false });
  if (error) { body.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`; return; }
  body.innerHTML = data?.length ? data.map((row) => `<tr><td>${new Date(row.occurred_at).toLocaleDateString("en-PH")}</td><td>${escapeHtml(row.ticket_number)}</td><td>${escapeHtml(row.subject_name)}</td><td>${escapeHtml(row.violation_type)}</td><td>${money.format(row.penalty)}</td><td><span class="status-pill">${escapeHtml(row.status)}</span></td><td>${row.ticket_photo_path ? `<button class="photo-link" data-photo="${escapeHtml(row.ticket_photo_path)}"><i class="ri-image-line"></i> View</button>` : "—"}</td></tr>`).join("") : '<tr><td colspan="7">No submitted tickets yet.</td></tr>';
}

async function initialize() {
  const auth = await requireRole("traffic_enforcer");
  if (!auth.user) return;
  currentUser = auth.user;
  try { await Promise.all([loadIdentity(), loadCatalog(), loadTickets()]); }
  catch (error) { window.alert(`Could not open Traffic Enforcer portal: ${error.message}`); return; }
  document.getElementById("ticketForm").elements.occurred_date.value = localDate();
  void enforcerAudit({ action: "Opened Traffic Enforcer Portal", actionType: "login", record: enforcer.enforcer_id, description: "accessed the ticketing and Driver search workspace" });
  document.getElementById("driverSearchForm").addEventListener("submit", searchDriver);
  document.getElementById("violationCode").addEventListener("change", applyViolationCode);
  document.getElementById("ticketForm").addEventListener("submit", submitTicket);
  document.getElementById("requestCameraBtn").addEventListener("click", requestCamera);
  document.getElementById("captureTicketBtn").addEventListener("click", captureTicketPhoto);
  document.getElementById("retakeTicketBtn").addEventListener("click", requestCamera);
  document.getElementById("stopCameraBtn").addEventListener("click", () => {
    stopCamera();
    document.getElementById("requestCameraBtn").hidden = false;
    cameraMessage("Camera turned off. You can allow it again or upload a picture.");
  });
  document.getElementById("ticketPhotoFile").addEventListener("change", handleFilePhoto);
  document.getElementById("ticketHistory").addEventListener("click", (event) => { const button = event.target.closest("[data-photo]"); if (button) void openPhoto(button.dataset.photo); });
  window.addEventListener("pagehide", stopCamera);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else void initialize();
