const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const targets = ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html'];
const hiddenTargets = new Set(['index.html', 'news.html']);
const report = { ok: true, generatedAt: new Date().toISOString(), repaired: [], checks: [] };
const reportPath = path.join(root, 'downloads', 'final-evidence-badge-dedupe.json');

function persist() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
function fail(message) {
  report.ok = false;
  report.error = message;
  persist();
  throw new Error(message);
}
function countId(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(html).match(new RegExp(`\\bid=["']${escaped}["']`, 'gi')) || []).length;
}
function duplicateIds(html) {
  const ids = [...String(html).matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}
function copy(rel) {
  const source = path.join(root, rel);
  if (!fs.existsSync(source)) fail(`Missing evidence-badge source route: ${rel}`);
  const destination = path.join(site, rel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  const extensionless = path.join(site, rel.replace(/\.html$/i, ''));
  if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  report.repaired.push(rel);
}

const canonical = spawnSync(process.execPath, [path.join(root, 'scripts', 'ensure-evidence-badge-routes.js')], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 1024 * 1024 * 10
});
if (canonical.stdout) process.stdout.write(canonical.stdout);
if (canonical.stderr) process.stderr.write(canonical.stderr);
if (canonical.status !== 0) fail(`Canonical evidence badge repair failed: ${canonical.stderr || canonical.stdout}`);
if (!fs.existsSync(site)) fail('_site missing during final evidence badge dedupe');

for (const rel of targets) {
  copy(rel);
  for (const [prefix, file] of [['source', path.join(root, rel)], ['output', path.join(site, rel)], ['extensionless', path.join(site, rel.replace(/\.html$/i, ''))]]) {
    const html = fs.readFileSync(file, 'utf8');
    const routeCount = countId(html, 'evidence-badge-system-route');
    const contractCount = countId(html, 'evidence-badge-system-route-contract');
    const duplicates = duplicateIds(html);
    const expectedRoute = hiddenTargets.has(rel) ? 0 : 1;
    const expectedContract = hiddenTargets.has(rel) ? 1 : 0;
    const ok = routeCount === expectedRoute && contractCount === expectedContract && !duplicates.includes('evidence-badge-system-route');
    report.checks.push({ rel: `${prefix}:${rel}`, routeCount, contractCount, expectedRoute, expectedContract, duplicateIds: duplicates, ok });
    if (!ok) fail(`${prefix}:${rel} evidence badge IDs are not canonical`);
  }
}

persist();
console.log(`Final evidence badge duplicate repair passed across ${targets.length} source and Cloudflare routes.`);
