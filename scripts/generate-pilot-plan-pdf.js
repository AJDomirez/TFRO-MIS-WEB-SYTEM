const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'docs', 'TFRO-IMIS-Deployment-and-Pilot-Testing-Plan.md');
const output = path.join(root, '.codex-preview', 'TFRO-IMIS-Deployment-and-Pilot-Testing-Plan.html');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/  $/, '<br>');
}

function isDivider(line) {
  return /^\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const headers = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      html.push('<table><thead><tr>' + headers.map((cell) => `<th>${inline(cell)}</th>`).join('') + '</tr></thead><tbody>');
      for (const row of rows) {
        html.push('<tr>' + row.map((cell) => `<td>${inline(cell)}</td>`).join('') + '</tr>');
      }
      html.push('</tbody></table>');
      continue;
    }

    const unordered = /^\s*-\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const tag = unordered ? 'ul' : 'ol';
      const pattern = unordered ? /^\s*-\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      html.push(`<${tag}>`);
      while (i < lines.length) {
        const match = pattern.exec(lines[i]);
        if (!match) break;
        const checkbox = /^\[([ xX])\]\s+(.+)$/.exec(match[1]);
        if (checkbox) {
          html.push(`<li class="check"><span class="box">${checkbox[1].toLowerCase() === 'x' ? '✓' : ''}</span>${inline(checkbox[2])}</li>`);
        } else {
          html.push(`<li>${inline(match[1])}</li>`);
        }
        i += 1;
      }
      html.push(`</${tag}>`);
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*(-|\d+\.)\s+/.test(lines[i]) &&
      !(lines[i].trim().startsWith('|') && i + 1 < lines.length && isDivider(lines[i + 1]))
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }

  return html.join('\n');
}

const markdown = fs.readFileSync(input, 'utf8');
const body = markdownToHtml(markdown);
const generated = new Date().toLocaleDateString('en-PH', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila'
});

const document = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>TFRO-IMIS Deployment and Pilot Testing Plan</title>
<style>
  @page { size: A4; margin: 17mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1d2b24; font-family: Arial, Helvetica, sans-serif; font-size: 9.6pt; line-height: 1.42; }
  h1 { margin: 0 0 16px; padding: 18px 20px; color: #fff; background: #14532d; border-bottom: 6px solid #eab308; font-size: 22pt; line-height: 1.16; }
  h1::after { content: "Lucena City Tricycle Franchising and Regulatory Office"; display: block; margin-top: 8px; color: #fef08a; font-size: 9pt; font-weight: normal; letter-spacing: .03em; }
  h2 { margin: 20px 0 8px; padding: 6px 9px; color: #14532d; background: #f0fdf4; border-left: 5px solid #eab308; font-size: 14pt; break-after: avoid; }
  h3 { margin: 15px 0 6px; color: #166534; font-size: 11.5pt; break-after: avoid; }
  p { margin: 5px 0 9px; }
  ul, ol { margin: 4px 0 10px 22px; padding: 0; }
  li { margin: 3px 0; }
  li::marker { color: #15803d; font-weight: bold; }
  table { width: 100%; margin: 8px 0 14px; border-collapse: collapse; font-size: 8.4pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th { padding: 6px; color: #fff; background: #166534; border: 1px solid #14532d; text-align: left; vertical-align: top; }
  td { padding: 5px 6px; border: 1px solid #b9c9bf; text-align: left; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f7faf8; }
  strong { color: #173d28; }
  code { padding: 1px 3px; background: #edf2ef; border-radius: 2px; font-family: Consolas, monospace; font-size: 8.8pt; }
  .check { list-style: none; margin-left: -20px; }
  .box { display: inline-block; width: 13px; height: 13px; margin-right: 6px; border: 1px solid #47705a; text-align: center; line-height: 11px; font-size: 9px; }
  footer { position: fixed; right: 0; bottom: -11mm; left: 0; color: #66756c; font-size: 7.5pt; text-align: center; }
</style>
</head>
<body>
${body}
<footer>TFRO-IMIS Deployment and Two-Week Pilot Testing Plan · Generated ${generated}</footer>
</body>
</html>`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, document, 'utf8');
console.log(output);
