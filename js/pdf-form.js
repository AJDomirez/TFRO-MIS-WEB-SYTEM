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
    page.drawImage(image, { x: 468 * sx, y: 301 * sy, width: 104 * sx, height: 103 * sy });
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

    write(formatDate(renewal.created_at), 444, 828, 6, 120);
    write(value(renewal.renewal_type).replaceAll("_", " ").toUpperCase() || "RENEWAL", 410, 808, 6, 62);
    write(franchise.franchise_number, 472, 808, 6, 95);
    write(names.last, 48, 778, 7, 165);
    write(names.first, 225, 778, 7, 145);
    write(names.middle, 335, 778, 7, 110);
    write(renewal.operator_contact, 458, 778, 7, 105);
    write(renewal.operator_address, 40, 723, 7, 525);
    write(formatDate(franchise.birth_date), 40, 676, 7, 150);
    write(franchise.birth_place, 207, 676, 7, 150);
    write(ageFromBirthDate(franchise.birth_date), 377, 676, 7, 60);
    write(franchise.civil_status, 457, 676, 7, 110);
    write(franchise.motorcycle_brand, 40, 629, 7, 260);
    write(renewal.plate_number || franchise.plate_number, 326, 629, 7, 240);
    write(franchise.motorcycle_year_model, 40, 608, 7, 260);
    write(renewal.current_or_number, 326, 608, 7, 240);
    write(renewal.engine_number || franchise.motorcycle_engine_number, 40, 587, 7, 260);
    write(formatDate(renewal.current_or_date), 326, 587, 7, 240);
    write(renewal.chassis_number || franchise.motorcycle_chassis_number, 40, 565, 7, 260);
    write(renewal.current_cr_number || franchise.chassis_cr_number, 326, 565, 7, 240);
    write(franchise.route || "LUCENA PROPER", 480, 522, 7, 85, true);
    write(renewal.inspection_remarks, 278, 136, 7, 135);
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

    write(renewal.operator_name, 315, 364, 10, 320, true);
    write(franchise.franchise_number, 76, 345, 9, 125, true);
    write(renewal.operator_address, 401, 345, 9, 295);
    write(franchise.toda_name, 151, 324, 9, 220);
    write("X", 577, 324, 10, 15, true);
    write(String(issued.getDate()), 174, 171, 9, 30);
    write(issued.toLocaleDateString("en-PH", { month: "long" }), 257, 171, 9, 170);
    write(String(issued.getFullYear()).slice(-2), 456, 171, 9, 30);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `PMBL-TFRO-003-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup.close();
    console.error(error);
    alert(`Unable to generate the PMBL PDF: ${error.message}`);
  }
}
