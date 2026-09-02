const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

const root = __dirname;
const documents = [
  ["requirements/franchise-application/01-voters-certificate.pdf", "VOTER'S CERTIFICATE", "TEST-VC-2026-001"],
  ["requirements/franchise-application/02-barangay-clearance.pdf", "BARANGAY CLEARANCE", "TEST-BC-2026-001"],
  ["requirements/franchise-application/03-cedula.pdf", "COMMUNITY TAX CERTIFICATE / CEDULA", "TEST-CTC-2026-001"],
  ["requirements/franchise-application/04-ohcr.pdf", "OFFICIAL RECEIPT AND CERTIFICATE OF REGISTRATION", "TEST-OHCR-2026-001"],
  ["requirements/franchise-application/05-insurance.pdf", "THIRD-PARTY AND PASSENGER INSURANCE", "TEST-INS-2026-001"],
  ["requirements/franchise-application/06-pmbl-certification.pdf", "PMBL MEMBERSHIP CERTIFICATION", "TEST-PMBL-2026-001"],
  ["requirements/renewal/a-payment-receipt.pdf", "CITY TREASURER PAYMENT RECEIPT", "TEST-PAY-2026-001"],
  ["requirements/renewal/b-official-receipt-for-hire.pdf", "UPDATED MOTORCYCLE OR - FOR HIRE", "TEST-OR-2026-001"],
  ["requirements/renewal/c-voters-certificate.pdf", "LATEST VOTER'S CERTIFICATE", "TEST-VC-2026-001"],
  ["requirements/renewal/d-insurance.pdf", "PASSENGER LIABILITY INSURANCE", "TEST-INS-2026-001"],
  ["requirements/renewal/e-cedula.pdf", "LATEST CEDULA", "TEST-CTC-2026-001"],
  ["requirements/renewal/f-barangay-clearance.pdf", "LATEST BARANGAY CLEARANCE", "TEST-BC-2026-001"],
  ["requirements/renewal/g-drivers-license.pdf", "DRIVER'S LICENSE COPY", "TEST-LIC-2026-001"],
  ["requirements/renewal/h-picture-2x2.pdf", "2X2 PICTURE PLACEHOLDER", "TEST-PHOTO-2026-001"],
  ["requirements/renewal/i-pmbl-certification.pdf", "PMBL MEMBERSHIP CERTIFICATION", "TEST-PMBL-2026-001"],
  ["requirements/change-motor/sample-change-motor-support.pdf", "CHANGE MOTOR SUPPORTING DOCUMENT", "TEST-CM-2026-001"],
];

async function createSamplePdf(target, title, reference) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 36, y: 36, width: 540, height: 720, borderWidth: 2, borderColor: rgb(0.05, 0.35, 0.25) });
  page.drawText("TFRO MIS QA DOCUMENT", { x: 60, y: 710, size: 16, font: bold, color: rgb(0.05, 0.35, 0.25) });
  page.drawText(title, { x: 60, y: 655, size: 20, font: bold, maxWidth: 490 });
  page.drawText(`Reference: ${reference}`, { x: 60, y: 615, size: 13, font: regular });
  page.drawText("Applicant: Juan Test Operator", { x: 60, y: 585, size: 13, font: regular });
  page.drawText("Franchise: TEST-FR-2026-001", { x: 60, y: 558, size: 13, font: regular });
  page.drawText("Issued for software workflow validation only.", { x: 60, y: 520, size: 13, font: regular });
  page.drawText("SAMPLE", { x: 115, y: 310, size: 92, font: bold, rotate: degrees(35), color: rgb(0.8, 0.15, 0.15), opacity: 0.22 });
  page.drawText("FOR SYSTEM TESTING ONLY — NOT A VALID DOCUMENT", { x: 76, y: 90, size: 14, font: bold, color: rgb(0.75, 0.08, 0.08) });
  const output = path.join(root, target);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, await pdf.save());
}

Promise.all(documents.map(([target, title, reference]) => createSamplePdf(target, title, reference)))
  .then(() => console.log(`Generated ${documents.length} sample PDFs.`))
  .catch((error) => { console.error(error); process.exitCode = 1; });
