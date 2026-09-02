import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;

fs.mkdirSync('.pdf-previews', { recursive: true });
for (const filename of fs.readdirSync('.').filter((name) => name.endsWith('.pdf'))) {
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(filename)),
    disableWorker: true,
    standardFontDataUrl: `${pathToFileURL(path.resolve('node_modules/pdfjs-dist/standard_fonts')).href}/`,
  }).promise;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const stem = path.basename(filename, '.pdf').replaceAll(' ', '-');
    fs.writeFileSync(`.pdf-previews/${stem}-p${pageNumber}.png`, canvas.toBuffer('image/png'));
  }
}
