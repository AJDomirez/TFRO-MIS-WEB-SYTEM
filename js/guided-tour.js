import { supabase } from "./supabase.js";

const tours = {
  operator: [
    { selector: ".sidebar .menu", title: "Main navigation", text: "Use this menu to return to My Franchise, submit a franchise renewal, read notifications, and update your profile." },
    { selector: ".welcome-card", title: "Your Operator dashboard", text: "This welcome area confirms which Operator account is currently signed in." },
    { selector: ".operator-actions", title: "Application shortcuts", text: "Renew Franchise starts your three-year renewal. Change Motor opens the motor, chassis, or plate request. Add Driver takes you directly to the Driver application." },
    { selector: ".info-card", title: "Franchise details", text: "Review your franchise number, assigned route, application date, expiration, annual fee, and payment status here." },
    { selector: "#violationTable", title: "Violation records", text: "This table shows violations connected to your franchise, including the date, penalty, and payment status." },
    { selector: "#changeMotorCard", title: "Change Motor / MTOP", text: "Enter only the details that changed, attach the required picture or PDF, then submit the request for TFRO review." },
    { selector: "#driverApplicationCard", title: "Driver application", text: "Register a Driver, provide license information, and upload a clear 2×2 picture. TFRO will verify the application." },
    { selector: "#assignedDriversCard", title: "Track Driver applications", text: "See every Driver you submitted, check verification status, view the saved form, or edit applications that are still unverified." },
    { selector: ".sidebar-user", title: "Account and logout", text: "Your name and role appear here. Use the logout button when you finish, especially on a shared device." },
  ],
  traffic_enforcer: [
    { selector: ".sidebar .menu", title: "Traffic Enforcer navigation", text: "This menu returns you to the ticketing and Driver-search workspace. Your Enforcer tools are separated from TFRO Staff and Admin tools." },
    { selector: "#enforcerBadge", title: "Verified Enforcer identity", text: "Your administrator-registered Enforcer ID appears here. Only an active ID can search Drivers or submit tickets." },
    { selector: ".driver-search-card", title: "Verify a Driver", text: "Enter the complete Driver's License number and select Verify Driver. The system displays identity, license status, compliance, and previous violations." },
    { selector: "#driverSearchForm button", title: "Verify Driver button", text: "This performs an exact license-number lookup. Confirm the returned Driver before preparing a ticket." },
    { selector: "#ticketCameraCard", title: "Ticket Violation Camera", text: "Select Allow Camera in this centered panel. After granting browser permission, frame the issued ticket and select Take Picture. You can retake it or upload an existing image." },
    { selector: "#ticketHistoryCard", title: "Submitted ticket history", text: "After a Driver is verified, the Record Violation form appears. Select the official violation, enter the ticket number, take or upload a clear photo, and submit it to TFRO. Your completed submissions appear here." },
    { selector: ".sidebar-user", title: "Account and logout", text: "Check the signed-in Enforcer name here and always log out after duty or when using a shared device." },
  ],
};

let steps = [];
let current = 0;
let role = "";
let userId = "";
let spotlight;
let dialog;

function completionKey() { return `tfro-system-guide-${role}-${userId}`; }
function existingSteps() { return steps.filter((step) => { const node = document.querySelector(step.selector); return node && !node.hidden && node.getClientRects().length; }); }

function positionDialog(rect) {
  const gap = 14;
  const dialogWidth = Math.min(360, window.innerWidth - 28);
  const estimatedHeight = dialog.offsetHeight || 240;
  let left = Math.min(Math.max(14, rect.left), window.innerWidth - dialogWidth - 14);
  let top = rect.bottom + gap;
  if (top + estimatedHeight > window.innerHeight - 12) top = rect.top - estimatedHeight - gap;
  if (top < 12) { top = Math.max(12, (window.innerHeight - estimatedHeight) / 2); left = Math.min(window.innerWidth - dialogWidth - 14, rect.right + gap); }
  dialog.style.left = `${Math.max(14, left)}px`;
  dialog.style.top = `${Math.max(12, top)}px`;
}

function showStep() {
  steps = existingSteps();
  if (!steps.length) return closeTour(false);
  current = Math.min(current, steps.length - 1);
  const step = steps[current];
  const target = document.querySelector(step.selector);
  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  window.setTimeout(() => {
    const rect = target.getBoundingClientRect();
    const pad = 7;
    spotlight.style.cssText += `;top:${Math.max(5,rect.top-pad)}px;left:${Math.max(5,rect.left-pad)}px;width:${Math.min(window.innerWidth-10,rect.width+pad*2)}px;height:${Math.min(window.innerHeight-10,rect.height+pad*2)}px`;
    dialog.querySelector(".tour-step-number").textContent = current + 1;
    dialog.querySelector(".tour-count").textContent = `${current + 1} of ${steps.length}`;
    dialog.querySelector("h2").textContent = step.title;
    dialog.querySelector("p").textContent = step.text;
    dialog.querySelector(".tour-back").disabled = current === 0;
    dialog.querySelector(".tour-next").textContent = current === steps.length - 1 ? "Finish" : "Next";
    positionDialog(rect);
  }, 280);
}

function closeTour(completed = true) {
  spotlight?.remove(); dialog?.remove(); spotlight = null; dialog = null;
  document.documentElement.classList.remove("tour-open");
  if (completed && role && userId) localStorage.setItem(completionKey(), "complete");
}

function startTour() {
  closeTour(false); current = 0; steps = tours[role] || [];
  spotlight = document.createElement("div"); spotlight.className = "tour-spotlight";
  dialog = document.createElement("section"); dialog.className = "tour-dialog"; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "System walkthrough");
  dialog.innerHTML = '<div class="tour-progress"><span class="tour-step-number">1</span><span class="tour-count"></span></div><h2></h2><p></p><div class="tour-actions"><button class="tour-skip" type="button">Skip guide</button><button class="tour-back" type="button">Back</button><button class="tour-next" type="button">Next</button></div>';
  document.body.append(spotlight, dialog); document.documentElement.classList.add("tour-open");
  dialog.querySelector(".tour-skip").addEventListener("click", () => closeTour(true));
  dialog.querySelector(".tour-back").addEventListener("click", () => { if (current > 0) { current -= 1; showStep(); } });
  dialog.querySelector(".tour-next").addEventListener("click", () => { if (current >= steps.length - 1) closeTour(true); else { current += 1; showStep(); } });
  showStep();
}

async function initializeGuide() {
  const button = document.createElement("button"); button.type = "button"; button.className = "system-guide-btn"; button.innerHTML = '<i class="ri-question-line"></i> System Guide'; button.addEventListener("click", startTour); document.body.append(button);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  role = profile?.role || ""; userId = user.id; steps = tours[role] || [];
  if (steps.length && !localStorage.getItem(completionKey())) window.setTimeout(startTour, 1000);
  window.addEventListener("resize", () => { if (dialog) showStep(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && dialog) closeTour(true); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeGuide, { once: true }); else void initializeGuide();
