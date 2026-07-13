const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const hard = [];
const soft = [];
function source(rel) { return path.join(root, rel); }
function built(rel) { return path.join(site, rel); }
function exists(rel) { return fs.existsSync(source(rel)); }
function siteExists(rel) { return fs.existsSync(built(rel)); }
function read(rel) { return fs.readFileSync(source(rel), 'utf8'); }
function siteRead(rel) { return fs.readFileSync(built(rel), 'utf8'); }
function parse(file, fromSite = false) {
  try { return JSON.parse(fromSite ? siteRead(file) : read(file)); }
  catch (error) { hard.push(`${fromSite ? '_site/' : ''}${file} invalid JSON: ${error.message}`); return null; }
}
function need(rel) { if (!exists(rel)) hard.push(`missing source file: ${rel}`); }
function needSite(rel) { if (!siteExists(rel)) hard.push(`missing built asset: _site/${rel}`); }
function requireText(rel, text, fromSite = false) {
  const available = fromSite ? siteExists(rel) : exists(rel);
  if (!available || !(fromSite ? siteRead(rel) : read(rel)).includes(text)) hard.push(`${fromSite ? '_site/' : ''}${rel} missing ${text}`);
}
function forbidText(rel, text, fromSite = false) {
  const available = fromSite ? siteExists(rel) : exists(rel);
  if (available && (fromSite ? siteRead(rel) : read(rel)).includes(text)) hard.push(`${fromSite ? '_site/' : ''}${rel} contains forbidden ${text}`);
}
function duplicateIds(html) {
  const ids = [...String(html).matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

const requiredSource = [
  'index.html', 'start-here.html', 'membership.html', 'paypal-membership.js',
  'member-dashboard.html', 'member-dashboard-app.js', 'billing-dashboard.html', 'billing-dashboard.js',
  'admin-payment-dashboard.html', 'admin-payment-dashboard.js',
  'live-intel.html', 'daily-power-conclusions.html', 'daily-investigation-conclusions.html',
  'daily-brain-brief.html', 'outcome-briefings.html', 'security-privacy.html', 'dark-web-safety.html',
  'geographic-power-atlas.html', 'data-lab.html', 'evidence-archive.html', 'search.html',
  'deploy-manifest.json', 'deploy-health.html', 'deploy-health.json',
  'data/production-freshness-policy.json', 'data/live-intel.json', 'data/daily-power-conclusions.json',
  'data/daily-investigation-conclusions.json', 'data/daily-brain-brief.json', 'data/outcome-briefings.json',
  'src/worker.js', 'src/worker-forum-persistence.js', 'src/worker-member-experience.js',
  'src/worker-paypal-subscriptions.js', 'src/worker-production.js',
  'migrations/0004_forum_persistence.sql', 'migrations/phase5_member_experience.sql',
  'migrations/phase6_paypal_subscriptions.sql', 'scripts/forum-persistence-d1-test.js',
  'scripts/build-production-health.js', 'scripts/final-production-reconcile.js',
  'scripts/repair-generated-site-artifacts.js', 'scripts/cloudflare-focused-pressure-wrapper.js',
  '.github/workflows/deploy.yml', '.github/workflows/deploy-production.yml',
  'wrangler.toml', 'wrangler.jsonc'
];
const requiredBuilt = [
  'index.html', 'index', 'start-here.html', 'start-here', 'membership.html', 'membership',
  'paypal-membership.js', 'member-dashboard.html', 'member-dashboard-app.js',
  'billing-dashboard.html', 'billing-dashboard.js', 'admin-payment-dashboard.html', 'admin-payment-dashboard.js',
  'live-intel.html', 'live-intel', 'daily-power-conclusions.html', 'daily-power-conclusions',
  'daily-investigation-conclusions.html', 'daily-investigation-conclusions',
  'daily-brain-brief.html', 'daily-brain-brief', 'outcome-briefings.html', 'outcome-briefings',
  'security-privacy.html', 'security-privacy', 'dark-web-safety.html', 'dark-web-safety',
  'geographic-power-atlas.html', 'geographic-power-atlas', 'data-lab.html', 'data-lab',
  'evidence-archive.html', 'evidence-archive', 'search.html', 'search',
  'deploy-manifest.json', 'deploy-manifest', 'deploy-health.html', 'deploy-health', 'deploy-health.json',
  'downloads/deploy-health.json', 'data/live-intel.json', 'data/daily-power-conclusions.json',
  'data/daily-investigation-conclusions.json', 'data/daily-brain-brief.json', 'data/outcome-briefings.json'
];
requiredSource.forEach(need);
requiredBuilt.forEach(needSite);

for (const rel of ['index.html', 'start-here.html', 'membership.html', 'member-dashboard.html', 'billing-dashboard.html', 'admin-payment-dashboard.html', 'live-intel.html', 'daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html', 'deploy-health.html']) {
  if (exists(rel)) {
    const duplicates = duplicateIds(read(rel));
    if (duplicates.length) hard.push(`${rel} duplicate IDs: ${duplicates.join(', ')}`);
  }
  if (siteExists(rel)) {
    const duplicates = duplicateIds(siteRead(rel));
    if (duplicates.length) hard.push(`_site/${rel} duplicate IDs: ${duplicates.join(', ')}`);
  }
}

requireText('index.html', 'Security Tools');
requireText('index.html', 'Dark Web Safety');
for (const marker of ['Free Member', '€0', '€3', '€6', '€9', 'paypal-membership.js', 'paypal-membership-status', 'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.']) {
  requireText('membership.html', marker);
  requireText('membership.html', marker, true);
}
forbidText('membership.html', 'Coming soon — no payment taken');
forbidText('membership.html', 'Coming soon — no payment taken', true);
for (const marker of ['/api/paypal/checkout-intent', '/api/paypal/subscription/confirm']) {
  requireText('paypal-membership.js', marker);
  requireText('paypal-membership.js', marker, true);
}
requireText('billing-dashboard.html', 'billing-dashboard.js');
requireText('billing-dashboard.html', 'billing-dashboard.js', true);
requireText('admin-payment-dashboard.html', 'admin-payment-dashboard.js');
requireText('admin-payment-dashboard.html', 'admin-payment-dashboard.js', true);
requireText('deploy-health.html', 'D1 AUTHORITATIVE / FAIL CLOSED');
requireText('deploy-health.html', 'Payments: SANDBOX READY / CHECKOUT DISABLED');
requireText('deploy-health.html', 'D1 AUTHORITATIVE / FAIL CLOSED', true);
for (const rel of ['daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html']) {
  requireText(rel, '<!-- conclusion-integrity:start -->');
  requireText(rel, '<!-- conclusion-integrity:start -->', true);
}

const expectedSha = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';
const manifest = exists('deploy-manifest.json') ? parse('deploy-manifest.json') : null;
const builtManifest = siteExists('deploy-manifest.json') ? parse('deploy-manifest.json', true) : null;
const health = exists('deploy-health.json') ? parse('deploy-health.json') : null;
const builtHealth = siteExists('deploy-health.json') ? parse('deploy-health.json', true) : null;
if (manifest && expectedSha && manifest.commitSha !== expectedSha) hard.push(`source deploy manifest SHA ${manifest.commitSha} does not match expected ${expectedSha}`);
if (builtManifest && expectedSha && builtManifest.commitSha !== expectedSha) hard.push(`built deploy manifest SHA ${builtManifest.commitSha} does not match expected ${expectedSha}`);
if (manifest && builtManifest && manifest.commitSha !== builtManifest.commitSha) hard.push('source and built deploy manifests disagree');
for (const [label, item] of [['source', health], ['built', builtHealth]]) {
  if (!item) continue;
  if (!item.ok) hard.push(`${label} production health reports not ready`);
  if (expectedSha && item.buildSha !== expectedSha) hard.push(`${label} production health SHA ${item.buildSha} does not match expected ${expectedSha}`);
  if (item.manifestSha !== expectedSha) hard.push(`${label} production health manifest SHA ${item.manifestSha} does not match expected ${expectedSha}`);
  if (item.workerScript !== 'src/worker-production.js') hard.push(`${label} production health does not name strict Worker`);
  if (item.paymentStatus !== 'sandbox-ready-disabled') hard.push(`${label} production health does not report sandbox-ready disabled payments`);
  if (item.checkoutDefault !== 'disabled') hard.push(`${label} production health does not keep checkout disabled by default`);
  if (!String(item.paymentMessage || '').includes('checkout remains disabled')) hard.push(`${label} production health does not describe the activation gates`);
}

const freshnessReport = exists('downloads/production-freshness-guard.json') ? parse('downloads/production-freshness-guard.json') : null;
if (!freshnessReport) hard.push('production freshness report missing');
else if (!freshnessReport.ok) hard.push(`production freshness guard reports ${freshnessReport.hardIssues?.length || 1} issue(s)`);

for (const text of ['env.ASSETS.fetch', '/api/membership/signup', '/api/paypal/webhook', '/api/tools/jobs']) {
  if (!read('src/worker.js').includes(text)) hard.push(`src/worker.js missing delegated route marker ${text}`);
}
for (const text of [
  "import forumWorker from './worker-forum-persistence.js'",
  "import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js'",
  'members-db-binding-unavailable',
  'non-authoritative-forum-response-blocked',
  'non-authoritative-paypal-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'",
  "origin !== 'cloudflare-worker-paypal-subscriptions'",
  'isPayPalRoute(path)'
]) {
  if (!read('src/worker-production.js').includes(text)) hard.push(`strict production Worker missing ${text}`);
}
for (const text of [
  "import legacyWorker from './worker.js'",
  '/forum-health', '/forum-feed-main', '/submit-main-post',
  'CREATE TABLE IF NOT EXISTS forum_posts', 'Cloudflare D1 MEMBERS_DB.forum_posts',
  'kv_forum_migration_v1', 'return legacyWorker.fetch(request, env, ctx)'
]) {
  if (!read('src/worker-forum-persistence.js').includes(text)) hard.push(`forum persistence wrapper missing ${text}`);
}
for (const text of ['cloudflare-worker-paypal-subscriptions', '/api/paypal/webhook', 'PAYPAL_SANDBOX_ENABLED', 'PAYPAL_PRODUCTION_ENABLED', 'paypal_runtime_settings']) {
  if (!read('src/worker-paypal-subscriptions.js').includes(text)) hard.push(`PayPal Worker missing ${text}`);
}
for (const text of ['CREATE TABLE IF NOT EXISTS forum_posts', 'CREATE TABLE IF NOT EXISTS forum_reports', 'idx_forum_posts_board_created']) {
  if (!read('migrations/0004_forum_persistence.sql').includes(text)) hard.push(`forum persistence migration missing ${text}`);
}
for (const text of ['paypal_runtime_settings', 'paypal_products', 'paypal_plans', 'paypal_subscription_transitions', 'paypal_payment_records']) {
  if (!read('migrations/phase6_paypal_subscriptions.sql').includes(text)) hard.push(`PayPal migration missing ${text}`);
}
for (const text of ['main = "src/worker-production.js"', 'binding = "FORUM_POSTS"', 'binding = "MEMBERS_DB"', 'directory = "./_site"', 'run_worker_first = true']) {
  if (!read('wrangler.toml').includes(text)) hard.push(`wrangler.toml missing ${text}`);
}
for (const text of ['"main": "src/worker-production.js"', '"binding": "FORUM_POSTS"', '"binding": "MEMBERS_DB"']) {
  if (!read('wrangler.jsonc').includes(text)) hard.push(`wrangler.jsonc missing ${text}`);
}

/* Prevent competing automatic deploys or legacy health ownership. */
const canonicalDeploy = read('.github/workflows/deploy.yml');
const fallbackDeploy = read('.github/workflows/deploy-production.yml');
const legacyRepair = read('scripts/repair-generated-site-artifacts.js');
const regressionWrapper = read('scripts/cloudflare-focused-pressure-wrapper.js');
if (!/cancel-in-progress:\s*true/.test(canonicalDeploy)) hard.push('canonical deploy must cancel stale runs');
if (!canonicalDeploy.includes('verify-live-production.js')) hard.push('canonical deploy missing live verification');
if (!canonicalDeploy.includes('d1 export matrix-members --remote')) hard.push('canonical deploy missing D1 rollback export');
if (!canonicalDeploy.includes('phase6_paypal_subscriptions.sql')) hard.push('canonical deploy missing Phase 6 D1 migration');
if (!canonicalDeploy.includes('checkout must remain disabled during deployment')) hard.push('canonical deploy does not prove disabled PayPal switches');
if (/^\s*push:/m.test(fallbackDeploy)) hard.push('manual fallback deploy must not trigger on push');
if (!fallbackDeploy.includes('workflow_dispatch:')) hard.push('manual fallback deploy missing workflow_dispatch');
if (!fallbackDeploy.includes('group: matrixreprogrammed-production')) hard.push('manual fallback deploy must share canonical concurrency group');
if (!/cancel-in-progress:\s*true/.test(fallbackDeploy)) hard.push('manual fallback must share stale-run cancellation');
if (fallbackDeploy.includes('PAYPAL_PRODUCTION_ENABLED=true') || fallbackDeploy.includes('ACTIVATE MATRIX PAYPAL LIVE')) hard.push('manual fallback must not activate live PayPal');
if (!legacyRepair.includes("productionHealthOwner: 'scripts/build-production-health.js'")) hard.push('legacy repair does not acknowledge canonical health owner');
if (legacyRepair.includes("workerScript: 'src/worker.js'") || legacyRepair.includes("write('deploy-health.json'")) hard.push('legacy repair still writes obsolete production health');
if (!regressionWrapper.includes('final-production-reconcile.js')) hard.push('Cloudflare regression wrapper missing final reconciliation');
if (!regressionWrapper.includes('sandbox-ready-disabled')) hard.push('Cloudflare regression wrapper does not enforce server-gated PayPal readiness');

if (siteExists('_redirects')) hard.push('_site/_redirects must not be deployed for Worker assets');

const report = {
  ok: hard.length === 0,
  generatedAt: new Date().toISOString(),
  expectedSha,
  manifestSha: manifest?.commitSha || null,
  builtManifestSha: builtManifest?.commitSha || null,
  healthSha: health?.buildSha || null,
  builtHealthSha: builtHealth?.buildSha || null,
  hardIssues: hard,
  softIssues: soft,
  deploymentModel: 'One automatic canonical deploy and one manual fallback using the same strict gates.',
  productionHealthOwner: 'scripts/build-production-health.js via final-production-reconcile.js',
  forumPersistence: 'Cloudflare D1 is authoritative behind a strict fail-closed production Worker.',
  paymentStatus: 'PayPal sandbox-ready behind strict server-side activation gates; checkout disabled by default.',
  boundary: 'Deployment is blocked on competing automatic workflows, legacy health overwrite, stale routes or data, health/SHA drift, false-success forum fallback or unguarded payment activation.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-deploy-guard-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'production-deploy-guard-report.md'), `# Production Deploy Guard\n\nGenerated: ${report.generatedAt}\nResult: ${report.ok ? 'PASS' : 'FAIL'}\nExpected SHA: ${expectedSha}\nManifest SHA: ${report.manifestSha}\nHealth SHA: ${report.healthSha}\nDeployment model: ${report.deploymentModel}\nForum storage: ${report.forumPersistence}\nPayments: ${report.paymentStatus}\n\n## Hard Issues\n${hard.map(issue => `- ${issue}`).join('\n') || '- None'}\n`);
if (hard.length) {
  console.error('PRODUCTION DEPLOY GUARD FAILED');
  hard.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`PRODUCTION DEPLOY GUARD PASSED for ${String(expectedSha).slice(0, 12)} with one automatic deploy, strict D1 forums and server-gated PayPal.`);
