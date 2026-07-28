'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const builderPath = path.join(root, 'scripts', 'build-predators-in-power.js');
const reportPath = path.join(root, 'downloads', 'predators-builder-hit-list-patch.json');
const marker = '/* exposure-integrity-canonical-predators-link */';

if (!fs.existsSync(builderPath)) throw new Error('Missing scripts/build-predators-in-power.js');
let source = fs.readFileSync(builderPath, 'utf8');
let changed = false;

if (!source.includes(marker)) {
  const target = 'fs.writeFileSync(pagePath, page);';
  if (!source.includes(target)) throw new Error('Canonical Predators builder write target was not found');
  const replacement = `${marker}\nconst exposureHitListBlock = '<!-- exposure-predators-hit-list:start --><section class="section wrap"><article class="card redline"><span class="label">Connected Exposure Integrity System</span><h2>From safeguarding record to the wider power map</h2><p>Open the cinematic Hit List to see what is documented, what is alleged, what remains unproven, which power mechanism matters, which records are missing and where the investigation goes next.</p><div class="cta-row"><a class="btn" href="/hit-list.html">Open the Hit List</a><a class="btn alt" href="/timers.html">Follow Risk Timers</a><a class="btn alt" href="/source-document-vault.html">Verify Sources</a><a class="btn alt" href="/trust-corrections.html">Corrections and Right of Reply</a></div></article></section><!-- exposure-predators-hit-list:end -->';\nconst exposureBoundaryAnchor = '<section class="section wrap"><div class="pip-boundary-box">';\nconst exposureLinkedPage = page.includes('href="/hit-list.html"')\n  ? page\n  : page.includes(exposureBoundaryAnchor)\n    ? page.replace(exposureBoundaryAnchor, exposureHitListBlock + exposureBoundaryAnchor)\n    : page.replace('</main>', exposureHitListBlock + '</main>');\nif (!exposureLinkedPage.includes('href="/hit-list.html"') || !exposureLinkedPage.includes('Connected Exposure Integrity System')) {\n  throw new Error('Canonical Predators generator failed to embed the Exposure Integrity Hit List route');\n}\nfs.writeFileSync(pagePath, exposureLinkedPage);`;
  source = source.replace(target, replacement);
  fs.writeFileSync(builderPath, source);
  changed = true;
}

const finalSource = fs.readFileSync(builderPath, 'utf8');
const checks = {
  marker: finalSource.includes(marker),
  hitListRoute: finalSource.includes('href="/hit-list.html"'),
  timerRoute: finalSource.includes('href="/timers.html"'),
  sourceRoute: finalSource.includes('href="/source-document-vault.html"'),
  correctionRoute: finalSource.includes('href="/trust-corrections.html"'),
  failClosed: finalSource.includes('Canonical Predators generator failed to embed')
};
const report = {
  ok: Object.values(checks).every(Boolean),
  generatedAt: new Date().toISOString(),
  changed,
  builder: 'scripts/build-predators-in-power.js',
  checks,
  boundary: 'The canonical Predators in Power generator must emit the Exposure Integrity navigation block itself so late reconciliation cannot remove the link.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Predators builder Hit List patch failed: ${JSON.stringify(checks)}`);
console.log(`Canonical Predators builder Hit List patch ${changed ? 'applied' : 'already current'}.`);
