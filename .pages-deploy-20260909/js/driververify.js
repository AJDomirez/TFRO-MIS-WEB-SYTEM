import { supabase } from "./supabase.js";
import { requireRole, destinationForRole } from "./auth-guard.js";

const allowedRoles = ["admin", "staff", "operator", "traffic_enforcer"];
const result = document.getElementById("verificationResult"), status = document.getElementById("scanStatus"), video = document.getElementById("scannerVideo"), cameraBox = document.getElementById("cameraBox");
let stream = null, scanning = false;
const escapeHtml = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"})[c]);

function tokenFrom(value) { try { const url = new URL(value); return url.searchParams.get("t") || ""; } catch { return String(value || "").trim(); } }
function showStatus(message, error=false) { status.textContent = message; status.classList.toggle("error", error); }
function stopCamera() { scanning = false; stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null; cameraBox.hidden = true; document.getElementById("stopScanner").hidden = true; }

async function verifyToken(rawToken) {
  const token = tokenFrom(rawToken);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(token)) return showStatus("This is not a valid TFRO Driver QR token.", true);
  showStatus("Checking the Driver record…");
  const { data, error } = await supabase.from("driver_qr_verifications").select("full_name,license_number,license_type,license_expiration,license_status,operator_name,compliance,violation_count,updated_at").eq("qr_token", token).maybeSingle();
  if (error || !data) { result.hidden = true; return showStatus(error?.message || "Driver QR record was not found.", true); }
  stopCamera();
  const expired = data.license_expiration && new Date(`${data.license_expiration}T23:59:59`) < new Date();
  const valid = data.license_status === "verified" && !expired;
  result.innerHTML = `<div class="verified-head"><i class="${valid ? "ri-checkbox-circle-fill" : "ri-error-warning-fill"}"></i><div><h2>${valid ? "Authenticated Driver Record" : "Driver Record Found"}</h2><p>${valid ? "License is verified and current." : "Review the license warning below."}</p></div></div><div class="verification-grid"><div><span>Driver</span><strong>${escapeHtml(data.full_name)}</strong></div><div><span>License Number</span><strong>${escapeHtml(data.license_number)}</strong></div><div><span>License Type</span><strong>${escapeHtml(data.license_type || "—")}</strong></div><div><span>Expiration</span><strong>${escapeHtml(data.license_expiration || "—")}</strong></div><div><span>Operator</span><strong>${escapeHtml(data.operator_name || "—")}</strong></div><div><span>Compliance</span><strong>${escapeHtml(data.compliance)}</strong></div><div><span>Recorded Violations</span><strong>${Number(data.violation_count || 0)}</strong></div><div><span>Record Updated</span><strong>${new Date(data.updated_at).toLocaleString("en-PH")}</strong></div></div>${valid ? "" : `<p class="warning"><b>Warning:</b> License is ${expired ? "expired" : escapeHtml(data.license_status || "not verified")}.</p>`}`;
  result.hidden = false; showStatus("Driver QR authentication completed.");
}

async function scanLoop(detector) { while (scanning) { try { const codes = await detector.detect(video); if (codes[0]?.rawValue) { await verifyToken(codes[0].rawValue); return; } } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } }
async function startCamera() {
  if (!("BarcodeDetector" in window)) return showStatus("Live QR scanning is not supported by this browser. Use Chrome/Edge or paste the QR link below.", true);
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }); video.srcObject = stream; await video.play(); cameraBox.hidden = false; document.getElementById("stopScanner").hidden = false; scanning = true; showStatus("Camera active. Point it at the Driver QR code."); scanLoop(new BarcodeDetector({ formats:["qr_code"] })); } catch (error) { showStatus(error.name === "NotAllowedError" ? "Camera permission was denied. You can still paste the QR link below." : "Camera could not be started: " + error.message, true); }
}

document.getElementById("startScanner").addEventListener("click", startCamera); document.getElementById("stopScanner").addEventListener("click", stopCamera);
document.getElementById("tokenForm").addEventListener("submit", (event) => { event.preventDefault(); verifyToken(document.getElementById("tokenInput").value); }); window.addEventListener("pagehide", stopCamera);
(async () => { const { profile } = await requireRole(allowedRoles); if (!profile) return; document.getElementById("homeLink").href = destinationForRole(profile.role); const token = new URLSearchParams(location.search).get("t"); if (token) verifyToken(token); })();
