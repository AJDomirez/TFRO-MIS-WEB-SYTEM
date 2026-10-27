const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const input = path.join(root, "docs", "TFRO-IMIS-System-Workflow.html");
const output = path.join(root, "docs", "TFRO-IMIS-System-Workflow.pdf");
const browserCandidates = process.platform === "win32"
  ? [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

const browser = browserCandidates.find((candidate) => fs.existsSync(candidate));
if (!browser) throw new Error("Chrome or Edge is required to generate the workflow PDF.");

const fileUrl = new URL(`file:///${input.replace(/\\/g, "/")}`).href;
const result = spawnSync(browser, [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  "--print-to-pdf-no-header",
  `--print-to-pdf=${output}`,
  fileUrl,
], { encoding: "utf8" });

if (result.status !== 0 || !fs.existsSync(output)) {
  throw new Error(result.stderr || result.stdout || "PDF generation failed.");
}

console.log(output);
