const id = "tfroConnectionStatus";

function show(text, tone = "offline") {
  let banner = document.getElementById(id);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = id;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    Object.assign(banner.style, {
      position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)",
      zIndex: "10000", maxWidth: "min(92vw, 680px)", padding: "10px 16px",
      borderRadius: "999px", color: "white", font: "600 14px/1.35 system-ui, sans-serif",
      boxShadow: "0 6px 24px rgba(0,0,0,.25)", textAlign: "center",
    });
    document.body.appendChild(banner);
  }
  banner.style.background = tone === "error" ? "#991b1b" : tone === "online" ? "#123f73" : "#92400e";
  banner.textContent = text;
  banner.hidden = false;
  if (tone === "online") window.setTimeout(() => { banner.hidden = true; }, 4500);
}

function showNetworkState() {
  if (!navigator.onLine) show("Offline mode: showing synchronized data. New entries will send when internet returns.");
}

window.addEventListener("offline", showNetworkState);
window.addEventListener("online", () => show("Internet restored. Synchronizing pending data…", "online"));
window.addEventListener("tfro-offline-cached", (event) => show(`Offline mode: showing data synchronized ${new Date(event.detail.savedAt).toLocaleString("en-PH")}.`));
window.addEventListener("tfro-offline-queued", (event) => show(`Saved on this device. ${event.detail.pending} pending change${event.detail.pending === 1 ? "" : "s"} will synchronize automatically.`));
window.addEventListener("tfro-offline-synced", () => show("All pending data synchronized successfully.", "online"));
window.addEventListener("tfro-offline-sync-error", (event) => show(`Synchronization paused: ${event.detail.message}`, "error"));

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showNetworkState, { once: true });
else showNetworkState();
