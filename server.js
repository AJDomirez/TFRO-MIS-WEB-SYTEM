const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT) || 5500;
const publicDirectories = new Set(["css", "forms", "html", "js", "Logo"]);
const publicRootFiles = new Set(["Tricycle Image.png"]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

http
  .createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const requestedPath = decodeURIComponent(url.pathname);
    const relativePath = requestedPath === "/" ? "/html/index.html" : requestedPath;
    const isQrVendor = relativePath === "/js/vendor/qrcode.min.js";
    const filePath = isQrVendor
      ? path.resolve(root, "node_modules", "qrcodejs", "qrcode.min.js")
      : path.resolve(root, `.${relativePath}`);
    const projectRelativePath = path.relative(root, filePath);
    const [topLevelEntry] = projectRelativePath.split(path.sep);
    const isPublicPath = isQrVendor || publicDirectories.has(topLevelEntry) ||
      (projectRelativePath === topLevelEntry && publicRootFiles.has(topLevelEntry));

    if (
      !projectRelativePath ||
      projectRelativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(projectRelativePath) ||
      !isPublicPath
    ) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end(error.code === "ENOENT" ? "Not found" : "Unable to read file");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(content);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`TFRO-MIS is running at http://127.0.0.1:${port}/html/index.html`);
  });
