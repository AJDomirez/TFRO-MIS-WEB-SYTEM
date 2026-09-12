const CACHE_NAME = "tfro-imis-shell-v2";
const CORE_ASSETS = [
  "./",
  "html/application.html", "html/auditlog.html", "html/dashboard.html", "html/driver.html",
  "html/driververify.html", "html/enforcerportal.html", "html/enforcers.html", "html/franchise.html",
  "html/index.html", "html/login.html", "html/motorequests.html", "html/notification.html",
  "html/operator.html", "html/operatorapplication.html", "html/operatorportal.html",
  "html/operatorprofile.html", "html/payment.html", "html/profile.html", "html/profilephoto.html",
  "html/register.html", "html/renewal.html", "html/renewals.html", "html/report.html", "html/violation.html",
  "css/application.css", "css/auditlog.css", "css/dashboard.css", "css/driver.css",
  "css/driververify.css", "css/enforcer-admin.css", "css/enforcer.css", "css/franchise.css",
  "css/guided-tour.css", "css/landing.css", "css/notification.css", "css/operator.css",
  "css/operatorportal.css", "css/operatorprofile.css", "css/payment.css", "css/profile.css",
  "css/profilephoto.css", "css/renewal-admin.css", "css/renewal.css", "css/report.css",
  "css/style.css", "css/tfro-theme.css", "css/ticket-camera.css", "css/violation.css",
  "js/application.js", "js/audit-helper.js", "js/auditlog.js", "js/auth-guard.js",
  "js/csv-export.js", "js/dashboard.js", "js/driver.js", "js/driververify.js",
  "js/enforcerportal.js", "js/enforcers.js", "js/form-delivery.js", "js/franchise.js",
  "js/guided-tour.js", "js/landing.js", "js/login.js", "js/motorequests.js",
  "js/notification.js", "js/offline-status.js", "js/offline-sync.js", "js/operator.js",
  "js/operatorapplication.js", "js/operatorportal.js", "js/operatorprofile.js", "js/payment.js",
  "js/pdf-form.js", "js/profile.js", "js/profilephoto.js", "js/register.js", "js/renewal.js",
  "js/renewals.js", "js/report.js", "js/sidebar-user.js", "js/submission-form.js",
  "js/supabase-config.js", "js/supabase.js", "js/trike-drive.js", "js/violation.js",
  "js/vendor/pdf-lib.min.js", "js/vendor/qrcode.min.js",
  "Logo/BG1.jpg", "Logo/BG2.jpg", "Logo/BG3.png", "Logo/BG4.png", "Logo/BG5.jpg",
  "Logo/Lucena City Logo.png", "Logo/PMBL Logo.png", "Logo/TFRO Logo.jpg",
  "Logo/TFRO-005 Footer.png", "Logo/TFRO-005 Header.png",
  "forms/PMBL TFRO-003 Certification.pdf", "forms/TFRO-001 Temporary MTOP.pdf",
  "forms/TFRO-002 Petition for Dropping.pdf", "forms/TFRO-004 Checklist for Renewal.pdf",
  "forms/TFRO-005 Application Form.pdf", "forms/TFRO-007 Certification of Dropping.pdf",
  "forms/TFRO-009 Order of Payment.pdf", "forms/TFRO-010 Unit Releasing Slip.pdf",
  "forms/public/assets/tfro-official-header.png", "forms/public/assets/tfro-official-footer-v2.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm",
  "https://cdn.jsdelivr.net/npm/chart.js",
  "https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css"
];

const scopedUrl = (asset) => /^https?:/.test(asset) ? asset : new URL(asset, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(scopedUrl(asset))));
  }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith("tfro-imis-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin.includes("supabase.co")) return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    try {
      const response = await fetch(event.request);
      if (response.ok || response.type === "opaque") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match(scopedUrl("html/index.html"));
      throw error;
    }
  })());
});
