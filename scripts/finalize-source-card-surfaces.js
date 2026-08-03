'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'source-card-surfaces-finalize.json');
const targets = ['epstein-files.html', 'evidence-vault.html', 'live-intel.html', 'black-file.html'];
const section = `<section id="source-card-system" class="section wrap"><h2>Source Cards</h2><p class="lead">Open the source card before sharing a strong claim: source, evidence class, what the record supports, what it does not prove, and next document route.</p><div class="cta-row"><a class="btn" href="source-cards.html">Open Source Cards</a><a class="btn alt machine-data-link internal-only" href="downloads/source-cards.json">Source Cards JSON</a></div></section>`;
const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  patched: [],
  verified: [],
  skippedOptional: []
};

function candidates(relative) {
  const values = [path.join(root, relative)];
  if (fs.existsSync(site)) {
    values.push(path.join(site, relative));
    if (relative.endsWith('.html')) values.push(path.join(site, relative.replace(/\.html$/i, '')));
  }
  return [...new Set(values)];
}

function patchFile(file, required) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (required) throw new Error(`Required source-card surface is missing: ${path.relative(root, file)}`);
    report.skippedOptional.push(path.relative(root, file).replace(/\\/g, '/'));
    return;
  }

  const before = fs.readFileSync(file, 'utf8');
  let after = before.replace(/<section\b(?=[^>]*\bid=["']source-card-system["'])[^>]*>[\s\S]*?<\/section>/gi, '');
  if (!/<\/main>/i.test(after)) {
    throw new Error(`Source-card surface has no </main> boundary: ${path.relative(root, file)}`);
  }
  after = after.replace(/<\/main>/i, `${section}</main>`);

  const sectionCount = (after.match(/id=["']source-card-system["']/gi) || []).length;
  if (sectionCount !== 1 || !after.includes('Open Source Cards')) {
    throw new Error(`Source-card surface could not be finalized: ${path.relative(root, file)}`);
  }

  if (after !== before) {
    fs.writeFileSync(file, after);
    report.patched.push(path.relative(root, file).replace(/\\/g, '/'));
  }
  report.verified.push(path.relative(root, file).replace(/\\/g, '/'));
}

for (const relative of targets) {
  const files = candidates(relative);
  files.forEach((file, index) => patchFile(file, index === 0));
}

for (const relative of ['source-cards.html', 'data/source-cards.json', 'downloads/source-cards.json', 'downloads/source-cards.md']) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Required source-card output is missing: ${relative}`);
  }
}

report.ok = true;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Source-card public surfaces finalized: ${report.verified.length} verified, ${report.patched.length} patched.`);
