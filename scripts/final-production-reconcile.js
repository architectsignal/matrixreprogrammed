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
  if (rel.endsWith('.html')) {
    const duplicates = duplicateIds(text);
    if (duplicates.length) throw new Error(`${rel} duplicate IDs: ${duplicates.join(', ')}`);
  }
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
run('scripts/build-evidence-badge-system.js');
run('scripts/build-premier-resource-upgrade.js');
run('scripts/ensure-evidence-badge-routes.js');
run('scripts/enforce-production-cache-policy.js');
run('scripts/phase7-paypal-sandbox-rehearsal-test.mjs');

// These are the final owners of the search and conclusion surfaces. Run them
// after every legacy generator and immediately before the release manifest and
// copy, so no later build stage can restore Search V2 or remove integrity cards.
run('scripts/repair-search-system.js');
run('scripts/build-search-v3-index.js');
run('scripts/build-search-v3-runtime.js');
run('scripts/patch-conclusion-integrity-cards.js');

run('scripts/build-deploy-manifest.js');
run('scripts/build-production-health.js');

const critical = [
  'index.html', 'homepage-mask-intro.css', 'homepage-mask-intro.js',
  'assets/intro-eye.svg', 'assets/intro-mask.svg',
  'start-here.html', 'membership.html', 'paypal-membership.js',
  'member-dashboard.html', 'member-dashboard-app.js',
  'billing-dashboard.html', 'billing-dashboard.js',
  'admin-payment-dashboard.html', 'admin-payment-dashboard.js',
  'admin-paypal-rehearsal.html', 'admin-paypal-rehearsal.js',
  'live-intel.html', 'daily-power-conclusions.html',
  'daily-investigation-conclusions.html', 'weekly-investigation-report.html',
  'daily-brain-brief.html', 'outcome-briefings.html', 'security-privacy.html',
  'dark-web-safety.html', 'geographic-power-atlas.html', 'data-lab.html',
  'evidence-archive.html', 'timers.html', 'ai-speculative-conclusions.html',
  'search.html', 'search.js', 'search-index.json',
  'data/search-facets.json', '_headers', 'data/membership-tiers.json',
  'data/live-intel.json', 'data/daily-power-conclusions.json',
  'data/daily-investigation-conclusions.json', 'data/weekly-investigation-conclusions.json',
  'data/daily-brain-brief.json', 'data/outcome-briefings.json',
  'data/global-risk-clocks.json', 'data/clock-wall.json',
  'data/production-freshness-policy.json', 'deploy-manifest.json',
  'deploy-health.html', 'deploy-health.json', 'downloads/deploy-health.json'
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
requireMarker('membership.html', 'Free Member');
requireMarker('membership.html', '€3');
requireMarker('membership.html', '€6');
requireMarker('membership.html', '€9');
requireMarker('membership.html', 'paypal-membership.js');
requireMarker('membership.html', 'paypal-membership-status');
requireMarker('membership.html', 'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.');
rejectMarker('membership.html', 'Coming soon — no payment taken');
rejectMarker('membership.html', '€19/month');
rejectMarker('membership.html', '€49/month');
requireMarker('paypal-membership.js', '/api/paypal/checkout-intent');
requireMarker('paypal-membership.js', '/api/paypal/subscription/confirm');
requireMarker('billing-dashboard.html', 'billing-dashboard.js');
requireMarker('admin-payment-dashboard.html', 'admin-payment-dashboard.js');
requireMarker('admin-payment-dashboard.js', 'admin-paypal-rehearsal.html');
requireMarker('admin-paypal-rehearsal.html', 'PAYPAL SANDBOX REHEARSAL.');
requireMarker('admin-paypal-rehearsal.html', 'maximum 45-minute window');
requireMarker('admin-paypal-rehearsal.html', 'admin-paypal-rehearsal.js');
requireMarker('admin-paypal-rehearsal.js', '/api/paypal/admin/rehearsal/start');
requireMarker('admin-paypal-rehearsal.js', '/api/paypal/admin/rehearsal/complete');
requireMarker('admin-paypal-rehearsal.js', '/api/paypal/admin/rehearsal/abort');
requireMarker('homepage-mask-intro.js', 'matrix-homepage-intro-seen-v2');
requireMarker('homepage-mask-intro.js', 'eye: 3000');
requireMarker('homepage-mask-intro.js', 'burn: 1100');
requireMarker('homepage-mask-intro.js', 'mask: 3000');
requireMarker('homepage-mask-intro.css', 'intro-eye-burn');
requireMarker('homepage-mask-intro.css', 'intro-fire-ring');
requireMarker('homepage-mask-intro.css', 'intro-mask-dissolve');
requireMarker('assets/intro-eye.svg', 'Eye of Providence seal');
requireMarker('assets/intro-mask.svg', 'Anonymous revolutionary mask');
requireMarker('timers.html', 'MISSION TIMERS.');
requireMarker('timers.html', 'Classified claims, not confirmed events');
requireMarker('ai-speculative-conclusions.html', 'ai-speculative-conclusion-integrity');
requireMarker('data/global-risk-clocks.json', '"speculativeReaderClockCount": 49');
requireMarker('data/clock-wall.json', '"speculativeClockCount": 49');
requireMarker('search.html', 'SEARCH THE MACHINE');
requireMarker('search.html', 'id="archive-search"');
requireMarker('search.html', 'id="search-v3-filters"');
requireMarker('search.js', 'SEARCH V3');
requireMarker('search.js', "cache:'no-store'");
requireMarker('search.js', 'HTML returned instead of JSON');
requireMarker('daily-power-conclusions.html', '<!-- conclusion-integrity:start -->');
requireMarker('daily-investigation-conclusions.html', '<!-- conclusion-integrity:start -->');
requireMarker('daily-brain-brief.html', '<!-- conclusion-integrity:start -->');
requireMarker('outcome-briefings.html', '<!-- conclusion-integrity:start -->');
requireMarker('daily-drop.html', 'id="evidence-badge-system-route"');
requireMarker('network-search.html', 'id="evidence-badge-system-route"');
requireMarker('_headers', '/deploy-manifest.json');
requireMarker('_headers', '/deploy-health.json');
requireMarker('_headers', 'Cache-Control: no-store');
requireMarker('deploy-health.html', 'D1 AUTHORITATIVE / FAIL CLOSED');
requireMarker('deploy-health.html', 'Payments: SANDBOX READY / CHECKOUT DISABLED');
requireMarker('deploy-health.json', 'src/worker-production.js');
requireMarker('deploy-health.json', '"paymentStatus": "sandbox-ready-disabled"');

persistReport();
console.log(`Final production reconciliation passed: ${report.copied.length} critical files copied after legacy generators.`);
