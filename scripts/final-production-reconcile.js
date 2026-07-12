const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'final-production-reconcile.json');
const report = { ok: true, generatedAt: new Date().toISOString(), commands: [], copied: [], checks: [] };
function persistReport() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
process.on('uncaughtException', error => {
  report.ok = false;
  report.failedAt = new Date().toISOString();
  report.error = String(error && error.stack ? error.stack : error);
  persistReport();
  console.error(report.error);
  process.exit(1);
});
process.on('unhandledRejection', error => { throw error; });
function run(script, optional = false) {
  const file = path.join(root, script);
  if (!fs.existsSync(file)) {
    if (optional) return;
    throw new Error(`Missing reconciliation script: ${script}`);
  }
  const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', env: process.env });
  report.commands.push({ script, status: result.status, stdout: String(result.stdout || '').slice(-3000), stderr: String(result.stderr || '').slice(-3000) });
  if (result.status !== 0) throw new Error(`${script} failed: ${result.stderr || result.stdout}`);
}
function copy(rel) {
  const source = path.join(root, rel);
  if (!fs.existsSync(source)) throw new Error(`Critical release file missing: ${rel}`);
  const destination = path.join(site, rel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  report.copied.push(rel);
  if (rel.endsWith('.html')) {
    const extensionless = path.join(site, rel.replace(/\.html$/i, ''));
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  }
}
function duplicateIds(html) {
  const ids = [...String(html).matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}
function requireMarker(rel, marker) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const ok = text.includes(marker);
  report.checks.push({ rel, marker, ok });
  if (!ok) throw new Error(`${rel} missing required marker: ${marker}`);
  const duplicates = duplicateIds(text);
  if (duplicates.length) throw new Error(`${rel} duplicate IDs: ${duplicates.join(', ')}`);
}
function rejectMarker(rel, marker) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const ok = !text.includes(marker);
  report.checks.push({ rel, rejectedMarker: marker, ok });
  if (!ok) throw new Error(`${rel} contains forbidden legacy marker: ${marker}`);
}

if (!fs.existsSync(site)) throw new Error('_site does not exist; run the normal build first.');
run('scripts/patch-main-navigation-safety-links.js');
run('scripts/patch-membership-tiers.js');
run('scripts/patch-homepage-mask-intro.js');
run('scripts/homepage-mask-intro-test.js');
run('scripts/build-live-intel-machine.js');
run('scripts/build-mission-intelligence-10.js');
run('scripts/build-investigation-pages.js');
run('scripts/build-outcome-briefings.js');
run('scripts/build-daily-brain-brief.js');
run('scripts/patch-conclusion-integrity-cards.js');
run('scripts/repair-public-site-errors.js', true);
run('scripts/enforce-production-cache-policy.js');

const critical = [
  'index.html', 'homepage-mask-intro.css', 'homepage-mask-intro.js',
  'assets/intro-eye.svg', 'assets/intro-mask.svg',
  'start-here.html', 'membership.html', 'live-intel.html', 'daily-power-conclusions.html',
  'daily-investigation-conclusions.html', 'weekly-investigation-report.html',
  'daily-brain-brief.html', 'outcome-briefings.html', 'security-privacy.html',
  'dark-web-safety.html', 'geographic-power-atlas.html', 'data-lab.html',
  'evidence-archive.html', '_headers', 'data/membership-tiers.json', 'data/live-intel.json',
  'data/daily-power-conclusions.json', 'data/daily-investigation-conclusions.json',
  'data/weekly-investigation-conclusions.json', 'data/daily-brain-brief.json',
  'data/outcome-briefings.json', 'data/production-freshness-policy.json'
];
critical.forEach(copy);
requireMarker('index.html', 'Security Tools');
requireMarker('index.html', 'Dark Web Safety');
requireMarker('index.html', 'data-homepage-mask-intro');
requireMarker('index.html', 'assets/intro-eye.svg');
requireMarker('index.html', 'assets/intro-mask.svg');
requireMarker('index.html', 'homepage-intro__burn');
requireMarker('index.html', 'homepage-mask-intro.js');
requireMarker('start-here.html', 'Open Security Tools');
requireMarker('start-here.html', 'Open Dark Web Safety');
requireMarker('membership.html', '<!-- membership-tiers:start -->');
requireMarker('membership.html', '€3');
requireMarker('membership.html', '€6');
requireMarker('membership.html', '€9');
requireMarker('membership.html', 'Coming soon — no payment taken');
rejectMarker('membership.html', '€19/month');
rejectMarker('membership.html', '€49/month');
requireMarker('homepage-mask-intro.js', 'matrix-homepage-intro-seen-v2');
requireMarker('homepage-mask-intro.js', 'eye: 3000');
requireMarker('homepage-mask-intro.js', 'burn: 1100');
requireMarker('homepage-mask-intro.js', 'mask: 3000');
requireMarker('homepage-mask-intro.css', 'intro-eye-burn');
requireMarker('homepage-mask-intro.css', 'intro-fire-ring');
requireMarker('homepage-mask-intro.css', 'intro-mask-dissolve');
requireMarker('assets/intro-eye.svg', 'Eye of Providence seal');
requireMarker('assets/intro-mask.svg', 'Anonymous revolutionary mask');
requireMarker('daily-power-conclusions.html', '<!-- conclusion-integrity:start -->');
requireMarker('daily-investigation-conclusions.html', '<!-- conclusion-integrity:start -->');
requireMarker('daily-brain-brief.html', '<!-- conclusion-integrity:start -->');
requireMarker('outcome-briefings.html', '<!-- conclusion-integrity:start -->');
requireMarker('_headers', '/deploy-manifest.json');
requireMarker('_headers', 'Cache-Control: no-store');
run('scripts/build-deploy-manifest.js');
persistReport();
console.log(`Final production reconciliation passed: ${report.copied.length} critical files copied after legacy generators.`);
