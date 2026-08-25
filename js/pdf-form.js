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

function splitResidentialAddress(fullAddress) {
  const address = value(fullAddress);
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const barangayIndex = parts.findIndex((part) => /\b(?:brgy\.?|barangay)\b/i.test(part));
  if (barangayIndex >= 0) {
    return {
      street: parts.slice(0, barangayIndex).join(", "),
      barangay: parts.slice(barangayIndex).join(", "),
    };
  }
  const streetPattern = /\b(?:purok|sitio|street|st\.?|road|rd\.?|avenue|ave\.?|block|blk\.?|lot|phase|subdivision|village)\b/i;
  const street = parts.filter((part) => streetPattern.test(part));
  const barangay = parts.filter((part) => !streetPattern.test(part));
  return street.length
    ? { street: street.join(", "), barangay: barangay.join(", ") }
    : { street: address, barangay: "" };
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

export async function openTemporaryMtopPdfForm({ renewal, franchise = {} }) {
  const popup = openPdfWindow("TFRO-001 Temporary MTOP");
  if (!popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-001 Temporary MTOP.pdf", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const ink = rgb(0, 0, 0);
    const pages = pdfDoc.getPages();
    const details = {
      name: value(renewal.operator_name || franchise.operator_name),
      franchise: value(franchise.franchise_number),
      address: value(renewal.operator_address || franchise.address),
      orNumber: value(renewal.current_or_number || renewal.payment_or_number),
      make: value(franchise.motorcycle_brand),
      model: value(franchise.motorcycle_year_model),
      motor: value(renewal.engine_number || franchise.engine_number || franchise.motorcycle_engine_number),
      chassis: value(renewal.chassis_number || franchise.chassis_number || franchise.motorcycle_chassis_number),
      plate: value(renewal.plate_number || franchise.plate_number),
    };
    const fit = (page, text, x, y, maxWidth, size = 10, useBold = false) => {
      if (!text) return;
      const selectedFont = useBold ? bold : font;
      let fitted = size;
      while (fitted > 7 && selectedFont.widthOfTextAtSize(text, fitted) > maxWidth) fitted -= 0.5;
      page.drawText(text, { x, y, maxWidth, size: fitted, font: selectedFont, color: ink });
    };
    const row = (page, y, columns) => columns.forEach(([text, x, width]) => fit(page, text, x, y, width, 9, true));

    if (pages[0]) {
      fit(pages[0], details.name, 52, 657, 250, 10, true);
      fit(pages[0], details.franchise, 342, 657, 135, 10, true);
      fit(pages[0], details.address, 52, 637, 425, 10, true);
      fit(pages[0], details.orNumber, 490, 657, 75, 10, true);
      row(pages[0], 520, [[details.make, 7, 64], [details.model, 81, 69], [details.motor, 163, 132], [details.chassis, 307, 122], [details.plate, 443, 78]]);
    }
    if (pages[1]) {
      fit(pages[1], details.name, 82, 657, 220, 9.5, true);
      fit(pages[1], details.franchise, 339, 657, 120, 9.5, true);
      fit(pages[1], details.orNumber, 470, 657, 66, 9.5, true);
      fit(pages[1], details.address, 82, 639, 410, 9.5, true);
      row(pages[1], 535, [[details.make, 42, 57], [details.model, 109, 58], [details.motor, 179, 111], [details.chassis, 306, 106], [details.plate, 425, 65]]);
    }

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-001-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup.close();
    console.error(error);
    alert(`Unable to generate the TFRO-001 PDF: ${error.message}`);
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
    const address = splitResidentialAddress(renewal.operator_address);
    const ink = rgb(0, 0, 0);
    const write = (text, x, y, size = 8.5, maxWidth = 500, useBold = true) =>
      drawScaled(page, useBold ? bold : font, text, x, y, size, { maxWidth, color: ink });

    write(formatDate(renewal.created_at), 515, 827, 8.5, 55);
    const fullRenewalFranchiseNumber = value(franchise.franchise_number);
    const renewalFranchiseNumber = fullRenewalFranchiseNumber.match(/(\d+)$/)?.[1] || fullRenewalFranchiseNumber;
    const renewalFranchiseSize = 10;
    const renewalFranchiseWidth = bold.widthOfTextAtSize(renewalFranchiseNumber, renewalFranchiseSize);
    page.drawText(renewalFranchiseNumber, { x: 568 - renewalFranchiseWidth, y: 806.5, size: renewalFranchiseSize, font: bold, color: ink });
    write(names.last, 48, 778, 10, 165);
    write(names.first, 225, 778, 10, 145);
    write(names.middle, 335, 778, 10, 110);
    write(renewal.operator_contact, 458, 778, 10, 105);
    write(address.street, 40, 718, 9.5, 275);
    write(address.barangay, 326, 718, 9.5, 240);
    write(formatDate(franchise.birth_date), 40, 668, 9, 150);
    write(franchise.birth_place, 207, 668, 9, 150);
    write(ageFromBirthDate(franchise.birth_date), 377, 668, 9, 60);
    write(franchise.civil_status, 457, 668, 9, 110);
    write(franchise.motorcycle_brand, 90, 627, 9.5, 210);
    write(renewal.plate_number || franchise.plate_number, 385, 627, 9.5, 180);
    write(franchise.motorcycle_year_model, 90, 606, 9.5, 210);
    write(renewal.current_or_number, 375, 606, 9.5, 190);
    write(renewal.engine_number || franchise.motorcycle_engine_number, 110, 585, 9.5, 190);
    write(formatDate(renewal.current_or_date), 395, 585, 9.5, 170);
    write(renewal.chassis_number || franchise.motorcycle_chassis_number, 115, 563, 9.5, 185);
    write(renewal.current_cr_number || franchise.chassis_cr_number, 370, 563, 9.5, 195);
    const route = value(franchise.route || "LUCENA PROPER");
    page.drawRectangle({ x: 468, y: 517, width: 103, height: 40, color: rgb(1, 1, 1) });
    const routeSize = route.length > 20 ? 7.5 : 9;
    const routeWidth = bold.widthOfTextAtSize(route, routeSize);
    page.drawText(route, { x: 468 + Math.max(2, (103 - routeWidth) / 2), y: 534, size: routeSize, font: bold, color: ink, maxWidth: 99 });
    write(renewal.inspection_remarks, 278, 136, 8, 135);
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
      const selectedFont = useBold ? bold : font;
      const content = value(text);
      let fittedSize = size;
      while (fittedSize > 9 && selectedFont.widthOfTextAtSize(content, fittedSize) > maxWidth) fittedSize -= 0.5;
      page.drawText(content, { x: x * sx, y: y * sy, size: fittedSize * Math.min(sx, sy), maxWidth: maxWidth * sx, font: selectedFont, color: black });
    };
    const issued = new Date();
    const pmblFranchiseNumber = value(franchise.franchise_number);

    write(renewal.operator_name, 315, 364, 13, 320, true);
    write(pmblFranchiseNumber, 76, 345, 13, 125, true);
    write(renewal.operator_address, 401, 345, 12, 295, true);
    write(franchise.toda_name, 151, 324, 12, 220, true);
    write("X", 577, 324, 13, 15, true);
    write(String(issued.getDate()), 174, 171, 12, 30, true);
    write(issued.toLocaleDateString("en-PH", { month: "long" }), 257, 171, 12, 170, true);
    write(String(issued.getFullYear()).slice(-2), 456, 171, 12, 30, true);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `PMBL-TFRO-003-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup.close();
    console.error(error);
    alert(`Unable to generate the PMBL PDF: ${error.message}`);
  }
}

export async function openChecklistPdfForm({ renewal, documents = [] }) {
  const popup = openPdfWindow("TFRO-004 Checklist for Renewal");
  if (!popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-004 Checklist for Renewal.pdf", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    const uploaded = new Set(documents.map((item) => item.doc_type));
    const inspection = renewal.inspection_results || {};
    const drawMark = (x, y) => {
      page.drawLine({ start: { x: x + 0.8, y: y + 2.8 }, end: { x: x + 2.3, y: y + 1.3 }, thickness: 1, color: ink });
      page.drawLine({ start: { x: x + 2.3, y: y + 1.3 }, end: { x: x + 5.3, y: y + 5 }, thickness: 1, color: ink });
    };

    const date = formatDate(renewal.created_at);
    page.drawText(date, { x: 315, y: 521, size: 8, font, color: ink });

    const documentRows = [
      ["payment_receipt", 456, 121.5],
      ["official_receipt", 447, 121.5],
      ["voters_certificate", 421, 121.5],
      ["insurance", 405, 121.5],
      ["cedula", 370, 124.5],
      ["barangay_clearance", 361, 124.5],
      ["drivers_license", 352, 124.5],
      ["picture_2x2", 343, 124.5],
      ["pmbl_certification", 334, 124.5],
    ];
    for (const [type, y, x] of documentRows) {
      if (!uploaded.has(type)) continue;
      drawMark(x, y);
    }

    const physicalRows = [
      ["functional_horn", 226],
      ["signal_lights", 213],
      ["head_tail_lights", 199],
      ["sidecar_interior_light", 180],
      ["sidecar_light_kept_on", 160],
      ["anti_noise_muffler", 147],
      ["body_number_sticker", 134],
      ["garbage_receptacle", 119],
      ["clean_windshield", 109],
    ];
    for (const [key, y] of physicalRows) {
      if (inspection[key] !== true && inspection[key] !== false) continue;
      const leftX = inspection[key] ? 109.5 : 128.5;
      drawMark(leftX, y);
    }

    page.setMediaBox(0, 0, page.getWidth() / 2, page.getHeight());
    page.setCropBox(0, 0, page.getWidth(), page.getHeight());

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-004-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup.close();
    console.error(error);
    alert(`Unable to generate the TFRO-004 PDF: ${error.message}`);
  }
}
