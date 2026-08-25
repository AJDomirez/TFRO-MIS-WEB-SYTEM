const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const errors = [];

function filesIn(directory, extension) {
  return fs
    .readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(root, directory, entry.name));
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function localTarget(sourceFile, reference) {
  const clean = reference.split("#")[0].split("?")[0];
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  try {
    return path.resolve(path.dirname(sourceFile), decodeURIComponent(clean));
  } catch {
    errors.push(`${relative(sourceFile)} has an invalid encoded path: ${reference}`);
    return null;
  }
}

const javascriptFiles = [path.join(root, "server.js"), ...filesIn("js", ".js")];
for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    errors.push(`${relative(file)} has invalid JavaScript:\n${result.stderr.trim()}`);
  }

  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s+)["'](\.[^"']+)["']/g)) {
    const target = localTarget(file, match[1]);
    const isBundledQrVendor = match[1].split("?")[0].endsWith("/js/vendor/qrcode.min.js")
      && fs.existsSync(path.join(root, "node_modules", "qrcodejs", "qrcode.min.js"));
    if (target && !fs.existsSync(target) && !isBundledQrVendor) {
      errors.push(`${relative(file)} imports missing file ${match[1]}`);
    }
  }
}

for (const file of filesIn("html", ".html")) {
  const source = fs.readFileSync(file, "utf8");
  const ids = new Set();
  for (const match of source.matchAll(/\bid=["']([^"']+)["']/g)) {
    if (ids.has(match[1])) errors.push(`${relative(file)} contains duplicate id="${match[1]}"`);
    ids.add(match[1]);
  }

  for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const target = localTarget(file, match[1]);
    const isBundledQrVendor = match[1].split("?")[0].endsWith("/js/vendor/qrcode.min.js")
      && fs.existsSync(path.join(root, "node_modules", "qrcodejs", "qrcode.min.js"));
    if (target && !fs.existsSync(target) && !isBundledQrVendor) {
      errors.push(`${relative(file)} references missing file ${match[1]}`);
    }
  }
}

for (const file of filesIn("css", ".css")) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/url\(["']?([^)'\"]+)["']?\)/g)) {
    const target = localTarget(file, match[1].trim());
    if (target && !fs.existsSync(target)) {
      errors.push(`${relative(file)} references missing file ${match[1].trim()}`);
    }
  }
}

for (const publicDirectory of ["html", "css", "js"]) {
  if (fs.existsSync(path.join(root, publicDirectory, ".env"))) {
    errors.push(`${publicDirectory}/.env is publicly served; move configuration out of public folders`);
  }
}

if (errors.length) {
  console.error(`Project validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Project validation passed: ${javascriptFiles.length} JavaScript files, ` +
  `${filesIn("html", ".html").length} HTML files, and ${filesIn("css", ".css").length} CSS files checked.`
);
