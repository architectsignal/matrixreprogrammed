const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = ['index.html', '_site/index.html', '_site/index'];
const changed = [];
const missing = [];

for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before
    .replace(/FOLLOW THE FILES\./g, 'FOLLOW THE EVIDENCE.')
    .replace(/FOLLOW THE FILES/g, 'FOLLOW THE EVIDENCE');
  if (!after.includes('MAP THE STRUCTURE. READ THE SIGNALS.')) missing.push(relative);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(relative);
  }
}

const report = {
  ok: missing.length === 0,
  generatedAt: new Date().toISOString(),
  changed,
  missingCurrentMissionMarker: missing,
  boundary: 'The current homepage mission marker remains canonical. Retired FOLLOW THE FILES copy is removed from source and deploy output without duplicating the current mission heading.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-mission-normalization.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Homepage mission marker missing from: ${missing.join(', ')}`);
console.log(`Homepage mission copy normalized: ${changed.length} file(s) changed; current marker verified.`);
