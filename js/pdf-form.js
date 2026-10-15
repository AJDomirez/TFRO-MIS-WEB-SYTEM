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
  popup.document.write(`<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#eef2ef;font:16px Arial;color:#0d4778}</style><p>Generating auto-filled PDF&hellip;</p>`);
  return popup;
}

function escapeHtml(input) {
  return value(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setPdfDocumentName(pdfDoc, title) {
  pdfDoc.setTitle(title);
  pdfDoc.setSubject(title);
  pdfDoc.setCreator("TFRO Integrated Management Information System");
  pdfDoc.setProducer("Lucena City TFRO");
}

function value(value) {
  return String(value ?? "").trim();
}

function firstValue(...candidates) {
  for (const candidate of candidates) {
    const resolved = value(candidate);
    if (resolved && !["null", "undefined", "—", "-"].includes(resolved.toLowerCase())) return resolved;
  }
  return "";
}

function normalizeVehicleMakeModel(make, model) {
  const normalizedMake = value(make);
  const normalizedModel = value(model);
  const isYear = (candidate) => {
    if (!/^\d{4}$/.test(candidate)) return false;
    const year = Number(candidate);
    return year >= 1900 && year <= 2100;
  };
  return isYear(normalizedMake) && normalizedModel && !isYear(normalizedModel)
    ? { make: normalizedModel, model: normalizedMake }
    : { make: normalizedMake, model: normalizedModel };
}

function dateInputValue(input) {
  const raw = value(input);
  if (!raw || /^\d{4}$/.test(raw)) return "";
  const candidate = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function renewalDocumentDetails(renewal = {}, franchise = {}, changeMotor = {}) {
  const residentialAddress = [renewal.residential_street, renewal.residential_barangay]
    .map(value).filter(Boolean).join(", ");
  const vehicle = normalizeVehicleMakeModel(
    firstValue(changeMotor.new_motor_brand, renewal.motorcycle_make, renewal.motorcycle_brand, franchise.motorcycle_brand),
    firstValue(changeMotor.new_motor_serial, renewal.motorcycle_model, renewal.motorcycle_year_model, franchise.motorcycle_year_model),
  );
  return {
    operatorName: firstValue(renewal.operator_name, renewal.full_name, franchise.operator_name),
    operatorAddress: firstValue(renewal.operator_address, residentialAddress, franchise.address),
    contact: firstValue(renewal.operator_contact, renewal.contact_number, franchise.contact_number),
    franchiseNumber: firstValue(renewal.franchise_number, franchise.franchise_number),
    street: firstValue(renewal.residential_street),
    barangay: firstValue(renewal.residential_barangay),
    birthDate: firstValue(renewal.applicant_birth_date, renewal.birth_date, franchise.birth_date),
    birthPlace: firstValue(renewal.applicant_birth_place, renewal.birth_place, franchise.birth_place),
    civilStatus: firstValue(renewal.applicant_civil_status, renewal.civil_status, franchise.civil_status),
    driverName: firstValue(renewal.driver_name, franchise.driver_name),
    driverLicense: firstValue(renewal.driver_license_number, renewal.license_number),
    make: vehicle.make,
    model: vehicle.model,
    engine: firstValue(changeMotor.new_engine_number, renewal.engine_number, renewal.motor_number, franchise.engine_number),
    chassis: firstValue(changeMotor.new_chassis_number, renewal.chassis_number, franchise.chassis_number),
    plate: firstValue(changeMotor.new_plate_number, renewal.plate_number, franchise.plate_number),
    orNumber: firstValue(renewal.current_or_number, renewal.payment_or_number, renewal.official_receipt_number, franchise.official_receipt_number),
    orDate: firstValue(renewal.current_or_date, renewal.payment_date),
    crNumber: firstValue(renewal.current_cr_number, renewal.cr_number, franchise.chassis_cr_number, franchise.engine_cr_number),
    route: firstValue(renewal.route, renewal.assigned_route, franchise.route, "LUCENA PROPER"),
    toda: firstValue(renewal.toda_name, franchise.toda_name),
  };
}

function formatDate(input) {
  if (!input) return "";
  const date = new Date(`${String(input).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value(input)
    : date.toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function formatPermitDate(input) {
  if (!input) return "";
  const date = new Date(`${String(input).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value(input).toUpperCase()
    : date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
}

function splitName(fullName) {
  const normalized = value(fullName).replace(/\s+/g, " ");
  if (normalized.includes(",")) {
    const [lastName, ...remaining] = normalized.split(",");
    const givenNames = remaining.join(" ").trim().split(/\s+/).filter(Boolean);
    return {
      first: givenNames.shift() || "",
      last: lastName.trim(),
      middle: givenNames.join(" "),
    };
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
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

function fitTextSize(font, text, preferredSize, maxWidth, minimumSize = 5.5) {
  const content = value(text);
  let fittedSize = Math.max(Number(preferredSize) || 12, minimumSize);
  while (fittedSize > minimumSize && font.widthOfTextAtSize(content, fittedSize) > maxWidth) {
    fittedSize = Math.max(minimumSize, fittedSize - 0.25);
  }
  return fittedSize;
}

function alignedTextX(font, text, size, x, maxWidth, align = "left") {
  const textWidth = font.widthOfTextAtSize(value(text), size);
  if (align === "center") return x + Math.max(0, (maxWidth - textWidth) / 2);
  if (align === "right") return x + Math.max(0, maxWidth - textWidth);
  return x;
}

function drawScaled(page, font, text, x, y, size = 12, options = {}) {
  if (!value(text)) return;
  const sx = page.getWidth() / (options.baseWidth || 612);
  const sy = page.getHeight() / (options.baseHeight || 936);
  const content = value(text);
  const maxWidth = options.maxWidth || 500;
  const minimumSize = options.minSize ?? 5.5;
  const fittedSize = fitTextSize(font, content, size, maxWidth, minimumSize);
  const alignedX = alignedTextX(font, content, fittedSize, x, maxWidth, options.align);
  page.drawText(content, {
    x: alignedX * sx,
    y: y * sy,
    size: fittedSize * Math.min(sx, sy),
    font,
    color: options.color,
  });
}

function drawTextInBox(page, font, text, options = {}) {
  const content = value(text);
  if (!content) return;
  const {
    x, y, width, height = 16, size = 10, minSize = 4.75,
    align = "center", verticalAlign = "middle", paddingX = 2,
    paddingY = 1, baseWidth = page.getWidth(), baseHeight = page.getHeight(),
    color,
  } = options;
  const sx = page.getWidth() / baseWidth;
  const sy = page.getHeight() / baseHeight;
  const availableWidth = Math.max(1, width - (paddingX * 2));
  const fittedSize = fitTextSize(font, content, size, availableWidth, minSize);
  const fieldX = x + paddingX;
  const textX = alignedTextX(font, content, fittedSize, fieldX, availableWidth, align);
  const textHeight = font.heightAtSize(fittedSize, { descender: false });
  let textY = y + paddingY;
  if (verticalAlign === "middle") textY = y + Math.max(paddingY, (height - textHeight) / 2);
  if (verticalAlign === "top") textY = y + height - textHeight - paddingY;
  page.drawText(content, {
    x: textX * sx,
    y: textY * sy,
    size: fittedSize * Math.min(sx, sy),
    font,
    color,
  });
}

function coverBoxInterior(page, color, options = {}) {
  const {
    x, y, width, height, inset = 1.2,
    baseWidth = page.getWidth(), baseHeight = page.getHeight(),
  } = options;
  const sx = page.getWidth() / baseWidth;
  const sy = page.getHeight() / baseHeight;
  page.drawRectangle({
    x: (x + inset) * sx,
    y: (y + inset) * sy,
    width: Math.max(0, width - (inset * 2)) * sx,
    height: Math.max(0, height - (inset * 2)) * sy,
    color,
  });
}

function money(amount) {
  return `PHP ${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function editFields(title, fields, editable, onSend = null) {
  if (!editable) return Promise.resolve(Object.fromEntries(fields.map((field) => [field.key, field.value])));
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", `${title} manual field editor`);
    dialog.style.cssText = "width:min(760px,calc(100vw - 32px));max-height:88vh;padding:0;border:0;border-radius:14px;box-shadow:0 24px 70px #0005;color:#17231e;font-family:Arial,sans-serif";
    const header = document.createElement("header");
    header.style.cssText = "padding:18px 22px;background:#0d4778;color:#fff";
    const heading = document.createElement("h2");
    heading.textContent = `Review ${title}`;
    heading.style.cssText = "margin:0 0 5px;font-size:20px";
    heading.style.setProperty("color", "#fff", "important");
    const note = document.createElement("p");
    note.textContent = "Administrator only: values are auto-filled. Edit only what must change for this generated copy.";
    note.style.cssText = "margin:0;font-size:12px;opacity:.9";
    note.style.setProperty("color", "#fff", "important");
    header.append(heading, note);
    const form = document.createElement("form");
    form.method = "dialog";
    form.style.cssText = "padding:20px 22px";
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px";
    for (const field of fields) {
      const label = document.createElement("label");
      label.style.cssText = "display:grid;gap:6px;font-size:12px;font-weight:700";
      label.append(document.createTextNode(`${field.label}${field.required ? " *" : ""}`));
      const input = document.createElement("input");
      input.name = field.key;
      input.type = field.type || "text";
      input.required = Boolean(field.required);
      if (input.type === "checkbox") input.checked = Boolean(field.value);
      else input.value = value(field.value);
      if (field.exclusiveGroup) {
        input.dataset.exclusiveGroup = field.exclusiveGroup;
        input.addEventListener("change", () => {
          if (!input.checked) return;
          grid.querySelectorAll("input[data-exclusive-group]").forEach((candidate) => {
            if (candidate !== input && candidate.dataset.exclusiveGroup === field.exclusiveGroup) candidate.checked = false;
          });
        });
      }
      input.style.cssText = input.type === "checkbox"
        ? "width:20px;height:20px;accent-color:#123f73"
        : "width:100%;min-height:40px;padding:8px 10px;border:1px solid #aebbb5;border-radius:7px;font:14px Arial";
      label.append(input);
      grid.append(label);
    }
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:20px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = "padding:10px 16px;border:1px solid #aebbb5;border-radius:7px;background:#fff;font-weight:700";
    const generate = document.createElement("button");
    generate.type = "submit";
    generate.textContent = "Generate PDF";
    generate.style.cssText = "padding:10px 16px;border:0;border-radius:7px;background:#0d4778;color:#fff;font-weight:700";
    const send = document.createElement("button");
    if (onSend) {
      send.type = "button";
      send.textContent = "Send to Operator";
      send.style.cssText = "padding:10px 16px;border:0;border-radius:7px;background:#d8a900;color:#17231e;font-weight:700";
    }
    actions.append(cancel);
    if (onSend) actions.append(send);
    actions.append(generate);
    form.append(grid, actions);
    dialog.append(header, form);
    document.body.append(dialog);
    const finish = (result) => { dialog.close(); dialog.remove(); resolve(result); };
    cancel.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    const fieldValues = () => {
      const result = {};
      for (const field of fields) {
        const input = form.elements[field.key];
        result[field.key] = input.type === "checkbox" ? input.checked : input.value.trim();
      }
      return result;
    };
    if (onSend) send.addEventListener("click", async () => {
      if (!form.reportValidity()) return;
      send.disabled = true;
      generate.disabled = true;
      const originalText = send.textContent;
      send.textContent = "Sending...";
      try {
        const sent = await onSend(fieldValues());
        if (sent === false) {
          send.disabled = false;
          generate.disabled = false;
          send.textContent = originalText;
          return;
        }
        finish(fieldValues());
      } catch (error) {
        alert(`Could not send the form: ${error.message}`);
        send.disabled = false;
        generate.disabled = false;
        send.textContent = originalText;
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(fieldValues());
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

async function showPdf(popup, bytes, filename, { viewOnly = false, title = "" } = {}) {
  const documentName = value(title) || value(filename).replace(/\.pdf$/i, "");
  const pdfFile = typeof File === "function"
    ? new File([bytes], filename, { type: "application/pdf" })
    : new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(pdfFile);
  const safeTitle = escapeHtml(documentName);
  const safeFilename = escapeHtml(filename);
  popup.document.open();
  if (viewOnly) {
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>*{box-sizing:border-box}body{margin:0;overflow:hidden;background:#1f2933;font:14px Arial,sans-serif}.record-banner{height:48px;display:flex;align-items:center;justify-content:center;gap:9px;background:#123f73;color:#fff;border-bottom:4px solid #f4c430;font-weight:800;letter-spacing:.04em}.record-banner small{font-weight:500;opacity:.85}iframe{display:block;width:100%;height:calc(100vh - 48px);border:0}</style></head><body><div class="record-banner">${safeTitle} <small>View only — official office copy</small></div><iframe src="${url}#toolbar=0&navpanes=0&scrollbar=1" title="View-only ${safeFilename}"></iframe><script>document.addEventListener("contextmenu",e=>e.preventDefault());document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&["s","p"].includes(e.key.toLowerCase()))e.preventDefault()});<\/script></body></html>`);
  } else {
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#343a40}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe src="${url}#view=FitH" title="${safeFilename}"></iframe></body></html>`);
  }
  popup.document.close();
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}

function drawRecordedWatermark(page, font, color, degrees) {
  const text = "RECORDED — VIEW ONLY";
  const size = Math.min(42, page.getWidth() / 12);
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: Math.max(35, (page.getWidth() - width * .72) / 2),
    y: page.getHeight() * .43,
    size,
    font,
    color,
    opacity: .14,
    rotate: degrees(32),
  });
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
    // Keep the photograph inside the printed 2x2 frame so its original border remains visible.
    page.drawImage(image, { x: 469.5 * sx, y: 302.5 * sy, width: 101 * sx, height: 100 * sy });
  } catch (error) {
    console.warn("The 2x2 picture could not be embedded in the PDF.", error);
  }
}

export async function openTemporaryMtopPdfForm({ renewal, franchise = {}, changeMotor = {}, editable = false, onSend = null }) {
  const documentTitle = "TFRO-001 Temporary MTOP";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const pdfDoc = await PDFDocument.create();
    setPdfDocumentName(pdfDoc, documentTitle);
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    const answers = renewalDocumentDetails(renewal, franchise, changeMotor);
    let details = {
      name: answers.operatorName,
      franchise: answers.franchiseNumber,
      address: answers.operatorAddress,
      make: answers.make,
      model: answers.model,
      motor: answers.engine,
      chassis: answers.chassis,
      plate: answers.plate,
      expiration: formatPermitDate(renewal.temporary_mtop_expiration_date),
    };
    details = await editFields(documentTitle, [
      { key: "name", label: "Applicant / Operator", value: details.name },
      { key: "franchise", label: "Franchise number", value: details.franchise },
      { key: "address", label: "Address", value: details.address },
      { key: "make", label: "Vehicle make", value: details.make },
      { key: "model", label: "Vehicle model", value: details.model },
      { key: "motor", label: "Motor / engine number", value: details.motor },
      { key: "chassis", label: "Chassis number", value: details.chassis },
      { key: "plate", label: "Plate number", value: details.plate },
      { key: "expiration", label: "Expiration date", value: details.expiration },
    ], editable, onSend);
    if (!details) { popup?.close(); return; }
    const reviewedVehicle = normalizeVehicleMakeModel(details.make, details.model);
    details = { ...details, make: reviewedVehicle.make, model: reviewedVehicle.model };
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    const permitFrontUrl = new URL("../forms/public/assets/tfro-001-permit-front.jpg?v=20261014-1", import.meta.url);
    const conditionsBackUrl = new URL("../forms/public/assets/tfro-001-conditions-back.jpg?v=20261014-1", import.meta.url);
    const [permitFrontBytes, conditionsBackBytes] = await Promise.all([
      fetch(permitFrontUrl).then((response) => {
        if (!response.ok) throw new Error(`TFRO-001 permit artwork could not be loaded (${response.status}).`);
        return response.arrayBuffer();
      }),
      fetch(conditionsBackUrl).then((response) => {
        if (!response.ok) throw new Error(`TFRO-001 conditions artwork could not be loaded (${response.status}).`);
        return response.arrayBuffer();
      }),
    ]);
    const [permitFront, conditionsBack] = await Promise.all([
      pdfDoc.embedJpg(permitFrontBytes),
      pdfDoc.embedJpg(conditionsBackBytes),
    ]);
    page.drawImage(permitFront, { x: 0, y: 0, width: pageWidth, height: pageHeight });

    // Coordinates are mapped from the supplied 1335 x 1888 permit artwork.
    const artworkWidth = 1335;
    const artworkHeight = 1888;
    const drawArtworkValue = (text, x, baselineFromTop, width, size = 10, align = "left", color = ink) => {
      if (!value(text)) return;
      const scaleX = pageWidth / artworkWidth;
      const scaleY = pageHeight / artworkHeight;
      const targetX = x * scaleX;
      const targetY = pageHeight - baselineFromTop * scaleY;
      const targetWidth = width * scaleX;
      const fitted = fitTextSize(bold, value(text), size, targetWidth, 6.25);
      const alignedX = alignedTextX(bold, value(text), fitted, targetX, targetWidth, align);
      page.drawText(value(text), { x: alignedX, y: targetY, maxWidth: targetWidth, size: fitted, font: bold, color });
    };

    drawArtworkValue(details.name, 154, 414, 450, 10.5);
    drawArtworkValue(details.address, 204, 462, 535, 9.5);
    drawArtworkValue(details.franchise, 936, 482, 349, 12, "center", rgb(.02, .16, .35));
    drawArtworkValue(details.make, 61, 811, 181, 10.5, "center", rgb(.02, .16, .35));
    drawArtworkValue(details.model, 252, 811, 174, 10.5, "center", rgb(.02, .16, .35));
    drawArtworkValue(details.motor, 442, 811, 278, 10.5, "center", rgb(.02, .16, .35));
    drawArtworkValue(details.chassis, 741, 811, 285, 10.5, "center", rgb(.02, .16, .35));
    drawArtworkValue(details.plate, 1045, 811, 208, 10.5, "center", rgb(.02, .16, .35));
    // Align the generated date with the baseline of the artwork's printed
    // "Good Until:" label rather than the GRANTED heading above it.
    drawArtworkValue(details.expiration, 890, 1738, 331, 12, "center", rgb(.72, .05, .07));

    const conditionsPage = pdfDoc.addPage([pageWidth, pageHeight]);
    conditionsPage.drawImage(conditionsBack, { x: 0, y: 0, width: pageWidth, height: pageHeight });

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-001-${value(renewal.renewal_code || renewal.id)}.pdf`, { title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the ${documentTitle} PDF: ${error.message}`);
  }
}

export async function openFinalMtopPermitPdfForm({ renewal, franchise = {}, changeMotor = {}, editable = false }) {
  const documentTitle = "Motorized Tricycle Operator's Permit";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/MTOP Final Permit Template.pdf?v=20261015-1", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => {
      if (!response.ok) throw new Error(`MTOP Permit template could not be loaded (${response.status}).`);
      return response.arrayBuffer();
    });
    const source = await PDFDocument.load(templateBytes);
    const pdfDoc = await PDFDocument.create();
    setPdfDocumentName(pdfDoc, documentTitle);
    const [page] = await pdfDoc.copyPages(source, [0]);
    pdfDoc.addPage(page);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const boldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
    const ink = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const answers = renewalDocumentDetails(renewal, franchise, changeMotor);
    let details = {
      name: answers.operatorName.toUpperCase(),
      franchise: answers.franchiseNumber.toUpperCase(),
      address: answers.operatorAddress.toUpperCase(),
      make: answers.make.toUpperCase(),
      model: answers.model.toUpperCase(),
      motor: answers.engine.toUpperCase(),
      chassis: answers.chassis.toUpperCase(),
      plate: answers.plate.toUpperCase(),
      route: answers.route.toUpperCase(),
      expiration: formatPermitDate(firstValue(renewal.new_expiration_date, franchise.expiration_date)),
    };
    details = await editFields(documentTitle, [
      { key: "name", label: "Operator name", value: details.name },
      { key: "franchise", label: "Franchise number", value: details.franchise },
      { key: "address", label: "Address", value: details.address },
      { key: "make", label: "Vehicle make", value: details.make },
      { key: "model", label: "Vehicle model", value: details.model },
      { key: "motor", label: "Motor / engine number", value: details.motor },
      { key: "chassis", label: "Chassis number", value: details.chassis },
      { key: "plate", label: "Plate number", value: details.plate },
      { key: "route", label: "Authorized route", value: details.route },
      { key: "expiration", label: "Good Until", value: details.expiration },
    ], editable);
    if (!details) { popup?.close(); return; }
    const reviewedVehicle = normalizeVehicleMakeModel(details.make, details.model);
    details = { ...details, make: reviewedVehicle.make, model: reviewedVehicle.model };
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;

    const cover = (x, y, width, height, inset = .8) =>
      coverBoxInterior(page, white, { x, y, width, height, inset });
    const fittedText = (text, x, y, width, height, size = 9, align = "center", font = bold) =>
      drawTextInBox(page, font, text, { x, y, width, height, size, minSize: 4.75, align, color: ink });

    // Remove the example record from the supplied official template, then place approved system data.
    cover(120, 786, 266, 13);
    cover(414, 786, 151, 13);
    cover(120, 768, 266, 14);
    fittedText(details.name, 124, 786, 255, 13, 9, "center");
    fittedText(`Franchise No. ${details.franchise}`, 418, 786, 143, 13, 8, "center", boldItalic);
    fittedText(details.address, 124, 768, 255, 14, 8, "center");
    page.drawLine({ start: { x: 124, y: 787 }, end: { x: 379, y: 787 }, thickness: .6, color: ink });
    page.drawLine({ start: { x: 124, y: 769 }, end: { x: 379, y: 769 }, thickness: .6, color: ink });

    cover(55, 716, 516, 22, 1.2);
    fittedText(details.route, 59, 716, 508, 22, 13, "center");
    page.drawLine({ start: { x: 55, y: 716 }, end: { x: 571, y: 716 }, thickness: 1.15, color: ink });

    const vehicleCells = [
      [details.make, 46, 84], [details.model, 131, 69], [details.motor, 202, 144],
      [details.chassis, 348, 146], [details.plate, 496, 67],
    ];
    vehicleCells.forEach(([text, x, width]) => {
      cover(x, 631, width, 17, 1.2);
      fittedText(text, x + 1.5, 631, width - 3, 17, 8, "center");
    });

    // Clear the full interior of the supplied sample's GRANTED box. Covering only
    // the date line leaves the example expiration visible underneath the real one.
    cover(159, 238, 405, 55, 1.7);
    fittedText("GRANTED", 165, 269, 393, 20, 17, "center");
    fittedText(`GOOD UNTIL: ${details.expiration}`, 165, 245, 393, 24, 14, "center");

    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `MTOP-PERMIT-${value(renewal.renewal_code || renewal.id)}.pdf`, { title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the ${documentTitle} PDF: ${error.message}`);
  }
}

export async function openRenewalPdfForm({ renewal, franchise = {}, changeMotor = {}, pictureUrl = "", editable = false, onSend = null }) {
  const documentTitle = "TFRO-005 Application for Motorized Tricycle Operator Permit";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-005 Application Form.pdf", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const source = await PDFDocument.load(templateBytes);
    const pdfDoc = await PDFDocument.create();
    setPdfDocumentName(pdfDoc, documentTitle);
    const [page] = await pdfDoc.copyPages(source, [0]);
    pdfDoc.addPage(page);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const answers = renewalDocumentDetails(renewal, franchise, changeMotor);
    const operatorName = answers.operatorName;
    const operatorAddress = answers.operatorAddress;
    const names = splitName(operatorName);
    const fallbackAddress = splitResidentialAddress(operatorAddress);
    const address = {
      street: firstValue(answers.street, fallbackAddress.street),
      barangay: firstValue(answers.barangay, fallbackAddress.barangay),
    };
    const ink = rgb(0, 0, 0);
    const field = (text, x, y, width, height = 18, size = 10, align = "center", useBold = false) =>
      drawTextInBox(page, useBold ? bold : font, text, {
        x, y, width, height, size, minSize: 4.75, align,
        baseWidth: 612, baseHeight: 936, color: ink,
      });

    const fullRenewalFranchiseNumber = answers.franchiseNumber;
    const birthDate = answers.birthDate;
    let manual = await editFields(documentTitle, [
      { key: "date", label: "Application date", value: dateInputValue(firstValue(renewal.request_date, renewal.created_at)), type: "date", required: true },
      { key: "franchise", label: "Franchise number", value: fullRenewalFranchiseNumber.replace(/^FR-/i, "") },
      { key: "last", label: "Last name", value: names.last },
      { key: "first", label: "First name", value: names.first },
      { key: "middle", label: "Middle name", value: names.middle },
      { key: "contact", label: "Contact number", value: answers.contact },
      { key: "street", label: "Home number and street", value: address.street },
      { key: "barangay", label: "Barangay", value: address.barangay },
      { key: "birthDate", label: "Birthdate", value: dateInputValue(birthDate), type: "date", required: true },
      { key: "birthPlace", label: "Place of birth", value: answers.birthPlace },
      { key: "age", label: "Age", value: ageFromBirthDate(birthDate) },
      { key: "civilStatus", label: "Civil status", value: answers.civilStatus },
      { key: "make", label: "Vehicle make", value: answers.make, required: true },
      { key: "plate", label: "Plate number", value: answers.plate },
      { key: "model", label: "Vehicle model", value: answers.model, required: true },
      { key: "orNumber", label: "O.R. number", value: answers.orNumber },
      { key: "engine", label: "Motor / engine number", value: answers.engine },
      { key: "orDate", label: "O.R. date", value: dateInputValue(answers.orDate), type: "date" },
      { key: "chassis", label: "Chassis number", value: answers.chassis },
      { key: "crNumber", label: "C.R. number", value: answers.crNumber },
      { key: "route", label: "Authorized route", value: answers.route },
    ], editable, onSend);
    if (!manual) { popup?.close(); return; }
    const reviewedVehicle = normalizeVehicleMakeModel(manual.make, manual.model);
    manual = {
      ...manual,
      date: formatDate(manual.date),
      birthDate: formatDate(manual.birthDate),
      orDate: formatDate(manual.orDate),
      make: reviewedVehicle.make,
      model: reviewedVehicle.model,
    };
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    field(manual.date, 505, 819, 65, 23, 10, "center");
    field(manual.franchise, 528, 798, 42, 19, 9, "right", true);
    field(manual.last, 40, 766, 177, 24, 10); field(manual.first, 218, 766, 109, 24, 10); field(manual.middle, 328, 766, 120, 24, 10);
    field(manual.contact, 451, 766, 120, 24, 10); field(manual.street, 40, 708, 278, 25, 9.5, "left"); field(manual.barangay, 323, 708, 248, 25, 9.5, "left");
    field(manual.birthDate, 40, 657, 160, 24, 9); field(manual.birthPlace, 203, 657, 163, 24, 9); field(manual.age, 370, 657, 70, 24, 9); field(manual.civilStatus, 450, 657, 121, 24, 9);
    field(manual.make, 88, 618, 213, 19, 9.5, "left"); field(manual.plate, 382, 618, 189, 19, 9.5, "left"); field(manual.model, 88, 597, 213, 19, 9.5, "left"); field(manual.orNumber, 372, 597, 199, 19, 9.5, "left");
    field(manual.engine, 108, 576, 193, 19, 9.5, "left"); field(manual.orDate, 392, 576, 179, 19, 9.5, "left"); field(manual.chassis, 112, 554, 189, 19, 9.5, "left"); field(manual.crNumber, 367, 554, 204, 19, 9.5, "left");
    coverBoxInterior(page, rgb(1, 1, 1), { x: 468, y: 517, width: 103, height: 40, inset: 1.2, baseWidth: 612, baseHeight: 936 });
    field(manual.route, 469, 518, 101, 38, 11, "center", true);
    await embedPicture(pdfDoc, page, pictureUrl);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-005-${value(renewal.renewal_code || renewal.id)}.pdf`, { title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the TFRO-005 PDF: ${error.message}`);
  }
}

export async function openPmblPdfForm({ renewal, franchise = {}, editable = false, onSend = null }) {
  const documentTitle = "PMBL TFRO-003 Certification";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/PMBL TFRO-003 Certification.pdf", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBytes);
    setPdfDocumentName(pdfDoc, documentTitle);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const width = page.getWidth();
    const height = page.getHeight();
    const sx = width / 841.8898;
    const sy = height / 595.2756;
    const black = rgb(0, 0, 0);
    const field = (text, x, y, fieldWidth, fieldHeight = 16, size = 10, useBold = false) =>
      drawTextInBox(page, useBold ? bold : font, text, {
        x, y, width: fieldWidth, height: fieldHeight, size, minSize: 4.75,
        align: "center", baseWidth: 841.8898, baseHeight: 595.2756, color: black,
      });
    const issuedInput = firstValue(renewal.admin_reviewed_at, renewal.reviewed_at, renewal.updated_at, renewal.request_date, renewal.created_at);
    const issued = issuedInput ? new Date(issuedInput) : new Date();
    const answers = renewalDocumentDetails(renewal, franchise);
    const pmblFranchiseNumber = answers.franchiseNumber;
    let manual = await editFields(documentTitle, [
      { key: "name", label: "Member name", value: answers.operatorName },
      { key: "franchise", label: "Franchise number", value: pmblFranchiseNumber },
      { key: "address", label: "Residential address", value: answers.operatorAddress },
      { key: "toda", label: "TODA", value: answers.toda },
      { key: "driver", label: "Driver", value: false, type: "checkbox", exclusiveGroup: "pmbl-role" },
      { key: "operator", label: "Operator", value: true, type: "checkbox", exclusiveGroup: "pmbl-role" },
      { key: "both", label: "Both", value: false, type: "checkbox", exclusiveGroup: "pmbl-role" },
      { key: "day", label: "Issued day", value: String(issued.getDate()) },
      { key: "month", label: "Issued month", value: issued.toLocaleDateString("en-PH", { month: "long" }) },
      { key: "year", label: "Issued year (last two digits)", value: String(issued.getFullYear()).slice(-2) },
    ], editable, onSend);
    if (!manual) { popup?.close(); return; }
    if (manual.both || (manual.driver && manual.operator)) {
      manual = { ...manual, driver: false, operator: false, both: true };
    } else if (!manual.driver && !manual.operator) {
      manual = { ...manual, operator: true, both: false };
    }
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    field(manual.name, 300, 360, 338, 18, 13, true); field(manual.franchise, 72, 341, 136, 18, 13, true);
    field(manual.address, 395, 341, 306, 18, 13, true); field(manual.toda, 145, 320, 230, 18, 13, true);
    const drawRoleMark = (x) => {
      const lineOptions = { thickness: .82 * Math.min(sx, sy), color: black };
      page.drawLine({ start: { x: (x + 1.7) * sx, y: 326.3 * sy }, end: { x: (x + 6.2) * sx, y: 330.8 * sy }, ...lineOptions });
      page.drawLine({ start: { x: (x + 1.7) * sx, y: 330.8 * sy }, end: { x: (x + 6.2) * sx, y: 326.3 * sy }, ...lineOptions });
    };
    if (manual.driver) drawRoleMark(508.5);
    if (manual.operator) drawRoleMark(585.4);
    if (manual.both) drawRoleMark(671.3);
    field(manual.day, 166, 165, 40, 18, 13, true); field(manual.month, 250, 165, 178, 18, 13, true); field(manual.year, 450, 165, 40, 18, 13, true);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `PMBL-TFRO-003-${value(renewal.renewal_code || renewal.id)}.pdf`, { title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the PMBL PDF: ${error.message}`);
  }
}

export async function openChecklistPdfForm({ renewal, documents = [], editable = false, onSend = null }) {
  const documentTitle = "TFRO-004 Checklist of Requirements for Renewal of MTOP";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-004 Checklist for Renewal.pdf", import.meta.url);
    const templateBytes = await fetch(templateUrl).then((response) => response.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBytes);
    setPdfDocumentName(pdfDoc, documentTitle);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    const uploaded = new Set(documents.map((item) => item.doc_type));
    const inspection = renewal.inspection_results || {};
    const drawMark = (x, y) => {
      page.drawLine({ start: { x: x + 1.2, y: y + 2.9 }, end: { x: x + 2.6, y: y + 1.6 }, thickness: .72, color: ink });
      page.drawLine({ start: { x: x + 2.6, y: y + 1.6 }, end: { x: x + 5.0, y: y + 4.7 }, thickness: .72, color: ink });
    };

    const documentRows = [
      ["official_receipt", 447, 121.5],
      ["insurance", 405, 121.5],
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
    let manual = await editFields(documentTitle, [
      { key: "date", label: "Checklist date", value: dateInputValue(firstValue(renewal.request_date, renewal.created_at)), type: "date", required: true },
      ...documentRows.map(([type]) => ({ key: type, label: type.replaceAll("_", " "), value: uploaded.has(type), type: "checkbox" })),
      ...physicalRows.flatMap(([key]) => [
        { key: `${key}_pass`, label: `${key.replaceAll("_", " ")} — PASS`, value: inspection[key] === true, type: "checkbox" },
        { key: `${key}_fail`, label: `${key.replaceAll("_", " ")} — FAIL`, value: inspection[key] === false, type: "checkbox" },
      ]),
    ], editable, onSend);
    if (!manual) { popup?.close(); return; }
    manual = { ...manual, date: formatDate(manual.date) };
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    drawTextInBox(page, font, manual.date, {
      x: 294, y: 520, width: 68, height: 13, size: 9, minSize: 6,
      align: "center", color: ink,
    });
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
    await showPdf(popup, bytes, `TFRO-004-${value(renewal.renewal_code || renewal.id)}.pdf`, { title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate the TFRO-004 PDF: ${error.message}`);
  }
}

function droppingDetails(request = {}, franchise = {}, operator = {}) {
  return {
    operator: firstValue(operator.full_name, request.operator_name, franchise.operator_name),
    address: firstValue(operator.address, request.operator_address, franchise.address),
    contact: firstValue(operator.contact_number, request.operator_contact, franchise.contact_number),
    franchise: firstValue(franchise.franchise_number, request.franchise_number),
    toda: firstValue(franchise.toda_name, request.toda_name),
    route: firstValue(franchise.route, request.route, "LUCENA CITY PROPER"),
    make: firstValue(request.old_motor_brand, franchise.motorcycle_brand),
    model: firstValue(request.old_motor_model, franchise.motorcycle_year_model),
    motor: firstValue(request.old_engine_number, franchise.engine_number),
    chassis: firstValue(request.old_chassis_number, franchise.chassis_number),
    plate: firstValue(request.old_plate_number, franchise.plate_number),
  };
}

export async function openDroppingPetitionPdfForm({ request, franchise = {}, operator = {}, editable = false, onSend = null }) {
  const documentTitle = "TFRO-002 Petition for Dropping";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-002 Petition for Dropping.pdf?v=20260826-222000", import.meta.url);
    const pdfDoc = await PDFDocument.load(await fetch(templateUrl).then((response) => response.arrayBuffer()));
    setPdfDocumentName(pdfDoc, documentTitle);
    const page = pdfDoc.getPage(0);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const ink = rgb(0, 0, 0);
    let data = droppingDetails(request, franchise, operator);
    data.requestCode = value(request.request_code || request.id);
    data = await editFields(documentTitle, [
      { key: "operator", label: "Operator name", value: data.operator }, { key: "requestCode", label: "Request code", value: data.requestCode },
      { key: "address", label: "Address", value: data.address }, { key: "contact", label: "Contact number", value: data.contact },
      { key: "franchise", label: "Franchise number", value: data.franchise }, { key: "toda", label: "TODA", value: data.toda },
      { key: "route", label: "Route", value: data.route }, { key: "make", label: "Vehicle make", value: data.make },
      { key: "model", label: "Vehicle model", value: data.model }, { key: "motor", label: "Motor / engine number", value: data.motor },
      { key: "chassis", label: "Chassis number", value: data.chassis }, { key: "plate", label: "Plate number", value: data.plate },
    ], editable, onSend);
    if (!data) { popup?.close(); return; }
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    const write = (text, x, y, maxWidth, size = 11, centered = false, useBold = false, wrapAtHyphens = false) => {
      if (!text) return;
      const selected = useBold ? bold : font;
      const fitted = fitTextSize(selected, text, size, maxWidth, 7);
      const textOptions = {
        x: centered ? alignedTextX(selected, text, fitted, x, maxWidth, "center") : x,
        y, size: fitted, font: selected, color: ink,
      };
      page.drawText(text, textOptions);
    };
    write(data.operator, 72, 801, 180, 11, true, true);
    write(data.requestCode, 487, 801, 80, 11, true, false);
    write(data.toda, 493, 774, 66, 11, true, true);
    write(data.contact, 487, 748, 75, 11, true, true);
    write(data.address, 72, 647, 467, 11, true, true);
    // Rebuild the vehicle row so every heading and value uses the same baseline.
    // The source form places PLATE on a lower line, which caused long values to
    // overlap the Motor and Chassis fields.
    page.drawRectangle({ x: 45, y: 595, width: 520, height: 34, color: rgb(1, 1, 1) });
    const vehicleColumns = [
      ["MAKE", data.make, 48, 92],
      ["MODEL", data.model, 145, 92],
      ["MOTOR No.", data.motor, 242, 112],
      ["CHASSIS No.", data.chassis, 359, 118],
      ["PLATE", data.plate, 482, 80],
    ];
    vehicleColumns.forEach(([label, fieldValue, x, columnWidth]) => {
      write(label, x, 617, columnWidth, 10, true, true);
      write(fieldValue, x, 601, columnWidth, 10, true, true, true);
    });
    write(data.route, 181, 572, 210, 11, true, true);
    write(data.franchise, 183, 557, 200, 11, true, true);
    write(data.operator, 112, 397, 143, 11, true, true);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-002-${value(request.request_code || request.id)}.pdf`, { title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-002: ${error.message}`);
  }
}

export async function openDroppingCertificationPdfForm({ request, franchise = {}, operator = {}, editable = false, onSend = null }) {
  const documentTitle = "TFRO-007 Certification of Dropping";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const pdfDoc = await PDFDocument.create();
    setPdfDocumentName(pdfDoc, documentTitle);
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const ink = rgb(0, 0, 0);
    const headerUrl = new URL("../forms/public/assets/tfro-official-header.png?v=20260913-1", import.meta.url);
    const headerBytes = await fetch(headerUrl).then((response) => {
      if (!response.ok) throw new Error(`Official TFRO header could not be loaded (${response.status}).`);
      return response.arrayBuffer();
    });
    const header = await pdfDoc.embedPng(headerBytes);
    page.drawImage(header, { x: 18, y: 760, width: 559, height: 61.15 });
    page.drawRectangle({ x: 452, y: 738, width: 96, height: 22, color: rgb(0.34, 0.56, 0.78) });
    page.drawText("TFRO - 007", { x: 469, y: 745, size: 10, font: bold, color: ink });
    page.drawRectangle({ x: 558, y: 736, width: 6, height: 23, color: rgb(0.34, 0.56, 0.78) });
    const issued = request.admin_reviewed_at ? new Date(request.admin_reviewed_at) : new Date();
    const issuedDefault = issued.toLocaleDateString("en-PH", { month: "long", day: "2-digit", year: "numeric" }).toUpperCase();
    const data = await editFields(documentTitle, [
      ...Object.entries(droppingDetails(request, franchise, operator)).map(([key, fieldValue]) => ({ key, label: key.replaceAll("_", " "), value: fieldValue })),
      { key: "issued", label: "Issued date", value: issuedDefault },
    ], editable, onSend);
    if (!data) { popup?.close(); return; }
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    const write = (text, x, y, maxWidth, size = 11, useBold = false, align = "left") => {
      if (!text) return;
      const selected = useBold ? bold : font;
      const fitted = fitTextSize(selected, text, size, maxWidth, 7);
      const drawX = alignedTextX(selected, text, fitted, x, maxWidth, align);
      page.drawText(text, { x: drawX, y, size: fitted, font: selected, color: ink });
    };

    write("C E R T I F I C A T I O N", 80, 665, 435, 22, false, "center");
    const subtitle = "of Dropping";
    const subtitleSize = 12;
    page.drawText(subtitle, {
      x: alignedTextX(italic, subtitle, subtitleSize, 80, 435, "center"),
      y: 634, size: subtitleSize, font: italic, color: rgb(.32, .32, .32),
    });

    write(`This is to certify that the tricycle franchise Number. ${data.franchise}`, 80, 584, 435, 10);
    write("has been cancelled/dropped due to privatization of tricycle described hereunder;", 80, 568, 435, 10);

    const detailRows = [
      ["Owner", data.operator],
      ["Make", data.make],
      ["Motor No.", data.motor],
      ["Chassis No.", data.chassis],
      ["Plate No.", data.plate],
    ];
    detailRows.forEach(([label, fieldValue], index) => {
      const y = 488 - (index * 17);
      write(label, 115, y, 90, 9, true);
      write(":", 208, y, 10, 9, true);
      write(fieldValue, 228, y, 250, 9, true);
    });

    write(`Issued this ${data.issued}.`, 70, 330, 260, 9, true);
    write("CRISELDA C. DAVID, DPPA", 330, 195, 205, 9, true, "center");
    write("TFRO HEAD", 330, 176, 205, 9, true, "center");
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-007-${value(request.request_code || request.id)}.pdf`, { title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-007: ${error.message}`);
  }
}

export async function openPaymentOrderPdfForm({ payment = {}, violation = {}, editable = false, onSend = null, viewOnly = false }) {
  const documentTitle = "TFRO-009 Order of Payment";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb, degrees } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-009 Order of Payment.pdf", import.meta.url);
    const { pdfDoc, page } = await createCroppedOfficialForm(PDFDocument, templateUrl, 1, 468, 468);
    setPdfDocumentName(pdfDoc, documentTitle);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: 92, color: rgb(1, 1, 1) });
    const snapshot = payment.receipt_snapshot || {};
    const driver = violation.drivers || {};
    const linkedFranchise = driver.franchises || {};
    const recordedProfile = payment.recorded_profile || {};
    const amount = snapshot.amount_paid ?? payment.amount ?? violation.penalty ?? 0;
    const write = (text, x, y, maxWidth, size = 11, align = "left", useBold = false) =>
      drawScaled(page, useBold ? bold : font, text, x, y, size, { maxWidth, minSize: 6.5, align, color: ink, baseHeight: 468 });

    const manual = await editFields(documentTitle, [
      { key: "payer", label: "Payor", value: firstValue(snapshot.payer, payment.payer, payment.unit_owner_name, violation.subject_name, driver.full_name, linkedFranchise.operator_name) },
      { key: "officers", label: "Apprehending officer/s", value: firstValue(snapshot.apprehending_officers, violation.apprehending_officers) },
      { key: "address", label: "Address", value: firstValue(snapshot.address, payment.unit_owner_address, driver.address, linkedFranchise.address) },
      { key: "ticket", label: "Ticket number", value: firstValue(snapshot.ticket_number, violation.ticket_number) },
      { key: "code", label: "Violation code", value: firstValue(snapshot.code, violation.violation_code) },
      { key: "violation", label: "Violation", value: firstValue(snapshot.violation, violation.violation_type) },
      { key: "amount", label: "Amount due / paid", value: money(amount) },
      { key: "receipt", label: "Official receipt number", value: firstValue(payment.receipt, violation.treasurer_receipt_number) },
      { key: "assessedBy", label: "Assessed by", value: firstValue(snapshot.assessed_by, recordedProfile.full_name, "TFRO STAFF") },
      { key: "datePaid", label: "Date paid", value: formatDate(firstValue(payment.date, payment.paid_at)) },
    ], editable, onSend);
    if (!manual) { popup?.close(); return; }
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    page.drawRectangle({ x: 46, y: 326, width: 506, height: 38, color: rgb(1, 1, 1) });
    write("Payor:", 50, 348, 45, 9, "left", true); write(manual.payer, 96, 348, 192, 9);
    page.drawLine({ start:{x:96,y:345}, end:{x:292,y:345}, thickness:.55, color:ink });
    write("Apprehending Officer/s:", 309, 348, 112, 9, "left", true); write(manual.officers, 421, 348, 129, 8.5, "center");
    page.drawLine({ start:{x:421,y:345}, end:{x:550,y:345}, thickness:.55, color:ink });
    write("Address:", 50, 333, 45, 9, "left", true); write(manual.address, 96, 333, 192, 8.5);
    page.drawLine({ start:{x:96,y:330}, end:{x:292,y:330}, thickness:.55, color:ink });
    write("Ticket No.:", 309, 333, 68, 9, "left", true); write(manual.ticket, 421, 333, 129, 8.5, "center");
    page.drawLine({ start:{x:421,y:330}, end:{x:550,y:330}, thickness:.55, color:ink });
    write(manual.code, 75, 286, 112, 9, "center"); write(manual.violation, 193, 286, 205, 9, "center");
    write(manual.amount, 405, 286, 126, 9, "center"); write(manual.amount, 405, 193, 126, 9.5, "center");
    page.drawRectangle({ x: 48, y: 92, width: 310, height: 84, color: rgb(1, 1, 1) });
    write("O.R. No.:", 50, 130, 55, 8.5, "left", true); write(manual.receipt, 105, 130, 95, 8.5);
    write("Amount:", 50, 116, 55, 8.5, "left", true); write(manual.amount, 105, 116, 95, 8.5);
    write("Date Paid:", 50, 102, 55, 8.5, "left", true); write(manual.datePaid, 105, 102, 95, 8.5);
    write("Assessed by:", 230, 130, 120, 9, "center", true);
    write(manual.assessedBy || "TFRO STAFF", 230, 114, 120, 8, "center", true);
    page.drawLine({ start:{x:230,y:110}, end:{x:350,y:110}, thickness:.55, color:ink });

    if (viewOnly) drawRecordedWatermark(page, bold, rgb(.08, .29, .48), degrees);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-009-${value(payment.receipt || violation.ticket_number || payment.id)}.pdf`, { viewOnly, title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-009: ${error.message}`);
  }
}

export async function openUnitReleasePdfForm({ payment = {}, violation = {}, editable = false, onSend = null, viewOnly = false }) {
  const documentTitle = "TFRO-010 Vehicle/Unit Releasing Slip";
  let popup = editable ? null : openPdfWindow(documentTitle);
  if (!editable && !popup) return;
  try {
    const { PDFDocument, StandardFonts, rgb, degrees } = await loadPdfLib();
    const templateUrl = new URL("../forms/TFRO-010 Unit Releasing Slip.pdf", import.meta.url);
    const { pdfDoc, page } = await createCroppedOfficialForm(PDFDocument, templateUrl, 0, 468, 468);
    setPdfDocumentName(pdfDoc, documentTitle);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0, 0, 0);
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: 92, color: rgb(1, 1, 1) });
    const driver = violation.drivers || {};
    const linkedFranchise = driver.franchises || {};
    const recordedProfile = payment.recorded_profile || {};
    const write = (text, x, y, maxWidth, size = 8.5, align = "left", useBold = false) =>
      drawScaled(page, useBold ? bold : font, text, x, y, size, { maxWidth, minSize: 6.5, align, color: ink, baseHeight: 468 });

    const manual = await editFields(documentTitle, [
      { key: "owner", label: "Unit owner", value: firstValue(payment.unit_owner_name, payment.payer, linkedFranchise.operator_name, violation.subject_name) },
      { key: "releaseDate", label: "Release date", value: formatDate(firstValue(payment.release_date, payment.date, payment.paid_at)) },
      { key: "ownerAddress", label: "Owner address", value: firstValue(payment.unit_owner_address, linkedFranchise.address, driver.address) }, { key: "ownerContact", label: "Owner contact", value: firstValue(payment.unit_owner_contact, linkedFranchise.contact_number) },
      { key: "driver", label: "Driver name", value: firstValue(payment.driver_name, driver.full_name, payment.payer) }, { key: "driverAddress", label: "Driver address", value: firstValue(payment.driver_address, driver.address) },
      { key: "driverContact", label: "Driver contact", value: firstValue(payment.driver_contact, driver.contact_number) }, { key: "engine", label: "Engine number", value: firstValue(payment.engine_number, linkedFranchise.engine_number) },
      { key: "chassis", label: "Chassis number", value: firstValue(payment.chassis_number, linkedFranchise.chassis_number) }, { key: "receipt", label: "Official receipt number", value: firstValue(payment.receipt, violation.treasurer_receipt_number) },
      { key: "amount", label: "Amount paid", value: money(payment.amount ?? payment.receipt_snapshot?.amount_paid ?? violation.penalty) }, { key: "datePaid", label: "Date paid", value: formatDate(firstValue(payment.date, payment.paid_at)) },
      { key: "recordedBy", label: "Recorded by", value: firstValue(payment.receipt_snapshot?.assessed_by, recordedProfile.full_name, "TFRO Staff") },
      { key: "releasedBy", label: "Released by", value: firstValue(payment.released_by, violation.apprehending_officers) }, { key: "witness", label: "Witness", value: payment.release_witness },
      { key: "releaseTime", label: "Release time", value: payment.release_time },
    ], editable, onSend);
    if (!manual) { popup?.close(); return; }
    popup ||= openPdfWindow(documentTitle);
    if (!popup) return;
    page.drawRectangle({ x: 60, y: 274, width: 472, height: 83, color: rgb(1, 1, 1) });
    const detailLine = (label, fieldValue, labelX, valueX, y, valueWidth) => {
      write(label, labelX, y, valueX - labelX - 4, 8.5, "left", true);
      write(fieldValue, valueX, y, valueWidth, 8.25);
      page.drawLine({ start:{x:valueX,y:y-3}, end:{x:valueX+valueWidth,y:y-3}, thickness:.5, color:ink });
    };
    detailLine("Name of Unit Owner:", manual.owner, 72, 177, 342, 220);
    detailLine("Date:", manual.releaseDate, 410, 445, 342, 87);
    detailLine("Address:", manual.ownerAddress, 72, 128, 326, 230);
    detailLine("Contact Number:", manual.ownerContact, 366, 445, 326, 87);
    detailLine("Name of Driver:", manual.driver, 72, 158, 310, 239);
    detailLine("Address:", manual.driverAddress, 72, 128, 294, 230);
    detailLine("Contact Number:", manual.driverContact, 366, 445, 294, 87);
    page.drawRectangle({ x: 62, y: 168, width: 240, height: 92, color: rgb(1, 1, 1) });
    write("Impoundment Information:", 72, 248, 210, 9.5, "left", true);
    detailLine("Engine No.:", manual.engine, 72, 132, 230, 158);
    detailLine("Chassis No.:", manual.chassis, 72, 132, 214, 158);
    detailLine("O.R. No.:", manual.receipt, 72, 132, 194, 158);
    detailLine("Amount Paid:", manual.amount, 72, 132, 178, 158);
    detailLine("Date Paid:", manual.datePaid, 72, 132, 162, 158);
    page.drawRectangle({ x: 62, y: 104, width: 170, height: 49, color: rgb(1, 1, 1) });
    write("Recorded by:", 72, 142, 150, 9, "left", true);
    page.drawLine({ start:{x:72,y:119}, end:{x:222,y:119}, thickness:.55, color:ink });
    write(manual.recordedBy, 72, 108, 150, 8, "center", true);
    page.drawRectangle({ x: 328, y: 121, width: 205, height: 75, color: rgb(1, 1, 1) });
    detailLine("Released by:", manual.releasedBy, 334, 390, 178, 135);
    detailLine("Witness:", manual.witness, 334, 390, 158, 135);
    detailLine("Time:", manual.releaseTime, 334, 365, 138, 63);
    detailLine("Date:", manual.releaseDate, 438, 467, 138, 58);

    if (viewOnly) drawRecordedWatermark(page, bold, rgb(.08, .29, .48), degrees);
    const bytes = await pdfDoc.save();
    await showPdf(popup, bytes, `TFRO-010-${value(payment.receipt || payment.id)}.pdf`, { viewOnly, title: documentTitle });
  } catch (error) {
    popup?.close();
    console.error(error);
    alert(`Unable to generate TFRO-010: ${error.message}`);
  }
}
