const fs = require('fs');
const path = require('path');

const root = process.cwd();
const generator = path.join(root, 'scripts', 'build-deploy-status.js');
const report = path.join(root, 'downloads', 'deploy-status-current-mission-patch.json');
if (!fs.existsSync(generator)) throw new Error('scripts/build-deploy-status.js is missing');

const before = fs.readFileSync(generator, 'utf8');
const after = before.replace(/FOLLOW THE FILES\./g, 'MAP THE STRUCTURE. READ THE SIGNALS.');
if (!after.includes("marker: 'MAP THE STRUCTURE. READ THE SIGNALS.'")) throw new Error('Deploy status homepage module marker was not upgraded');
if (!after.includes("homepageExpectedMarker: 'MAP THE STRUCTURE. READ THE SIGNALS.'")) throw new Error('Deploy status live proof marker was not upgraded');
if (after.includes('FOLLOW THE FILES.')) throw new Error('Retired deploy status marker remains');
if (after !== before) fs.writeFileSync(generator, after);
for (const base of [root, path.join(root, '_site')]) {
  const html = path.join(base, 'deploy-status.html');
  if (fs.existsSync(html)) {
    const current = fs.readFileSync(html, 'utf8');
    const next = current.replace(/FOLLOW THE FILES\./g, 'MAP THE STRUCTURE. READ THE SIGNALS.');
    if (next !== current) fs.writeFileSync(html, next);
  }
  for (const relative of ['deploy-status.json', 'downloads/deploy-status.json']) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const current = fs.readFileSync(file, 'utf8');
    const next = current.replace(/FOLLOW THE FILES\./g, 'MAP THE STRUCTURE. READ THE SIGNALS.');
    if (next !== current) fs.writeFileSync(file, next);
  }
}
fs.mkdirSync(path.dirname(report), { recursive: true });
fs.writeFileSync(report, `${JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), changed: after !== before, missionMarker: 'MAP THE STRUCTURE. READ THE SIGNALS.', retiredMarkerRemoved: true }, null, 2)}\n`);
console.log(`Deploy status current-mission patch ${after !== before ? 'installed' : 'already current'}.`);
