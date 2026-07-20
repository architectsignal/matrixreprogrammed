const fs = require('fs');
const path = require('path');

const root = process.cwd();
const auditPath = path.join(root, 'scripts', 'mission-acceptance-audit.js');
const publicManifestPath = path.join(root, '_site', 'downloads', 'report-manifests');
const reportPath = path.join(root, 'downloads', 'internal-report-manifest-cleanup.json');
const actions = [];

if (!fs.existsSync(auditPath)) throw new Error('scripts/mission-acceptance-audit.js is required');
let audit = fs.readFileSync(auditPath, 'utf8');
const loopAnchor = `for (const file of downloads) {
  const route = rel(file);`;
const patchedLoop = `for (const file of downloads) {
  const route = rel(file);
  if (route.startsWith('downloads/report-manifests/')) continue;`;
if (!audit.includes(patchedLoop)) {
  if (!audit.includes(loopAnchor)) throw new Error('Mission acceptance download loop anchor is missing');
  audit = audit.replace(loopAnchor, patchedLoop);
  fs.writeFileSync(auditPath, audit);
  actions.push('patched mission acceptance audit to exclude internal report manifests');
}

if (fs.existsSync(publicManifestPath)) {
  fs.rmSync(publicManifestPath, { recursive: true, force: true });
  actions.push('removed _site/downloads/report-manifests from the deployable bundle');
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  actions,
  publicPathRemoved: !fs.existsSync(publicManifestPath),
  sourceReportsPreserved: fs.existsSync(path.join(root, 'downloads', 'report-manifests')),
  classification: 'internal build evidence, never a public or member download',
  boundary: 'Customer-facing reports, PDFs, briefs, data exports and membership downloads remain untouched. Only internal build diagnostics are excluded from the Cloudflare asset bundle.'
}, null, 2)}\n`);
console.log(`Internal report-manifest cleanup ${actions.length ? actions.join('; ') : 'already current'}.`);
