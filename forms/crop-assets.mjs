import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

fs.mkdirSync('public/assets', { recursive: true });
async function crop(source, target, x, y, width, height) {
  const image = await loadImage(source);
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
  fs.writeFileSync(target, canvas.toBuffer('image/png'));
}
await crop('.pdf-previews/TFRO-002-Petition-for-Dropping-p1.png', 'public/assets/tfro-header.png', 0, 0, 918, 128);
await crop('.pdf-previews/PMBL-TFRO-003-Certification-p1.png', 'public/assets/pmbl-header.png', 0, 0, 1263, 184);
await crop('.pdf-previews/TFRO-004-Checklist-for-Renewal-p1.png', 'public/assets/tfro-header-landscape.png', 18, 0, 612, 101);
