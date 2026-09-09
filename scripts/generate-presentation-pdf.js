const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const outputPath = path.join(__dirname, "..", "docs", "TFRO-IMIS_Presentation_Guide_and_Script.pdf");

const navy = rgb(0.035, 0.12, 0.23);
const blue = rgb(0.05, 0.28, 0.55);
const yellow = rgb(0.96, 0.68, 0.08);
const ink = rgb(0.08, 0.12, 0.18);
const gray = rgb(0.38, 0.43, 0.49);
const pale = rgb(0.96, 0.97, 0.98);
const white = rgb(1, 1, 1);

const sections = [
  {
    title: "Quick Recording Guide",
    type: "guide",
    items: [
      ["0:00-0:25", "Introduction", "Show the login page and introduce TFRO-IMIS, its purpose, and the office processes it centralizes."],
      ["0:25-0:50", "Login and user roles", "Explain role-based access for administrators, office personnel, and traffic enforcers."],
      ["0:50-1:20", "Dashboard", "Show summary cards and explain how they help personnel identify pending work."],
      ["1:20-1:55", "Franchise Records", "Demonstrate sorting, searching, and viewing essential franchise details."],
      ["1:55-2:35", "Renewal and Change Motor", "Show request details, review controls, approval, and automatic updating of the franchise record."],
      ["2:35-3:05", "Registries", "Briefly present operator and driver records, document validity, and compliance details."],
      ["3:05-3:35", "Enforcer Portal", "Demonstrate ticket entry and photo evidence without submitting a duplicate production record."],
      ["3:35-4:00", "Violations and Payments", "Show monitoring of penalties, payment transactions, and receipts."],
      ["4:00-4:30", "Reports", "Demonstrate filters and CSV, PDF, or print output."],
      ["4:30-5:00", "Design and closing", "Show the consistent navy-blue and yellow interface, then summarize the system's benefits."],
    ],
  },
  {
    title: "Before You Record",
    type: "bullets",
    items: [
      "Prepare working demo accounts for the roles you will show.",
      "Use sample data and never reveal passwords or sensitive personal information.",
      "Close unrelated tabs and disable desktop notifications.",
      "Set browser zoom so all text is readable in the recording.",
      "Prepare one sample franchise, renewal, change-motor request, and violation.",
      "Confirm that each page loads before recording.",
      "Avoid submitting duplicate records in the production database.",
      "Record at 1080p when available and move the cursor slowly.",
    ],
  },
  {
    title: "1. Introduction",
    screen: "Login page and system title/logo",
    speaker: "Presenter 1",
    text: [
      "Good day, everyone! We are here to present our system called the Traffic and Franchising Regulatory Office Integrated Management Information System, or TFRO-IMIS.",
      "This web-based system was developed to help the Traffic and Franchising Regulatory Office organize and manage its daily operations. It centralizes franchise records, applications, renewals, change-motor requests, operator and driver information, traffic violations, payments, and reports.",
      "Our goal is to reduce manual paperwork, prevent duplicate records, and make information easier to access and monitor.",
    ],
  },
  {
    title: "2. Login and User Access",
    screen: "Enter the login credentials, then open the authorized portal",
    speaker: "Presenter 2",
    text: [
      "We will begin with the login page. Registered users must provide valid credentials before they can access the system.",
      "TFRO-IMIS uses role-based access. This means administrators, office personnel, and traffic enforcers are given different features and permissions depending on their responsibilities.",
      "This helps protect confidential records and prevents unauthorized users from changing important information.",
    ],
  },
  {
    title: "3. Dashboard",
    screen: "Dashboard summary cards, charts, alerts, and pending items",
    speaker: "Presenter 1",
    text: [
      "After logging in, the user is directed to the dashboard.",
      "The dashboard provides an executive summary of the system's records and transactions. It displays important information such as registered franchises, operators, drivers, renewal requests, change-motor requests, violations, and pending transactions.",
      "Instead of checking every module individually, office personnel can quickly understand current operations and identify requests that require attention.",
    ],
  },
  {
    title: "4. Franchise Records",
    screen: "Franchise Records table, search, sorting, and record details",
    speaker: "Presenter 2",
    text: [
      "Next is the Franchise Records module, which serves as the master list of registered franchises.",
      "The table displays the franchise number, operator's name and address, previous MTOP expiry, current MTOP expiry, TODA affiliation, and available actions.",
      "Records are arranged according to their franchise numbers. Users can search for a specific record and open its complete details.",
      "The concise table layout keeps the information readable without unnecessary horizontal scrolling.",
    ],
  },
  {
    title: "5. Franchise Renewal",
    screen: "Renewal request details, documents, status, and approval controls",
    speaker: "Presenter 1",
    text: [
      "The Franchise Renewal module manages requests from operators who need to renew their franchise or MTOP.",
      "Office personnel can review the request number, operator information, franchise details, submission date, assessment, payment information, supporting documents, and current status.",
      "After confirming that the requirements are complete, an authorized user can approve or reject the request.",
      "Once approved, the corresponding expiry information is automatically updated in Franchise Records. This reduces repeated data entry and keeps records consistent.",
    ],
  },
  {
    title: "6. Change Motor Request",
    screen: "A request showing the previous and replacement vehicle details",
    speaker: "Presenter 2",
    text: [
      "The Change Motor Request feature is used when a franchise operator needs to replace the vehicle associated with an existing franchise.",
      "Personnel can compare the previous and replacement vehicle information, including the engine number, chassis number, plate number, make, model, and submitted documents.",
      "Once the request has been reviewed and approved, the replacement vehicle information is automatically reflected in the related franchise record.",
    ],
  },
  {
    title: "7. Operator and Driver Registries",
    screen: "Operator Registry followed by Driver Registry",
    speaker: "Presenter 1",
    text: [
      "The system also maintains separate registries for operators and drivers.",
      "The Operator Registry contains registered operator information, contact details, account status, verification details, and associated franchise.",
      "The Driver Registry records driver information, license details, expiration dates, compliance status, and assigned operator or franchise.",
      "These centralized registries help personnel find accurate information quickly and reduce reliance on separate paper records.",
    ],
  },
  {
    title: "8. Traffic Enforcer Portal and Violations",
    screen: "Enforcer portal and ticket form; do not submit a duplicate ticket",
    speaker: "Presenter 2",
    text: [
      "Traffic enforcers are provided with their own secure portal.",
      "An authorized enforcer can record a violation by identifying the driver or operator, selecting the violation, entering the ticket number, and specifying the date, location, and other details.",
      "The enforcer can also attach photographic evidence when required.",
      "Every submitted ticket is linked to the authenticated enforcer's account and sent to the office for verification and processing. This improves accountability and creates a centralized violation history.",
    ],
  },
  {
    title: "9. Payments",
    screen: "Payments list and a sample transaction or receipt",
    speaker: "Presenter 1",
    text: [
      "The Payments module records and monitors transactions related to franchises, renewals, violations, and other applicable fees.",
      "Personnel can review the payor, amount, payment type, transaction date, reference number, and receipt information.",
      "This improves collection monitoring and makes payment records easier to verify.",
    ],
  },
  {
    title: "10. Reports",
    screen: "Reports page, filters, date range, and export buttons",
    speaker: "Presenter 2",
    text: [
      "The Reports module converts stored information into useful documents for monitoring and decision-making.",
      "The system can generate reports for franchise records, renewals, change-motor requests, operators, drivers, violations, and payments.",
      "Users can search records, apply filters, choose a date range, and export results as CSV or PDF files. Reports may also be printed directly from the system.",
      "These features help the office prepare accurate reports without manually collecting information from multiple documents.",
    ],
  },
  {
    title: "11. Design and Technology",
    screen: "Navigate slowly between the dashboard and two other modules",
    speaker: "Presenter 1",
    text: [
      "TFRO-IMIS uses a consistent and minimal interface with a dark-blue and yellow color palette.",
      "Tables use visible grids and readable text to keep records organized. The interface also reduces unnecessary scrolling and makes common actions easy to locate.",
      "The system uses GitHub-based web deployment, while Supabase supports the database, authentication, file storage, and row-level security.",
    ],
  },
  {
    title: "12. Conclusion",
    screen: "Return to the dashboard and system title",
    speaker: "Presenter 2, then Presenter 1, then both",
    text: [
      "PRESENTER 2: In summary, TFRO-IMIS provides a centralized, organized, and secure platform for managing the services of the Traffic and Franchising Regulatory Office.",
      "PRESENTER 1: It reduces manual work, improves record accuracy, speeds up transaction processing, and provides better monitoring through dashboards and reports.",
      "BOTH: This is the Traffic and Franchising Regulatory Office Integrated Management Information System. Thank you for watching!",
    ],
  },
];

function wrap(text, font, size, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function main() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [595.28, 841.89];
  const margin = 48;

  const addPage = (title) => {
    const page = pdf.addPage(pageSize);
    page.drawRectangle({ x: 0, y: pageSize[1] - 78, width: pageSize[0], height: 78, color: navy });
    page.drawRectangle({ x: 0, y: pageSize[1] - 83, width: pageSize[0], height: 5, color: yellow });
    page.drawText(title, { x: margin, y: pageSize[1] - 51, size: 20, font: bold, color: white });
    return { page, y: pageSize[1] - 112 };
  };

  const cover = pdf.addPage(pageSize);
  cover.drawRectangle({ x: 0, y: 0, width: pageSize[0], height: pageSize[1], color: navy });
  cover.drawRectangle({ x: 48, y: 170, width: 8, height: 500, color: yellow });
  cover.drawText("TFRO-IMIS", { x: 82, y: 610, size: 35, font: bold, color: white });
  cover.drawText("VIDEO PRESENTATION", { x: 82, y: 568, size: 24, font: bold, color: yellow });
  cover.drawText("Guide and Two-Presenter Voice-over Script", { x: 82, y: 530, size: 15, font: regular, color: white });
  cover.drawText("Recommended duration: 3-5 minutes", { x: 82, y: 480, size: 12, font: regular, color: rgb(0.78, 0.84, 0.91) });
  cover.drawText("Traffic and Franchising Regulatory Office", { x: 82, y: 224, size: 13, font: bold, color: white });
  cover.drawText("Integrated Management Information System", { x: 82, y: 203, size: 13, font: regular, color: white });

  for (const section of sections) {
    let { page, y } = addPage(section.title);
    const contentWidth = pageSize[0] - margin * 2;

    if (section.type === "guide") {
      for (const [time, label, detail] of section.items) {
        const detailLines = wrap(detail, regular, 10.5, contentWidth - 122);
        const rowHeight = Math.max(48, detailLines.length * 14 + 18);
        if (y - rowHeight < 55) ({ page, y } = addPage(`${section.title} (continued)`));
        page.drawRectangle({ x: margin, y: y - rowHeight + 5, width: contentWidth, height: rowHeight, color: pale, borderColor: rgb(0.78, 0.82, 0.86), borderWidth: 0.6 });
        page.drawText(time, { x: margin + 12, y: y - 17, size: 10, font: bold, color: blue });
        page.drawText(label, { x: margin + 110, y: y - 16, size: 11, font: bold, color: ink });
        detailLines.forEach((line, i) => page.drawText(line, { x: margin + 110, y: y - 31 - i * 14, size: 10.5, font: regular, color: gray }));
        y -= rowHeight + 8;
      }
    } else if (section.type === "bullets") {
      for (const item of section.items) {
        const lines = wrap(item, regular, 11.5, contentWidth - 28);
        if (y - lines.length * 17 < 55) ({ page, y } = addPage(`${section.title} (continued)`));
        page.drawCircle({ x: margin + 5, y: y - 5, size: 3.5, color: yellow });
        lines.forEach((line, i) => page.drawText(line, { x: margin + 19, y: y - 10 - i * 17, size: 11.5, font: regular, color: ink }));
        y -= lines.length * 17 + 12;
      }
    } else {
      page.drawRectangle({ x: margin, y: y - 58, width: contentWidth, height: 58, color: pale, borderColor: rgb(0.78, 0.82, 0.86), borderWidth: 0.7 });
      page.drawText("ON SCREEN", { x: margin + 12, y: y - 20, size: 9, font: bold, color: blue });
      const screenLines = wrap(section.screen, regular, 10.5, contentWidth - 100);
      screenLines.slice(0, 2).forEach((line, i) => page.drawText(line, { x: margin + 92, y: y - 20 - i * 14, size: 10.5, font: regular, color: ink }));
      y -= 79;
      page.drawText(section.speaker.toUpperCase(), { x: margin, y, size: 11, font: bold, color: blue });
      y -= 24;
      for (const paragraph of section.text) {
        const lines = wrap(paragraph, regular, 12, contentWidth);
        if (y - lines.length * 18 < 55) ({ page, y } = addPage(`${section.title} (continued)`));
        lines.forEach((line, i) => page.drawText(line, { x: margin, y: y - i * 18, size: 12, font: regular, color: ink }));
        y -= lines.length * 18 + 15;
      }
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    if (index === 0) return;
    page.drawLine({ start: { x: margin, y: 35 }, end: { x: pageSize[0] - margin, y: 35 }, thickness: 0.6, color: rgb(0.8, 0.83, 0.86) });
    page.drawText("TFRO-IMIS Video Presentation", { x: margin, y: 20, size: 8.5, font: regular, color: gray });
    page.drawText(`${index + 1} / ${pages.length}`, { x: pageSize[0] - margin - 30, y: 20, size: 8.5, font: regular, color: gray });
  });

  pdf.setTitle("TFRO-IMIS Video Presentation Guide and Script");
  pdf.setSubject("3-5 minute screen-recording guide and two-presenter voice-over script");
  pdf.setAuthor("TFRO-IMIS Project Team");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, await pdf.save());
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
