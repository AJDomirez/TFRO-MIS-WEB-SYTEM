const PDF_LIB_URL = new URL("./vendor/pdf-lib.min.js", import.meta.url).href;

let pdfLibPromise;

function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDF_LIB_URL;
    script.onload = () => resolve(window.PDFLib);
    script.onerror = () => reject(new Error("Unable to load the PDF form engine."));
    document.head.appendChild(script);
  });
  return pdfLibPromise;
}

function openPdfWindow(title) {
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Allow pop-ups to generate, save, or print the PDF form.");
    return null;
  }
  popup.opener = null;
  popup.document.write(`<!doctype html><title>${title}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#eef2ef;font:16px Arial;color:#173f32}</style><p>Generating auto-filled PDF…</p>`);
  return popup;
}

function value(value) {
  return String(value ?? "").trim();
}

function formatDate(input) {
  if (!input) return "";
  const date = new Date(`${String(input).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value(input)
    : date.toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function splitName(fullName) {
  const parts = value(fullName).split(/\s+/).filter(Boolean);
  return {
    first: parts.shift() || "",
    last: parts.pop() || "",
    middle: parts.join(" "),
  };
}

function ageFromBirthDate(input) {
  if (!input) return "";
  const birth = new Date(`${String(input).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}

function drawScaled(page, font, text, x, y, size = 8, options = {}) {
  if (!value(text)) return;
  const sx = page.getWidth() / 612;
  const sy = page.getHeight() / 936;
  page.drawText(value(text), {
    x: x * sx,
    y: y * sy,
    size: size * Math.min(sx, sy),
    font,
    maxWidth: (options.maxWidth || 500) * sx,
    lineHeight: (options.lineHeight || size * 1.15) * sy,
    color: options.color,
  });
}

async function showPdf(popup, bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  popup.location.replace(url);
  popup.document.title = filename;
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}

async function embedPicture(pdfDoc, page, pictureUrl) {
  if (!pictureUrl) return;
  try {
    const response = await fetch(pictureUrl);
    const bytes = await response.arrayBuffer();
    const type = response.headers.get("content-type") || "";
    const image = type.includes("png")
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);
    const sx = page.getWidth() / 612;
    const sy = page.getHeight() / 936;
    page.drawImage(image, { x: 489 * sx, y: 269 * sy, width: 112 * sx, height: 112 * sy });
  } catch (error) {
    console.warn("The 2x2 picture could not be embedded in the PDF.", error);
  }
}

export async function openRenewalPdfForm({ renewal, franchise = {}, pictureUrl = "" }) {
  const popup = openPdfWindow("TFRO-005 Renewal Application");
  if (!popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-005 Application Form.pdf", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const source = await PDFDocument.load(templateBytes);
    const pdfDoc = await PDFDocument.create();
    const [page] = await pdfDoc.copyPages(source, [0]);
    pdfDoc.addPage(page);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const names = splitName(renewal.operator_name);
    const ink = rgb(0, 0, 0);
    const write = (text, x, y, size = 8, maxWidth = 500, useBold = false) =>
      drawScaled(page, useBold ? bold : font, text, x, y, size, { maxWidth, color: ink });

    write(formatDate(renewal.created_at), 442, 838, 7, 145);
    write(value(renewal.renewal_type).replaceAll("_", " ").toUpperCase() || "RENEWAL", 423, 815, 7, 80);
    write(franchise.franchise_number, 520, 815, 7, 85);
    write(names.last, 58, 783, 8, 150);
    write(names.first, 228, 783, 8, 150);
    write(names.middle, 391, 783, 8, 100);
    write(renewal.operator_contact, 498, 783, 8, 105);
    write(renewal.operator_address, 20, 735, 8, 555);
    write(formatDate(franchise.birth_date), 20, 687, 8, 150);
    write(franchise.birth_place, 204, 687, 8, 150);
    write(ageFromBirthDate(franchise.birth_date), 389, 687, 8, 60);
    write(franchise.civil_status, 470, 687, 8, 120);
    write(franchise.motorcycle_brand, 20, 630, 8, 235);
    write(renewal.plate_number || franchise.plate_number, 338, 630, 8, 250);
    write(franchise.motorcycle_year_model, 20, 607, 8, 235);
    write(renewal.current_or_number, 338, 607, 8, 250);
    write(renewal.engine_number || franchise.motorcycle_engine_number, 20, 584, 8, 235);
    write(formatDate(renewal.current_or_date), 338, 584, 8, 250);
    write(renewal.chassis_number || franchise.motorcycle_chassis_number, 20, 561, 8, 235);
    write(renewal.current_cr_number || franchise.chassis_cr_number, 338, 561, 8, 250);
    write(franchise.route || "LUCENA PROPER", 510, 513, 8, 90, true);
    write(renewal.inspection_remarks, 285, 168, 7, 135);
    await embedPicture(pdfDoc, page, pictureUrl);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-005-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup.close();
    console.error(error);
    alert(`Unable to generate the TFRO-005 PDF: ${error.message}`);
  }
}

export async function openPmblPdfForm({ renewal, franchise = {} }) {
  const popup = openPdfWindow("PMBL TFRO-003 Certification");
  if (!popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/PMBL TFRO-003 Certification.pdf", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const width = page.getWidth();
    const height = page.getHeight();
    const sx = width / 841.8898;
    const sy = height / 595.2756;
    const black = rgb(0, 0, 0);
    const write = (text, x, y, size = 10, maxWidth = 180, useBold = false) => {
      if (!value(text)) return;
      page.drawText(value(text), { x: x * sx, y: y * sy, size: size * Math.min(sx, sy), maxWidth: maxWidth * sx, font: useBold ? bold : font, color: black });
    };
    const issued = new Date();

    write(renewal.operator_name, 158, 357, 10, 475, true);
    write(franchise.franchise_number, 76, 339, 9, 125, true);
    write(renewal.operator_address, 401, 339, 9, 295);
    write(franchise.toda_name, 151, 318, 9, 220);
    write("X", 577, 319, 10, 15, true);
    write(String(issued.getDate()), 174, 166, 9, 30);
    write(issued.toLocaleDateString("en-PH", { month: "long" }), 257, 166, 9, 170);
    write(String(issued.getFullYear()).slice(-2), 456, 166, 9, 30);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `PMBL-TFRO-003-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup.close();
    console.error(error);
    alert(`Unable to generate the PMBL PDF: ${error.message}`);
  }
}
