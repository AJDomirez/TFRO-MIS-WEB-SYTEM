const escapeHtml = (value) => String(value ?? "—").replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
})[char]);

export function openSubmissionForm({ title, reference, fields, pictureUrl = "", filename = "tfro-submission" }) {
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Allow pop-ups to view, print, or save the submission form.");
    return;
  }
  popup.opener = null;

  const logoUrl = new URL("../Logo/TFRO Logo.jpg", window.location.href).href;
  const rows = fields.map(({ label, value }) => `
    <div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>
  `).join("");
  const safeFilename = String(filename).replace(/[^a-zA-Z0-9_-]/g, "-");

  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(safeFilename)}</title>
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
