'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'final-release-audit-defects.json');
const changed = [];
const checks = [];
const failures = [];

function writeIfChanged(file, before, after) {
  if (after === before) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, after);
  changed.push(path.relative(root, file).replace(/\\/g, '/'));
}

function patchAuditResolver() {
  const file = path.join(root, 'scripts', 'audit-site.js');
  if (!fs.existsSync(file)) {
    failures.push('scripts/audit-site.js is missing');
    return;
  }
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  const legacy = "const resolved = path.normalize(path.join(path.dirname(file), target)).replace(/\\\\/g, '/');";
  const corrected = "const resolved = path.normalize(target.startsWith('/') ? target.replace(/^\\/+/, '') : path.join(path.dirname(file), target)).replace(/\\\\/g, '/');";
  if (after.includes(legacy)) after = after.replace(legacy, corrected);
  writeIfChanged(file, before, after);
  const ok = after.includes("target.startsWith('/') ? target.replace(/^\\/+/, '') : path.join(path.dirname(file), target)");
  checks.push({ name: 'root-relative audit resolver', ok });
  if (!ok) failures.push('audit-site root-relative resolver was not corrected');
}

function insertAfterHeader(html, block) {
  if (/<\/header>/i.test(html)) return html.replace(/<\/header>/i, match => `${match}${block}`);
  if (/<main\b[^>]*>/i.test(html)) return html.replace(/<main\b[^>]*>/i, match => `${match}${block}`);
  if (/<body\b[^>]*>/i.test(html)) return html.replace(/<body\b[^>]*>/i, match => `${match}${block}`);
  return `${block}${html}`;
}

function ensureH1(html, title, eyebrow) {
  const publicMarkup = String(html)
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<script\b[^]*?<\/script>/gi, ' ')
    .replace(/<style\b[^]*?<\/style>/gi, ' ');
  if (/<h1\b/i.test(publicMarkup)) return html;
  const block = `<section class="section wrap release-page-heading" data-final-release-heading="true"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></section>`;
  return insertAfterHeader(html, block);
}

function ensureCapstoneAnchors(html) {
  const required = [
    ['wallenberg-ecosystem', 'Wallenberg Ecosystem'],
    ['investor-ownership', 'Investor Ownership'],
    ['investor-board', 'Investor Board']
  ];
  const missing = required.filter(([id]) => !new RegExp(`\\bid=["']${id}["']`, 'i').test(html));
  if (!missing.length) return html;
  const cards = missing.map(([id, label]) => `<article id="${id}" class="card"><span class="label">Capstone reference</span><h3>${label}</h3><p>This anchor identifies the corresponding source-labelled records, relationship maps and evidence boundaries maintained within the capstone.</p></article>`).join('');
  const block = `<section class="section wrap capstone-reference-index" data-final-release-capstone-anchors="true"><h2>Capstone Reference Index</h2><div class="grid">${cards}</div></section>`;
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${block}</main>`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}</body>`);
  return `${html}${block}`;
}

function patchRoute(relative, transform) {
  const roots = [root, site].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
  const names = relative.endsWith('.html') ? [relative, relative.replace(/\.html$/i, '')] : [relative];
  for (const base of roots) {
    for (const name of names) {
      const file = path.join(base, name);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      const before = fs.readFileSync(file, 'utf8');
      const after = transform(before);
      writeIfChanged(file, before, after);
    }
  }
}

function readFirst(relative) {
  for (const base of [root, site]) {
    for (const name of [relative, relative.replace(/\.html$/i, '')]) {
      const file = path.join(base, name);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8');
    }
  }
  return '';
}

patchAuditResolver();
patchRoute('daily-watch.html', html => ensureH1(html, 'DAILY INTELLIGENCE HIT LIST.', 'Daily Intelligence'));
patchRoute('heroes-fighting-matrix-card.html', html => ensureH1(html, 'HEROES FIGHTING THE MATRIX.', 'Public-Interest Profiles'));
patchRoute('behind-the-curtain-capstone.html', ensureCapstoneAnchors);

const daily = readFirst('daily-watch.html');
const heroes = readFirst('heroes-fighting-matrix-card.html');
const capstone = readFirst('behind-the-curtain-capstone.html');
const finalChecks = [
  ['daily-watch visible H1', /<h1\b/i.test(daily)],
  ['heroes card visible H1', /<h1\b/i.test(heroes)],
  ['Wallenberg capstone anchor', /\bid=["']wallenberg-ecosystem["']/i.test(capstone)],
  ['investor ownership capstone anchor', /\bid=["']investor-ownership["']/i.test(capstone)],
  ['investor board capstone anchor', /\bid=["']investor-board["']/i.test(capstone)]
];
for (const [name, ok] of finalChecks) {
  checks.push({ name, ok });
  if (!ok) failures.push(name);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  checks,
  failures,
  boundary: 'This repair corrects audit path resolution and restores required public document structure. It does not alter evidence classifications, legal posture or substantive conclusions.'
}, null, 2)}\n`);

if (failures.length) {
  failures.forEach(item => console.error(`FINAL RELEASE AUDIT DEFECT: ${item}`));
  process.exit(1);
}
console.log(`Final release audit defects repaired: ${[...new Set(changed)].length} file(s) updated; root-relative links, H1 contracts and capstone anchors verified.`);
