const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const publicDirectories = ["css", "html", "js", "Logo"];
const publicRootFiles = ["Tricycle Image.png", "index.html", ".nojekyll"];

if (path.dirname(output) !== root || path.basename(output) !== "dist") {
  throw new Error(`Refusing to clean unexpected output path: ${output}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const directory of publicDirectories) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), {
    recursive: true,
  });
}

for (const file of publicRootFiles) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

// Provide an email-client-safe logo URL without spaces in the filename.
fs.copyFileSync(
  path.join(root, "Logo", "TFRO Logo.jpg"),
  path.join(output, "Logo", "tfro-logo.jpg"),
);

// Bundle the pinned QR generator locally so Driver QR cards do not depend on a CDN.
const qrVendorDirectory = path.join(output, "js", "vendor");
fs.mkdirSync(qrVendorDirectory, { recursive: true });
fs.copyFileSync(
  path.join(root, "node_modules", "qrcodejs", "qrcode.min.js"),
  path.join(qrVendorDirectory, "qrcode.min.js"),
);

const forbiddenExtensions = new Set([".md", ".sql", ".toml"]);
const forbiddenFiles = new Set(["package.json", "package-lock.json", "server.js"]);

function verify(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      verify(target);
      continue;
    }

    if (forbiddenExtensions.has(path.extname(entry.name)) || forbiddenFiles.has(entry.name)) {
      throw new Error(`Internal file was copied into the Netlify output: ${target}`);
    }
  }
}

verify(output);
console.log(`Netlify frontend built at ${output}`);
