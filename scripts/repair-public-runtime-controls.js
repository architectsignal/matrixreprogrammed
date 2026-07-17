const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputOnly = process.argv.includes('--output');
const bases = outputOnly
  ? (fs.existsSync(path.join(root, '_site')) ? [path.join(root, '_site')] : [])
  : [root, ...(fs.existsSync(path.join(root, '_site')) ? [path.join(root, '_site')] : [])];
const changed = [];
const failures = [];

function candidateFiles(base, names) {
  const files = [];
  for (const name of names) {
    const full = path.join(base, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) files.push(full);
  }
  return files;
}
function replaceAnchorHref(html, id, fallback) {
  const rx = new RegExp(`<a\\b([^>]*\\bid=["']${id}["'][^>]*)>`, 'gi');
  return html.replace(rx, tag => {
    if (/\bhref\s*=\s*(["'])(?!\s*(?:#)?\1)[^"']+\1/i.test(tag)) return tag;
    if (/\bhref\s*=/i.test(tag)) return tag.replace(/\bhref\s*=\s*(["'])\s*#?\s*\1/i, `href="${fallback}"`);
    return tag.replace(/>$/, ` href="${fallback}">`);
  });
}
function patchFile(file, transform) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}
function patchLiveIntel(html) {
  return html.replace(/<a\b([^>]*\bclass=["'][^"']*\bbtn\b[^"']*["'][^>]*)\bhref\s*=\s*(["'])\s*#\s*\2([^>]*)>([\s\S]*?)<\/a>/gi, (full, left, quote, right, body) => {
    const label = String(body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const replacementLabel = /open source/i.test(label) ? 'Evidence Route' : (label || 'Evidence Route');
    return `<a${left}href=${quote}evidence-vault.html${quote}${right}>${replacementLabel}</a>`;
  });
}

for (const base of bases) {
  for (const file of candidateFiles(base, ['live-intel.html', 'live-intel'])) patchFile(file, patchLiveIntel);

  for (const file of candidateFiles(base, ['epstein-capital-class-map.html', 'epstein-capital-class-map'])) {
    patchFile(file, html => {
      html = replaceAnchorHref(html, 'source-page', 'https://epstein-data.com/EFTA01104262');
      html = replaceAnchorHref(html, 'source-pdf', 'https://epstein-data.com/pdf/EFTA01104262.pdf');
      return html;
    });
  }
  for (const file of candidateFiles(base, ['evidence-archive.html', 'evidence-archive'])) {
    patchFile(file, html => replaceAnchorHref(html, 'archive-live', 'evidence-vault.html'));
  }
  for (const file of candidateFiles(base, ['evidence-reader.html', 'evidence-reader'])) {
    patchFile(file, html => replaceAnchorHref(html, 'reader-original', 'evidence-vault.html'));
  }
}

const checks = [
  { names: ['live-intel.html', 'live-intel'], forbidden: /<a\b[^>]*\bclass=["'][^"']*\bbtn\b[^"']*["'][^>]*\bhref\s*=\s*(["'])\s*#\s*\1/i, label: 'Live Intel # control' },
  { names: ['epstein-capital-class-map.html', 'epstein-capital-class-map'], required: ['id="source-page"', 'href="https://epstein-data.com/EFTA01104262"', 'id="source-pdf"', 'href="https://epstein-data.com/pdf/EFTA01104262.pdf"'], label: 'capital class source fallbacks' },
  { names: ['evidence-archive.html', 'evidence-archive'], required: ['id="archive-live"', 'href="evidence-vault.html"'], label: 'archive source fallback' },
  { names: ['evidence-reader.html', 'evidence-reader'], required: ['id="reader-original"', 'href="evidence-vault.html"'], label: 'reader source fallback' }
];
for (const base of bases) {
  for (const check of checks) {
    for (const file of candidateFiles(base, check.names)) {
      const html = fs.readFileSync(file, 'utf8');
      if (check.forbidden && check.forbidden.test(html)) failures.push(`${path.relative(root, file)} retains ${check.label}`);
      for (const marker of check.required || []) if (!html.includes(marker)) failures.push(`${path.relative(root, file)} missing ${check.label}: ${marker}`);
    }
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: outputOnly ? 'cloudflare-output' : 'source-and-output',
  changed: [...new Set(changed)],
  failures,
  boundary: 'Dynamic controls keep safe public fallback destinations. Client-side data may replace those destinations after a verified record is selected.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', outputOnly ? 'public-runtime-controls-output.json' : 'public-runtime-controls.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PUBLIC RUNTIME CONTROL FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Public runtime controls repaired (${report.mode}): ${report.changed.length} file(s) changed.`);
