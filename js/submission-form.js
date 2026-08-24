const escapeHtml = (value) =>
  String(value ?? "—").replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[char],
  );

export function openSubmissionForm({
  title,
  reference,
  fields,
  pictureUrl = "",
  filename = "tfro-submission",
}) {
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Allow pop-ups to view, print, or save the submission form.");
    return;
  }
  popup.opener = null;

  const logoUrl = new URL("../Logo/TFRO Logo.jpg", window.location.href).href;
  const rows = fields
    .map(
      ({ label, value }) => `
    <div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>
  `,
    )
    .join("");
  const safeFilename = String(filename).replace(/[^a-zA-Z0-9_-]/g, "-");

  popup.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(safeFilename)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#edf3ef;color:#18382d;font:14px Arial,sans-serif}.toolbar{position:sticky;top:0;display:flex;justify-content:center;gap:10px;padding:12px;background:#123e2d}.toolbar button{padding:10px 16px;border:0;border-radius:7px;font-weight:700;cursor:pointer}.save{background:#f4c430;color:#173d2f}.print{background:#fff;color:#173d2f}.sheet{width:210mm;min-height:297mm;margin:18px auto;padding:16mm;background:#fff;box-shadow:0 8px 30px #0002}.header{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:3px solid #178a5e}.logo{width:70px;height:70px;object-fit:contain}.header h1{margin:0;color:#0b3d2e;font-size:24px}.header p{margin:4px 0 0;color:#657a70}.form-title{text-align:center;margin:22px 0}.form-title h2{margin:0 0 6px;text-transform:uppercase}.form-title p{margin:0}.content{display:grid;grid-template-columns:1fr 36mm;gap:18px}.fields{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #bccbc3;border-left:1px solid #bccbc3}.field{min-height:58px;padding:9px;border-right:1px solid #bccbc3;border-bottom:1px solid #bccbc3}.field span{display:block;margin-bottom:7px;color:#60746a;font-size:11px;font-weight:700;text-transform:uppercase}.field strong{white-space:pre-wrap}.photo{width:36mm;height:36mm;border:1px solid #90a79b;display:flex;align-items:center;justify-content:center;text-align:center;color:#71847b;overflow:hidden}.photo img{width:100%;height:100%;object-fit:cover}.cert{margin-top:28px;padding-top:14px;border-top:1px solid #bccbc3;font-size:12px;line-height:1.6}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:55px;text-align:center}.line{padding-top:7px;border-top:1px solid #18382d}.hint{text-align:center;margin:20px 0;color:#64748b;font-size:12px}
    @page{size:A4;margin:0}@media print{body{background:#fff}.toolbar,.hint{display:none}.sheet{margin:0;box-shadow:none;width:210mm;min-height:297mm}}
  </style></head><body><div class="toolbar"><button class="save" onclick="window.print()">Save as PDF</button><button class="print" onclick="window.print()">Print Form</button></div>
  <main class="sheet"><header class="header"><img class="logo" src="${escapeHtml(logoUrl)}" alt="TFRO logo"><div><h1>TFRO MIS</h1><p>Tricycle Franchising and Regulatory Office · Lucena City</p></div></header>
  <section class="form-title"><h2>${escapeHtml(title)}</h2><p>Reference: <strong>${escapeHtml(reference)}</strong></p></section>
  <section class="content"><div class="fields">${rows}</div><div class="photo">${pictureUrl ? `<img src="${escapeHtml(pictureUrl)}" alt="2×2 picture">` : "2×2<br>Picture"}</div></section>
  <p class="cert">I certify that the information shown above is the information submitted through TFRO MIS. This system-generated copy is subject to verification by TFRO.</p>
  <div class="signatures"><div class="line">Operator / Applicant Signature</div><div class="line">TFRO Receiving Officer</div></div>
  <p class="hint">Use “Save as PDF” and choose the PDF destination in the print dialog.</p></main></body></html>`);
  popup.document.close();
}

const valueOrBlank = (value) => escapeHtml(value || "");
const checked = (condition) => (condition ? "&#10003;" : "");

function formatFormDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? valueOrBlank(value)
    : date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
}

function ageFromBirthDate(value) {
  if (!value) return "";
  const birth = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()))
    age -= 1;
  return age >= 0 ? String(age) : "";
}

export function openRenewalProfileForm({
  renewal,
  franchise = {},
  documentTypes = [],
  pictureUrl = "",
}) {
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Allow pop-ups to view, print, or save the TFRO renewal profile.");
    return;
  }
  popup.opener = null;
  const tfroLogo = new URL("../Logo/TFRO Logo.jpg", window.location.href).href;
  const cityLogo = new URL("../Logo/Lucena City Logo.png", window.location.href)
    .href;
  const docs = new Set(documentTypes);
  const inspection = renewal.inspection_results || {};
  const purpose =
    renewal.renewal_type === "change_motor"
      ? "CHANGE MOTOR / RENEWAL"
      : "FRANCHISE / MTOP RENEWAL";
  const applicantNames = String(renewal.operator_name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = applicantNames.shift() || "";
  const lastName = applicantNames.pop() || "";
  const middleName = applicantNames.join(" ");
  const filename =
    `TFRO-Renewal-Profile-${renewal.renewal_code || renewal.id}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "-",
    );
  const line = (label, value, className = "") =>
    `<div class="line-field ${className}"><b>${escapeHtml(label)}</b><span>${valueOrBlank(value)}</span></div>`;
  const requirement = (label, type) =>
    `<div class="requirement"><span class="check">${checked(docs.has(type))}</span>${escapeHtml(label)}</div>`;
  const inspectionItem = (label, key) =>
    `<div class="inspect-item"><b>${escapeHtml(label)}</b><span>${checked(inspection[key])}</span></div>`;

  popup.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e9efec;color:#050505;font:9px Arial,sans-serif}.toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;gap:10px;padding:10px;background:#123e2d}.toolbar button{padding:9px 15px;border:0;border-radius:6px;font-weight:700;cursor:pointer}.save{background:#f3d72f}.print{background:#fff}.sheet{width:210mm;min-height:297mm;margin:14px auto;background:#fff;padding:5mm;box-shadow:0 6px 24px #0002}.masthead{height:21mm;border:1.25px solid #111;display:flex;align-items:center;background:linear-gradient(120deg,#174d32 0 59%,#f0dc29 59% 65%,#fff 65% 68%,#3b8e63 68% 73%,#fff 73% 76%,#e9dc24 76% 81%,#fff 81%)}.masthead .office{padding:3mm;color:#fff;flex:1}.office h1{font-size:13px;margin:0;color:#fff}.office p{margin:2px 0}.logos{display:flex;gap:6px;padding:4px 8px;background:#fff}.logos img{width:14mm;height:14mm;object-fit:contain}.hotline{height:6mm;border:1.25px solid #111;border-top:0;padding:2px 6px;background:#f5e92d;font-size:7px}.form-code{float:right;min-width:42mm;margin:-2px -6px 0 0;background:#075373;color:#fff;padding:4px 18px;text-align:center;font-weight:bold}.title-grid{clear:both;display:grid;grid-template-columns:1fr 46mm;border:1.25px solid #111;border-top:0}.title{background:#050505;color:#fff;text-align:center;padding:6px;font:bold italic 12px Georgia,serif}.meta{display:grid;grid-template-columns:17mm 1fr}.meta b,.meta span{padding:2px;border-left:1px solid #111;border-bottom:1px solid #111;font-size:7px}.meta :nth-last-child(-n+2){border-bottom:0}.grid{display:grid;border-left:1.25px solid #111;border-top:1.25px solid #111}.app-grid{grid-template-columns:1fr 46mm}.line-field{min-height:8mm;padding:2px 4px;border-right:1.25px solid #111;border-bottom:1.25px solid #111}.line-field b{display:block;font-size:6.5px;text-transform:uppercase}.line-field span{display:block;margin-top:3px;font-weight:700;font-size:9px}.name-values{display:grid!important;grid-template-columns:1fr 1fr 1fr;margin:2px -4px -2px!important}.name-values i{min-height:4mm;padding:1px 4px;border-right:1px solid #bbb;text-align:center;font-style:normal;font-weight:700}.name-labels{display:grid;grid-template-columns:1fr 1fr 1fr;margin:2px -4px -2px;color:#444;font-size:5.5px;text-align:center}.full{grid-column:1/-1}.four{display:grid;grid-template-columns:1.4fr 1.5fr .45fr .9fr}.vehicle-head,.office-head{background:#050505;color:#fff;text-align:center;padding:3px;font-weight:bold;border:1.25px solid #111;border-top:0}.vehicle{grid-template-columns:1fr 1fr}.route{display:grid;grid-template-columns:1fr 38mm;border:1.25px solid #111;border-top:0}.route div{padding:4px}.route b{font-size:7px}.route-name{border-left:1.25px solid #111;text-align:center;font-weight:bold}.profile-body{display:grid;grid-template-columns:1fr 38mm;border:1.25px solid #111;border-top:0}.cert{padding:5px;line-height:1.35;text-align:justify}.signature{margin:8px 5px 0 55%;border-top:1px solid #111;text-align:center;padding-top:1px;font-size:6px}.photo{grid-column:2;grid-row:1/3;min-height:50mm;border-left:1.25px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:bold;overflow:hidden}.photo img{width:100%;height:100%;object-fit:cover}.requirements{padding:3px 5px;border-top:1.25px solid #111}.requirements h3{margin:0 0 2px;font-size:7px}.requirement{display:flex;gap:4px;align-items:center;line-height:1.4}.check{display:inline-flex;width:8px;height:8px;border:1px solid #111;align-items:center;justify-content:center;font-weight:bold}.office-head{text-align:left;padding-left:7px}.inspection{display:grid;grid-template-columns:1fr 1fr 1fr;border:1.25px solid #111;border-top:0}.inspect-column{padding:3px;border-right:1px solid #aaa}.inspect-item{display:flex;justify-content:space-between;min-height:4mm;border-bottom:1px solid #bbb;padding:1px 4px}.inspector{grid-column:3;grid-row:1/3;padding:5px;text-align:center}.inspector-line{margin-top:13px;border-top:1px solid #111;padding-top:2px;font-size:6px}.sidecar{grid-column:1/3;border-top:1px solid #111;padding:3px;min-height:10mm}.approvals{display:grid;grid-template-columns:1fr 1fr;gap:24mm;padding:11mm 11mm 3mm;text-align:center;border:1.25px solid #111;border-top:0}.approval-line{border-top:1px solid #111;padding-top:2px}.footer{text-align:center;font-size:6px;padding-top:2px}.hint{text-align:center;color:#64748b}.muted{font-weight:normal!important;color:#333}@page{size:A4;margin:0}@media print{body{background:#fff}.toolbar,.hint{display:none}.sheet{margin:0;box-shadow:none;width:210mm;min-height:297mm}}
  </style><style>
    html,body,.sheet,.sheet *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
    .sheet{width:8.5in;min-height:13in}
    .inspection .inspector{grid-row:2}
    .print-guide{align-self:center;color:#fff;font-size:11px}
    @page{size:8.5in 13in;margin:0}
    @media print{
      html,body{width:8.5in;height:13in;margin:0!important;padding:0!important;background:#fff!important}
      .sheet{display:grid!important;grid-template-rows:21mm 6mm 18mm 28mm 11mm 5mm 44mm 10mm 65mm 5mm 55mm 1fr 3mm;width:8.5in!important;height:13in!important;min-height:13in!important;margin:0!important;padding:0.2in!important;overflow:hidden!important}
      .masthead,.hotline,.title-grid,.app-grid,.four,.vehicle-head,.vehicle,.route,.profile-body,.office-head,.inspection,.approvals,.footer{min-height:0!important;height:auto!important;margin:0!important}
      .app-grid{grid-template-rows:1fr 1fr}.app-grid .line-field,.four .line-field,.vehicle .line-field{min-height:0!important;height:auto!important}
      .vehicle{grid-template-rows:repeat(4,1fr)}.profile-body{grid-template-rows:2fr 3fr}.photo{min-height:0!important;height:auto!important}
      .inspection{grid-template-rows:2fr 1fr}.approvals{align-items:end;padding:0 11mm 4mm!important}
      .masthead,.title,.vehicle-head,.office-head,.form-code,.hotline{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}
    }
  </style></head><body><div class="toolbar"><button class="save" onclick="window.print()">Save as PDF</button><button class="print" onclick="window.print()">Print Form</button><span class="print-guide">Paper: Folio / 8.5 × 13 in · Scale: 100% · Margins: None · Background graphics: On</span></div><main class="sheet">
  <header class="masthead"><div class="office"><h1>TRICYCLE FRANCHISING AND REGULATORY OFFICE</h1><p>City Government of Lucena | Republic of the Philippines</p></div><div class="logos"><img src="${escapeHtml(tfroLogo)}" alt="TFRO"><img src="${escapeHtml(cityLogo)}" alt="Lucena City"></div></header><div class="hotline">Hotline: 09395471681 | E-mail address: tfrolucena2025@gmail.com <span class="form-code">TFRO — 005</span></div>
  <section class="title-grid"><div class="title">Application for MOTORIZED TRICYCLE<br>OPERATOR PERMIT</div><div class="meta"><b>DATE:</b><span>${formatFormDate(renewal.created_at)}</span><b>TYPE:</b><span>${escapeHtml(purpose)}</span><b>FRANCHISE NO.:</b><span>${valueOrBlank(franchise.franchise_number)}</span></div></section>
  <section class="grid app-grid"><div class="line-field"><b>Name of Applicant</b><span class="name-values"><i>${valueOrBlank(lastName)}</i><i>${valueOrBlank(firstName)}</i><i>${valueOrBlank(middleName)}</i></span><small class="name-labels"><i>Last Name</i><i>First Name</i><i>Middle Name</i></small></div>${line("Contact Number", renewal.operator_contact)}${line("Residential Address", renewal.operator_address, "full")}</section>
  <section class="four">${line("Birthdate", formatFormDate(franchise.birth_date))}${line("Place of Birth", franchise.birth_place)}${line("Age", ageFromBirthDate(franchise.birth_date))}${line("Civil Status", franchise.civil_status)}</section>
  <div class="vehicle-head">DESCRIPTION OF VEHICLE</div><section class="grid vehicle">${line("Make", franchise.motorcycle_brand)}${line("Plate No.", renewal.plate_number)}${line("Model", franchise.motorcycle_year_model)}${line("O.R. No.", renewal.current_or_number)}${line("Motor No.", renewal.engine_number)}${line("Date of O.R.", "")}${line("Chassis No.", renewal.chassis_number)}${line("C.R. No.", renewal.current_cr_number || franchise.chassis_cr_number)}</section>
  <section class="route"><div><b>THIS APPLICATION PROPOSES TO OPERATE TRICYCLE SERVICE ROUTE ON</b></div><div class="route-name">${valueOrBlank(franchise.route || "LUCENA PROPER")}</div></section>
  <section class="profile-body"><div class="cert">I hereby certify the correctness of the foregoing information. I am fully aware that the franchise permit which may be issued is subject to all requirements of existing ordinances including all rules and regulations promulgated by competent authorities of the City of Lucena.<div class="signature">Signature or Right Thumbmark of Applicant</div></div><section class="requirements"><h3>REQUIREMENTS:</h3>${requirement("Voter's Certificate / Voter's ID / Any government-issued ID", "voters_certificate")}${requirement("Barangay Clearance", "barangay_clearance")}${requirement("Community Tax Certificate (Cedula)", "cedula")}${requirement("Latest Registration OR/CR — cross-copy for verification with the original", "certificate_registration")}${requirement("Tricycle unit for inspection", "official_receipt")}${requirement("Police / PMBL Clearance (For New Applicant)", "pmbl_certification")}</section><div class="photo">${pictureUrl ? `<img src="${escapeHtml(pictureUrl)}" alt="2x2 picture">` : "2×2 PICTURE"}</div></section>
  <div class="office-head">DO NOT WRITE ANYTHING (FOR TFRO USE ONLY)</div><section class="inspection"><div class="inspect-column">${inspectionItem("TAIL LIGHT", "lights_signals")}${inspectionItem("SIGNAL LIGHT", "lights_signals")}${inspectionItem("HEADLIGHT", "lights_signals")}${inspectionItem("BRAKES", "brake_system")}${inspectionItem("HORN", "safety_compliance")}${inspectionItem("BODY COLOR", "general_cleanliness")}</div><div class="inspect-column">${inspectionItem("MC — Front", "riding_condition")}${inspectionItem("MC — Front", "lights_signals")}${inspectionItem("MC — Front", "brake_system")}${inspectionItem("MC — Front", "tires_wheels")}${inspectionItem("MC — Seat", "safety_compliance")}${inspectionItem("MC — Overall", "general_cleanliness")}</div><div class="inspect-column">${inspectionItem("Side Car — Rear", "lights_signals")}${inspectionItem("Side Car — Rear", "safety_compliance")}${inspectionItem("Side Car — Rear", "brake_system")}${inspectionItem("Side Car — Seat", "riding_condition")}</div><div class="sidecar"><b>DESIGN AND SPECIFICATIONS OF SIDECAR</b><br>${valueOrBlank(renewal.inspection_remarks)}</div><div class="inspector"><b>INSPECTED BY:</b><div class="inspector-line">Printed Name Over Signature</div><div class="inspector-line">DATE: ${formatFormDate(renewal.reviewed_at)}</div></div></section>
  <section class="approvals"><div class="approval-line"><b>CRISELDA C. DAVID</b><br>TFRO HEAD</div><div class="approval-line"><b>MARK B. ALCALA</b><br>City Mayor</div></section><footer class="footer">System-generated TFRO renewal profile · Reference ${valueOrBlank(renewal.renewal_code)}</footer><p class="hint">In the print dialog choose Folio (8.5 × 13 in), 100% scale, no margins, and enable background graphics.</p></main></body></html>`);
  popup.document.close();
}

export function openPmblCertificationForm({ renewal, franchise = {} }) {
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Allow pop-ups to view, print, or save the PMBL certification.");
    return;
  }
  popup.opener = null;
  popup.addEventListener("load", () => {
    popup.document.head.insertAdjacentHTML(
      "beforeend",
      `<style>
        @page{size:letter landscape;margin:0}
        .sheet{width:11in!important;min-height:8.5in!important}
        @media print{html,body{width:11in!important;height:8.5in!important}.sheet{width:11in!important;height:8.5in!important;min-height:8.5in!important;margin:0!important;padding:.3in .42in!important}}
      </style>`,
    );
    const printGuide = popup.document.querySelector(".toolbar span");
    if (printGuide) printGuide.textContent = "US Letter landscape · 11 × 8.5 in · 100% scale · No margins · Background graphics on";
    const hint = popup.document.querySelector(".hint");
    if (hint) hint.textContent = "Choose Letter paper in landscape orientation, 100% scale, no margins, and enable background graphics.";
  }, { once: true });
  const cityLogo = new URL("../Logo/Lucena City Logo.png", window.location.href)
    .href;
  const issued = new Date();
  const applicant = valueOrBlank(renewal.operator_name);
  const filename =
    `PMBL-Certification-${renewal.renewal_code || renewal.id}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "-",
    );
  const pmblToolbarTheme =
    ".toolbar{background:#123e2d!important}.toolbar .save{background:#f4c430!important;color:#173d2f!important}.toolbar .print{color:#123e2d!important}";
  popup.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title><style>${pmblToolbarTheme}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;background:#e8ecef;color:#111;font:15px "Times New Roman",serif}.toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;gap:10px;padding:10px;background:#082d59;color:#fff;font:12px Arial,sans-serif}.toolbar button{padding:9px 16px;border:0;border-radius:6px;font-weight:bold;cursor:pointer}.save{background:#ef233c;color:#fff}.print{background:#fff;color:#082d59}.sheet{position:relative;width:8.5in;min-height:13in;margin:14px auto;padding:.35in .42in;background:#fff;box-shadow:0 6px 24px #0002}.pmbl-head{height:1.05in;display:grid;grid-template-columns:1fr 1.9in;align-items:center;border-top:1px solid #999}.brand{font-family:Arial,sans-serif}.brand h1{margin:0;color:#ed1b2f;font-size:29px;font-style:italic;line-height:.9}.brand h2{margin:5px 0 1px;color:#092e60;font-size:19px}.brand p{margin:0;color:#092e60;font-size:10px;font-weight:bold}.emblems{height:.92in;display:flex;align-items:center;justify-content:flex-end;gap:9px;background:linear-gradient(55deg,transparent 0 18%,#ed1b3b 18%);padding:5px 8px}.seal{width:.68in;height:.68in;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#092e60;color:#fff;font:bold 8px Arial;text-align:center}.emblems img{width:.68in;height:.68in;object-fit:contain}.form-code{float:right;margin-top:-3px;background:#092e60;color:#fff;padding:2px 13px;font:bold 15px Arial}.title{clear:both;margin:22px 0 28px;text-align:center;font-size:27px;letter-spacing:1px}.concern{margin:0 0 25px 25px;font-size:17px}.body-copy{margin:0 18px;text-align:justify;text-indent:.48in;font-size:16px;line-height:1.45}.body-copy+.body-copy{margin-top:19px}.fill{display:inline-block;min-width:130px;padding:0 5px;border-bottom:1px solid #111;text-align:center;font-weight:bold;text-indent:0}.wide{min-width:300px}.medium{min-width:220px}.checks{white-space:nowrap}.issue{margin-top:22px}.closing{display:grid;grid-template-columns:1fr 1fr;gap:1in;margin-top:34px;font-size:16px}.closing-title{margin-bottom:33px}.signature-line{width:245px;border-top:1px solid #111;padding-top:3px}.president{font-weight:bold;font-size:17px}.footer-note{position:absolute;bottom:.3in;left:.42in;right:.42in;text-align:center;color:#777;font:8px Arial}.hint{text-align:center;color:#64748b;font:11px Arial}@page{size:8.5in 13in;margin:0}@media print{html,body{width:8.5in;height:13in;margin:0!important;background:#fff}.toolbar,.hint{display:none}.sheet{width:8.5in;height:13in;min-height:13in;margin:0;padding:.35in .42in;box-shadow:none}}
  </style></head><body><div class="toolbar"><button class="save" onclick="window.print()">Save as PDF</button><button class="print" onclick="window.print()">Print Certification</button><span>Folio 8.5 × 13 in · 100% scale · No margins · Background graphics on</span></div><main class="sheet"><header class="pmbl-head"><div class="brand"><h1>PMBL</h1><h2>PEDERASYON NG MGA MAGTATRICYCLE SA BOOM LUCENA</h2><p>Lucena City Tricycle Terminal (Paya) Compound, Claro M. Recto Street, Brgy. 9, Lucena City</p></div><div class="emblems"><div class="seal">PMBL<br>LUCENA</div><img src="${escapeHtml(cityLogo)}" alt="City of Lucena"></div></header><div class="form-code">TFRO - 003</div><h1 class="title">CERTIFICATION</h1><p class="concern">TO WHOM IT MAY CONCERN:</p><p class="body-copy">This is to certify that Mr./Ms. <span class="fill wide">${applicant}</span>, with TFRO Franchise No. <span class="fill">${valueOrBlank(franchise.franchise_number)}</span>, of legal age, a resident of <span class="fill medium">${valueOrBlank(renewal.operator_address)}</span>, is a bonafide member of the <span class="fill medium">${valueOrBlank(franchise.toda_name)}</span> TODA, serving as a <span class="checks">☐ Driver / ☑ Operator / ☐ both.</span></p><p class="body-copy">Based on the records of this Association, he/she has no pending obligations, complaints, or violations and is in good standing as of this date.</p><p class="body-copy">This certification is issued upon the request of the above-named person for whatever legal purpose it may serve.</p><p class="body-copy issue">Issued this <span class="fill">${issued.getDate()}</span> day of <span class="fill">${issued.toLocaleDateString("en-PH", { month: "long" })}</span>, <span class="fill">${issued.getFullYear()}</span> at Lucena City, Philippines.</p><section class="closing"><div><div class="closing-title">Very Truly Yours,</div><div class="signature-line">TODA President/Authorized officer</div><div>Contact No. ____________________</div></div><div><div class="closing-title">Noted by:</div><div class="president">ERLITO D. SALES</div><div>PMBL President</div></div></section><div class="footer-note">System-generated PMBL certification · Renewal reference ${valueOrBlank(renewal.renewal_code)}</div><p class="hint">Choose Folio (8.5 × 13 in), 100% scale, no margins, and enable background graphics.</p></main></body></html>`);
  popup.document.close();
}
