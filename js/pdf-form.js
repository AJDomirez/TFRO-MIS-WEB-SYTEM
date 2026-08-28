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
  popup.document.write(`<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#eef2ef;font:16px Arial;color:#173f32}</style><p>Generating auto-filled PDF&hellip;</p>`);
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

function drawScaled(page, font, text, x, y, size = 12, options = {}) {
  if (!value(text)) return;
  const sx = page.getWidth() / (options.baseWidth || 612);
  const sy = page.getHeight() / (options.baseHeight || 936);
  const content = value(text);
  const maxWidth = options.maxWidth || 500;
  const minimumSize = options.minSize || 12;
  let fittedSize = Math.max(size, minimumSize);
  while (fittedSize > minimumSize && font.widthOfTextAtSize(content, fittedSize) > maxWidth) {
    fittedSize = Math.max(minimumSize, fittedSize - 0.25);
  }
  const textWidth = font.widthOfTextAtSize(content, fittedSize);
  const alignedX = options.align === "center"
    ? x + Math.max(0, (maxWidth - textWidth) / 2)
    : options.align === "right"
      ? x + Math.max(0, maxWidth - textWidth)
      : x;
  page.drawText(content, {
    x: alignedX * sx,
    y: y * sy,
    size: fittedSize * Math.min(sx, sy),
    font,
    maxWidth: maxWidth * sx,
    lineHeight: (options.lineHeight || fittedSize * 1.15) * sy,
    color: options.color,
  });
}

function money(amount) {
  return `PHP ${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function editFields(title, fields, editable) {
  if (!editable) return Promise.resolve(Object.fromEntries(fields.map((field) => [field.key, field.value])));
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", `${title} manual field editor`);
    dialog.style.cssText = "width:min(760px,calc(100vw - 32px));max-height:88vh;padding:0;border:0;border-radius:14px;box-shadow:0 24px 70px #0005;color:#17231e;font-family:Arial,sans-serif";
    const header = document.createElement("header");
    header.style.cssText = "padding:18px 22px;background:#153e31;color:#fff";
    const heading = document.createElement("h2");
    heading.textContent = `Review ${title}`;
    heading.style.cssText = "margin:0 0 5px;font-size:20px";
    const note = document.createElement("p");
    note.textContent = "Administrator only: values are auto-filled. Edit only what must change for this generated copy.";
    note.style.cssText = "margin:0;font-size:12px;opacity:.9";
    header.append(heading, note);
    const form = document.createElement("form");
    form.method = "dialog";
    form.style.cssText = "padding:20px 22px";
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px";
    for (const field of fields) {
      const label = document.createElement("label");
      label.style.cssText = "display:grid;gap:6px;font-size:12px;font-weight:700";
      label.append(document.createTextNode(field.label));
      const input = document.createElement("input");
      input.name = field.key;
      input.type = field.type || "text";
      if (input.type === "checkbox") input.checked = Boolean(field.value);
      else input.value = value(field.value);
      input.style.cssText = input.type === "checkbox"
        ? "width:20px;height:20px;accent-color:#17603f"
        : "width:100%;min-height:40px;padding:8px 10px;border:1px solid #aebbb5;border-radius:7px;font:14px Arial";
      label.append(input);
      grid.append(label);
    }
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:20px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = "padding:10px 16px;border:1px solid #aebbb5;border-radius:7px;background:#fff;font-weight:700";
    const generate = document.createElement("button");
    generate.type = "submit";
    generate.textContent = "Generate PDF";
    generate.style.cssText = "padding:10px 16px;border:0;border-radius:7px;background:#153e31;color:#fff;font-weight:700";
    actions.append(cancel, generate);
    form.append(grid, actions);
    dialog.append(header, form);
    document.body.append(dialog);
    const finish = (result) => { dialog.close(); dialog.remove(); resolve(result); };
    cancel.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const result = {};
      for (const field of fields) {
        const input = form.elements[field.key];
        result[field.key] = input.type === "checkbox" ? input.checked : input.value.trim();
      }
      finish(result);
    });
    dialog.showModal();
  });
}

async function createCroppedOfficialForm(PDFDocument, templateUrl, sourcePageIndex, bottom, height) {
  const templateBytes = await fetch(templateUrl).then((response) => {
    if (!response.ok) throw new Error(`Official form template could not be loaded (${response.status}).`);
    return response.arrayBuffer();
  });
  const source = await PDFDocument.load(templateBytes);
  const sourcePage = source.getPage(sourcePageIndex);
  const width = sourcePage.getWidth();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);
  const embedded = await pdfDoc.embedPage(sourcePage, { left: 0, bottom, right: width, top: bottom + height });
  page.drawPage(embedded, { x: 0, y: 0, width, height });
  return { pdfDoc, page };
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

export async function openTemporaryMtopPdfForm({ renewal, franchise = {}, changeMotor = {}, editable = false }) {
  let popup = editable ? null : openPdfWindow("TFRO-001 Temporary MTOP");
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-001 Temporary MTOP.pdf?v=20260826-200000", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const ink = rgb(0, 0, 0);
    const pages = pdfDoc.getPages();
    let details = {
      name: value(renewal.operator_name || franchise.operator_name),
      franchise: value(franchise.franchise_number),
      address: value(renewal.operator_address || franchise.address),
      orNumber: value(renewal.current_or_number || renewal.payment_or_number),
      make: value(changeMotor.new_motor_brand || franchise.motorcycle_brand),
      model: value(changeMotor.new_motor_serial || franchise.motorcycle_year_model),
      motor: value(changeMotor.new_engine_number || renewal.engine_number || franchise.engine_number || franchise.motorcycle_engine_number),
      chassis: value(changeMotor.new_chassis_number || renewal.chassis_number || franchise.chassis_number || franchise.motorcycle_chassis_number),
      plate: value(changeMotor.new_plate_number || renewal.plate_number || franchise.plate_number),
      route: value(franchise.route || "LUCENA CITY PROPER"),
      expiration: formatDate(renewal.temporary_mtop_expiration_date),
    };
    details = await editFields("TFRO-001 Temporary MTOP", [
      { key: "name", label: "Applicant / Operator", value: details.name },
      { key: "franchise", label: "Franchise number", value: details.franchise },
      { key: "address", label: "Address", value: details.address },
      { key: "orNumber", label: "Official receipt number", value: details.orNumber },
      { key: "make", label: "Vehicle make", value: details.make },
      { key: "model", label: "Vehicle model", value: details.model },
      { key: "motor", label: "Motor / engine number", value: details.motor },
      { key: "chassis", label: "Chassis number", value: details.chassis },
      { key: "plate", label: "Plate number", value: details.plate },
      { key: "route", label: "Authorized route", value: details.route },
      { key: "expiration", label: "Expiration date", value: details.expiration },
    ], editable);
    if (!details) { popup?.close(); return; }
    popup ||= openPdfWindow("TFRO-001 Temporary MTOP");
    if (!popup) return;
    const fit = (page, text, x, y, maxWidth, size = 12, useBold = false, align = "left") => {
      if (!text) return;
      const selectedFont = useBold ? bold : font;
      let fitted = Math.max(size, 12);
      const textWidth = selectedFont.widthOfTextAtSize(text, fitted);
      const drawX = align === "center" ? x + Math.max(0, (maxWidth - textWidth) / 2) : x;
      page.drawText(text, { x: drawX, y, maxWidth, size: fitted, font: selectedFont, color: ink });
    };
    const row = (page, y, columns) => columns.forEach(([text, x, width]) => fit(page, text, x, y, width, 12, true, "center"));

    if (pages[1]) {
      fit(pages[1], details.name, 112, 845, 240, 12, true);
      fit(pages[1], details.franchise, 498, 845, 70, 12, true);
      fit(pages[1], details.address, 112, 829, 265, 12, true);
      pages[1].drawRectangle({ x: 150, y: 760, width: 315, height: 18, color: rgb(1, 1, 1) });
      fit(pages[1], details.route, 18, 763, 576, 12, true, "center");
      row(pages[1], 699, [[details.make, 51, 68], [details.model, 128, 72], [details.motor, 209, 135], [details.chassis, 353, 127], [details.plate, 489, 81]]);
      if (details.expiration) {
        pages[1].drawRectangle({ x: 145, y: 329, width: 260, height: 27, color: rgb(1, 1, 1) });
        fit(pages[1], `GOOD UNTIL ${details.expiration}`, 145, 336, 260, 18, true, "center");
      }
    }

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-001-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the TFRO-001 PDF: ${error.message}`);
  }
}

export async function openRenewalPdfForm({ renewal, franchise = {}, changeMotor = {}, pictureUrl = "", editable = false }) {
  let popup = editable ? null : openPdfWindow("TFRO-005 Renewal Application");
  if (!editable && !popup) return;
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
    const fallbackAddress = splitResidentialAddress(renewal.operator_address);
    const address = {
      street: value(renewal.residential_street || fallbackAddress.street),
      barangay: value(renewal.residential_barangay || fallbackAddress.barangay),
    };
    const ink = rgb(0, 0, 0);
    const write = (text, x, y, size = 12, maxWidth = 500, useBold = true) =>
      drawScaled(page, useBold ? bold : font, text, x, y, Math.max(size, 11), { maxWidth, minSize: 11, color: ink });

    const fullRenewalFranchiseNumber = value(franchise.franchise_number);
    const birthDate = renewal.applicant_birth_date || franchise.birth_date;
    let manual = await editFields("TFRO-005 Application", [
      { key: "date", label: "Application date", value: formatDate(renewal.created_at) },
      { key: "franchise", label: "Franchise number", value: fullRenewalFranchiseNumber.replace(/^FR-/i, "") },
      { key: "last", label: "Last name", value: names.last },
      { key: "first", label: "First name", value: names.first },
      { key: "middle", label: "Middle name", value: names.middle },
      { key: "contact", label: "Contact number", value: renewal.operator_contact },
      { key: "street", label: "Home number and street", value: address.street },
      { key: "barangay", label: "Barangay", value: address.barangay },
      { key: "birthDate", label: "Birthdate", value: formatDate(birthDate) },
      { key: "birthPlace", label: "Place of birth", value: renewal.applicant_birth_place || franchise.birth_place },
      { key: "age", label: "Age", value: ageFromBirthDate(birthDate) },
      { key: "civilStatus", label: "Civil status", value: renewal.applicant_civil_status || franchise.civil_status },
      { key: "make", label: "Vehicle make", value: changeMotor.new_motor_brand || renewal.motorcycle_make || franchise.motorcycle_brand },
      { key: "plate", label: "Plate number", value: changeMotor.new_plate_number || renewal.plate_number || franchise.plate_number },
      { key: "model", label: "Vehicle model", value: changeMotor.new_motor_serial || renewal.motorcycle_model || franchise.motorcycle_year_model },
      { key: "orNumber", label: "O.R. number", value: renewal.current_or_number },
      { key: "engine", label: "Motor / engine number", value: changeMotor.new_engine_number || renewal.engine_number || franchise.motorcycle_engine_number },
      { key: "orDate", label: "O.R. date", value: formatDate(renewal.current_or_date) },
      { key: "chassis", label: "Chassis number", value: changeMotor.new_chassis_number || renewal.chassis_number || franchise.motorcycle_chassis_number },
      { key: "crNumber", label: "C.R. number", value: renewal.current_cr_number || franchise.chassis_cr_number },
      { key: "route", label: "Authorized route", value: franchise.route || "LUCENA PROPER" },
      { key: "remarks", label: "Inspection remarks", value: renewal.inspection_remarks },
    ], editable);
    if (!manual) { popup?.close(); return; }
    popup ||= openPdfWindow("TFRO-005 Renewal Application");
    if (!popup) return;
    write(manual.date, 508, 827, 11, 60, false);
    const renewalFranchiseNumber = manual.franchise;
    const renewalFranchiseSize = 11;
    const renewalFranchiseWidth = bold.widthOfTextAtSize(renewalFranchiseNumber, renewalFranchiseSize);
    page.drawText(renewalFranchiseNumber, { x: 568 - renewalFranchiseWidth, y: 806.5, size: renewalFranchiseSize, font: bold, color: ink });
    write(manual.last, 48, 778, 10, 165); write(manual.first, 225, 778, 10, 145); write(manual.middle, 335, 778, 10, 110);
    write(manual.contact, 458, 778, 10, 105); write(manual.street, 40, 718, 9.5, 275); write(manual.barangay, 326, 718, 9.5, 240);
    write(manual.birthDate, 40, 668, 9, 150); write(manual.birthPlace, 207, 668, 9, 150); write(manual.age, 377, 668, 9, 60); write(manual.civilStatus, 457, 668, 9, 110);
    write(manual.make, 90, 627, 9.5, 210); write(manual.plate, 385, 627, 9.5, 180); write(manual.model, 90, 606, 9.5, 210); write(manual.orNumber, 375, 606, 9.5, 190);
    write(manual.engine, 110, 585, 9.5, 190); write(manual.orDate, 395, 585, 9.5, 170); write(manual.chassis, 115, 563, 9.5, 185); write(manual.crNumber, 370, 563, 9.5, 195);
    const route = value(manual.route);
    page.drawRectangle({ x: 468, y: 517, width: 103, height: 40, color: rgb(1, 1, 1) });
    const routeSize = 12;
    const routeWidth = bold.widthOfTextAtSize(route, routeSize);
    page.drawText(route, { x: 468 + Math.max(2, (103 - routeWidth) / 2), y: 534, size: routeSize, font: bold, color: ink, maxWidth: 99 });
    write(manual.remarks, 278, 136, 8, 135);
    await embedPicture(pdfDoc, page, pictureUrl);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-005-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the TFRO-005 PDF: ${error.message}`);
  }
}

export async function openPmblPdfForm({ renewal, franchise = {}, editable = false }) {
  let popup = editable ? null : openPdfWindow("PMBL TFRO-003 Certification");
  if (!editable && !popup) return;
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
      const fittedSize = Math.max(size, 13);
      page.drawText(content, { x: x * sx, y: y * sy, size: fittedSize * Math.min(sx, sy), maxWidth: maxWidth * sx, font: selectedFont, color: black });
    };
    const issued = new Date();
    const pmblFranchiseNumber = value(franchise.franchise_number);
    const manual = await editFields("PMBL TFRO-003 Certification", [
      { key: "name", label: "Member name", value: renewal.operator_name },
      { key: "franchise", label: "Franchise number", value: pmblFranchiseNumber },
      { key: "address", label: "Residential address", value: renewal.operator_address },
      { key: "toda", label: "TODA", value: franchise.toda_name },
      { key: "driver", label: "Driver", value: false, type: "checkbox" },
      { key: "operator", label: "Operator", value: true, type: "checkbox" },
      { key: "both", label: "Both", value: false, type: "checkbox" },
      { key: "day", label: "Issued day", value: String(issued.getDate()) },
      { key: "month", label: "Issued month", value: issued.toLocaleDateString("en-PH", { month: "long" }) },
      { key: "year", label: "Issued year (last two digits)", value: String(issued.getFullYear()).slice(-2) },
    ], editable);
    if (!manual) { popup?.close(); return; }
    popup ||= openPdfWindow("PMBL TFRO-003 Certification");
    if (!popup) return;
    write(manual.name, 315, 364, 13, 320, true); write(manual.franchise, 76, 345, 13, 125, true);
    write(manual.address, 401, 345, 13, 295, true); write(manual.toda, 151, 324, 13, 220, true);
    const drawTick = (x) => {
      page.drawLine({ start: { x: x * sx, y: 328.2 * sy }, end: { x: (x + 2.9) * sx, y: 325.0 * sy }, thickness: 1.45 * Math.min(sx, sy), color: black });
      page.drawLine({ start: { x: (x + 2.9) * sx, y: 325.0 * sy }, end: { x: (x + 8.6) * sx, y: 332.0 * sy }, thickness: 1.45 * Math.min(sx, sy), color: black });
    };
    if (manual.driver) drawTick(508.5);
    if (manual.operator) drawTick(577.4);
    if (manual.both) drawTick(666.0);
    write(manual.day, 174, 171, 13, 30, true); write(manual.month, 257, 171, 13, 170, true); write(manual.year, 456, 171, 13, 30, true);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `PMBL-TFRO-003-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the PMBL PDF: ${error.message}`);
  }
}

export async function openChecklistPdfForm({ renewal, documents = [], editable = false }) {
  let popup = editable ? null : openPdfWindow("TFRO-004 Checklist for Renewal");
  if (!editable && !popup) return;
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
    const manual = await editFields("TFRO-004 Renewal Checklist", [
      { key: "date", label: "Checklist date", value: formatDate(renewal.created_at) },
      ...documentRows.map(([type]) => ({ key: type, label: type.replaceAll("_", " "), value: uploaded.has(type), type: "checkbox" })),
      ...physicalRows.flatMap(([key]) => [
        { key: `${key}_pass`, label: `${key.replaceAll("_", " ")} — PASS`, value: inspection[key] === true, type: "checkbox" },
        { key: `${key}_fail`, label: `${key.replaceAll("_", " ")} — FAIL`, value: inspection[key] === false, type: "checkbox" },
      ]),
    ], editable);
    if (!manual) { popup?.close(); return; }
    popup ||= openPdfWindow("TFRO-004 Checklist for Renewal");
    if (!popup) return;
    page.drawText(manual.date, { x: 315, y: 521, size: 12, font, color: ink });
    for (const [type, y, x] of documentRows) {
      if (manual[type]) drawMark(x, y);
    }
    for (const [key, y] of physicalRows) {
      if (manual[`${key}_pass`]) drawMark(109.5, y);
      if (manual[`${key}_fail`]) drawMark(128.5, y);
    }

    page.setMediaBox(0, 0, page.getWidth() / 2, page.getHeight());
    page.setCropBox(0, 0, page.getWidth(), page.getHeight());

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-004-${value(renewal.renewal_code || renewal.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the TFRO-004 PDF: ${error.message}`);
  }
}

function droppingDetails(request = {}, franchise = {}, operator = {}) {
  return {
    operator: value(operator.full_name || franchise.operator_name),
    address: value(operator.address || franchise.address),
    contact: value(operator.contact_number || franchise.contact_number),
    franchise: value(franchise.franchise_number),
    toda: value(franchise.toda_name),
    route: value(franchise.route || "LUCENA CITY PROPER"),
    make: value(request.old_motor_brand || franchise.motorcycle_brand),
    model: value(request.old_motor_model || franchise.motorcycle_year_model),
    motor: value(request.old_engine_number),
    chassis: value(request.old_chassis_number),
    plate: value(request.old_plate_number),
  };
}

export async function openDroppingPetitionPdfForm({ request, franchise = {}, operator = {}, editable = false }) {
  let popup = editable ? null : openPdfWindow("TFRO-002 Petition for Dropping");
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-002 Petition for Dropping.pdf?v=20260826-222000", import.meta.url);
    const pdfDoc = await PDFDocument.load(await fetch(templateUrl).then((response) => response.arrayBuffer()));
    const page = pdfDoc.getPage(0);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const ink = rgb(0, 0, 0);
    let data = droppingDetails(request, franchise, operator);
    data.requestCode = value(request.request_code || request.id);
    data = await editFields("TFRO-002 Petition for Dropping", [
      { key: "operator", label: "Operator name", value: data.operator }, { key: "requestCode", label: "Request code", value: data.requestCode },
      { key: "address", label: "Address", value: data.address }, { key: "contact", label: "Contact number", value: data.contact },
      { key: "franchise", label: "Franchise number", value: data.franchise }, { key: "toda", label: "TODA", value: data.toda },
      { key: "route", label: "Route", value: data.route }, { key: "make", label: "Vehicle make", value: data.make },
      { key: "model", label: "Vehicle model", value: data.model }, { key: "motor", label: "Motor / engine number", value: data.motor },
      { key: "chassis", label: "Chassis number", value: data.chassis }, { key: "plate", label: "Plate number", value: data.plate },
    ], editable);
    if (!data) { popup?.close(); return; }
    popup ||= openPdfWindow("TFRO-002 Petition for Dropping");
    if (!popup) return;
    const write = (text, x, y, maxWidth, size = 11, centered = false, useBold = false, wrapAtHyphens = false) => {
      if (!text) return;
      const selected = useBold ? bold : font;
      const fitted = Math.max(size, 11);
      const width = selected.widthOfTextAtSize(text, fitted);
      const textOptions = {
        x: centered ? x + Math.max(0, (maxWidth - width) / 2) : x,
        y, maxWidth, size: fitted, lineHeight: 11, font: selected, color: ink,
      };
      if (wrapAtHyphens) textOptions.wordBreaks = ["-", " "];
      page.drawText(text, textOptions);
    };
    write(data.operator, 72, 801, 180, 11, true, true);
    write(data.requestCode, 487, 801, 80, 11, true, false);
    write(data.toda, 493, 774, 66, 11, true, true);
    write(data.contact, 487, 748, 75, 11, true, true);
    write(data.address, 72, 647, 467, 11, true, true);
    write(data.make, 83, 604, 92, 11, true, true);
    write(data.model, 181, 604, 95, 11, true, true);
    write(data.motor, 348, 604, 92, 11, true, true, true);
    write(data.chassis, 454, 604, 100, 11, true, true, true);
    write(data.plate, 276, 601, 86, 11, true, true);
    write(data.route, 181, 572, 210, 11, true, true);
    write(data.franchise, 183, 557, 200, 11, true, true);
    write(data.operator, 112, 397, 143, 11, true, true);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-002-${value(request.request_code || request.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-002: ${error.message}`);
  }
}

export async function openDroppingCertificationPdfForm({ request, franchise = {}, operator = {}, editable = false }) {
  let popup = editable ? null : openPdfWindow("TFRO-007 Certification of Dropping");
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-007 Certification of Dropping.pdf?v=20260826-224000", import.meta.url);
    const pdfDoc = await PDFDocument.load(await fetch(templateUrl).then((response) => response.arrayBuffer()));
    const page = pdfDoc.getPage(0);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    const issued = request.admin_reviewed_at ? new Date(request.admin_reviewed_at) : new Date();
    const issuedDefault = issued.toLocaleDateString("en-PH", { month: "long", day: "2-digit", year: "numeric" }).toUpperCase();
    const data = await editFields("TFRO-007 Certification of Dropping", [
      ...Object.entries(droppingDetails(request, franchise, operator)).map(([key, fieldValue]) => ({ key, label: key.replaceAll("_", " "), value: fieldValue })),
      { key: "issued", label: "Issued date", value: issuedDefault },
    ], editable);
    if (!data) { popup?.close(); return; }
    popup ||= openPdfWindow("TFRO-007 Certification of Dropping");
    if (!popup) return;
    const write = (text, x, y, maxWidth, size = 11, useBold = false) => {
      if (!text) return;
      const selected = useBold ? bold : font;
      const fitted = Math.max(size, 11);
      page.drawText(text, { x, y, maxWidth, size: fitted, lineHeight: 13, font: selected, color: ink });
    };
    write(`This is to certify that the tricycle franchise Number. ${data.franchise}`, 80, 592, 445, 11);
    write("has been cancelled/dropped due to privatization of tricycle described hereunder;", 80, 576, 445, 11);
    write(data.operator, 241, 497, 246, 9, true);
    write([data.make, data.model].filter(Boolean).join(" "), 241, 481, 246, 9);
    write(data.motor, 241, 465, 246, 9);
    write(data.chassis, 241, 449, 246, 9);
    write(data.plate, 241, 433, 246, 9);
    const issuedText = `Issued this ${data.issued}.`;
    write(issuedText, 70, 320, 250, 9, true);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-007-${value(request.request_code || request.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-007: ${error.message}`);
  }
}

export async function openPaymentOrderPdfForm({ payment = {}, violation = {}, editable = false }) {
  let popup = editable ? null : openPdfWindow("TFRO-009 Order of Payment");
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-009 Order of Payment.pdf", import.meta.url);
    const { pdfDoc, page } = await createCroppedOfficialForm(PDFDocument, templateUrl, 1, 468, 468);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    const snapshot = payment.receipt_snapshot || {};
    const amount = snapshot.amount_paid ?? payment.amount ?? violation.penalty ?? 0;
    const write = (text, x, y, maxWidth, size = 9, align = "left", useBold = true) =>
      drawScaled(page, useBold ? bold : font, text, x, y, Math.max(size, 12), { maxWidth, minSize: 12, align, color: ink, baseHeight: 468 });

    const manual = await editFields("TFRO-009 Order of Payment", [
      { key: "payer", label: "Payor", value: snapshot.payer || payment.payer || payment.unit_owner_name },
      { key: "officers", label: "Apprehending officer/s", value: snapshot.apprehending_officers || violation.apprehending_officers },
      { key: "address", label: "Address", value: snapshot.address || payment.unit_owner_address },
      { key: "ticket", label: "Ticket number", value: snapshot.ticket_number || violation.ticket_number },
      { key: "code", label: "Violation code", value: snapshot.code || violation.violation_code },
      { key: "violation", label: "Violation", value: snapshot.violation || violation.violation_type },
      { key: "amount", label: "Amount due / paid", value: money(amount) },
      { key: "receipt", label: "Official receipt number", value: payment.receipt },
      { key: "assessedBy", label: "Assessed by", value: snapshot.assessed_by || payment.recorded_by_name || "TFRO Personnel" },
      { key: "datePaid", label: "Date paid", value: formatDate(payment.date || payment.paid_at) },
    ], editable);
    if (!manual) { popup?.close(); return; }
    popup ||= openPdfWindow("TFRO-009 Order of Payment");
    if (!popup) return;
    write(manual.payer, 108, 346, 190, 9.5); write(manual.officers, 420, 346, 112, 8.5, "center");
    write(manual.address, 116, 334, 184, 8.5); write(manual.ticket, 420, 334, 112, 8.5, "center");
    write(manual.code, 75, 286, 112, 9, "center"); write(manual.violation, 193, 286, 205, 9, "center");
    write(manual.amount, 405, 286, 126, 9, "center"); write(manual.amount, 405, 193, 126, 9.5, "center");
    write(manual.receipt, 74, 130, 92, 8.5); write(manual.amount, 74, 116, 92, 8.5);
    write(manual.assessedBy, 235, 109, 112, 8, "center"); write(manual.datePaid, 74, 102, 92, 8.5);

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-009-${value(payment.receipt || violation.ticket_number || payment.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-009: ${error.message}`);
  }
}

export async function openUnitReleasePdfForm({ payment = {}, violation = {}, editable = false }) {
  let popup = editable ? null : openPdfWindow("TFRO-010 Vehicle/Unit Releasing Slip");
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-010 Unit Releasing Slip.pdf", import.meta.url);
    const { pdfDoc, page } = await createCroppedOfficialForm(PDFDocument, templateUrl, 0, 468, 468);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    const write = (text, x, y, maxWidth, size = 8.5, align = "left", useBold = true) =>
      drawScaled(page, useBold ? bold : font, text, x, y, Math.max(size, 12), { maxWidth, minSize: 12, align, color: ink, baseHeight: 468 });

    const manual = await editFields("TFRO-010 Vehicle/Unit Releasing Slip", [
      { key: "owner", label: "Unit owner", value: payment.unit_owner_name || payment.payer },
      { key: "releaseDate", label: "Release date", value: formatDate(payment.release_date || payment.date || payment.paid_at) },
      { key: "ownerAddress", label: "Owner address", value: payment.unit_owner_address }, { key: "ownerContact", label: "Owner contact", value: payment.unit_owner_contact },
      { key: "driver", label: "Driver name", value: payment.driver_name || payment.payer }, { key: "driverAddress", label: "Driver address", value: payment.driver_address },
      { key: "driverContact", label: "Driver contact", value: payment.driver_contact }, { key: "engine", label: "Engine number", value: payment.engine_number },
      { key: "chassis", label: "Chassis number", value: payment.chassis_number }, { key: "receipt", label: "Official receipt number", value: payment.receipt },
      { key: "amount", label: "Amount paid", value: money(payment.amount) }, { key: "datePaid", label: "Date paid", value: formatDate(payment.date || payment.paid_at) },
      { key: "recordedBy", label: "Recorded by", value: payment.receipt_snapshot?.assessed_by || payment.recorded_by_name || "TFRO Staff" },
      { key: "releasedBy", label: "Released by", value: payment.released_by || violation.apprehending_officers }, { key: "witness", label: "Witness", value: payment.release_witness },
      { key: "releaseTime", label: "Release time", value: payment.release_time },
    ], editable);
    if (!manual) { popup?.close(); return; }
    popup ||= openPdfWindow("TFRO-010 Vehicle/Unit Releasing Slip");
    if (!popup) return;
    write(manual.owner, 187, 342, 215, 9); write(manual.releaseDate, 444, 342, 88, 8.5, "center");
    write(manual.ownerAddress, 116, 328, 214, 8.25); write(manual.ownerContact, 427, 328, 105, 8.25, "center");
    write(manual.driver, 166, 314, 225, 8.75); write(manual.driverAddress, 159, 300, 210, 8.25); write(manual.driverContact, 438, 286, 94, 8.25, "center");
    write(manual.engine, 139, 245, 150, 8.75); write(manual.chassis, 139, 231, 150, 8.75); write(manual.receipt, 116, 204, 175, 8.75);
    write(manual.amount, 136, 190, 155, 8.75); write(manual.datePaid, 127, 176, 164, 8.75); write(manual.recordedBy, 72, 121, 140, 8.25, "center");
    write(manual.releasedBy, 344, 178, 138, 8.25, "center"); write(manual.witness, 389, 156, 93, 8.25, "center");
    write(manual.releaseTime, 379, 134, 52, 8.25, "center"); write(manual.releaseDate, 450, 134, 72, 8.25, "center");

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-010-${value(payment.receipt || payment.id)}.pdf`);
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-010: ${error.message}`);
  }
}
