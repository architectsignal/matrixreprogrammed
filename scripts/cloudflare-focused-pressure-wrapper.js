const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const hard = [];
const soft = [];
const steps = [];
const fp = value => path.join(root, value);
const site = value => path.join(root, '_site', value);
const exists = value => fs.existsSync(fp(value));
const siteExists = value => fs.existsSync(site(value));
const read = value => exists(value) ? fs.readFileSync(fp(value), 'utf8') : '';
const siteRead = value => siteExists(value) ? fs.readFileSync(site(value), 'utf8') : '';

function run(label, file, hardFailure = false, env = {}) {
  const script = fp(file);
  if (!fs.existsSync(script)) {
    (hardFailure ? hard : soft).push(`${label}: missing ${hardFailure ? 'required' : 'optional'} script ${file}`);
    return;
  }
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 40 * 1024 * 1024,
    env: { ...process.env, ...env }
  });
  steps.push({ label, file, status: result.status, stdout: String(result.stdout || '').slice(-3000), stderr: String(result.stderr || '').slice(-3000) });
  if (result.status !== 0) (hardFailure ? hard : soft).push(`${label}: ${file} exited ${result.status}`);
}
function needFile(value) { if (!exists(value)) hard.push(`missing source file: ${value}`); }
function needSite(value) { if (!siteExists(value)) hard.push(`missing built asset: _site/${value}`); }
function needText(value, text, label = text) { if (!exists(value) || !read(value).includes(text)) hard.push(`${value} missing ${label}`); }
function needSiteText(value, text, label = text) { if (!siteExists(value) || !siteRead(value).includes(text)) hard.push(`_site/${value} missing ${label}`); }
function forbidText(value, text, label = text) { if (exists(value) && read(value).includes(text)) hard.push(`${value} contains forbidden ${label}`); }
function forbidSiteText(value, text, label = text) { if (siteExists(value) && siteRead(value).includes(text)) hard.push(`_site/${value} contains forbidden ${label}`); }
function parseJson(value, fromSite = false) {
  try { return JSON.parse(fromSite ? siteRead(value) : read(value)); }
  catch (error) { hard.push(`${fromSite ? '_site/' : ''}${value} invalid JSON: ${error.message}`); return null; }
}

fs.mkdirSync(fp('downloads'), { recursive: true });
const deploySha = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';

for (const [label, file] of [
  ['deploy status', 'scripts/build-deploy-status.js'],
  ['generated content repair', 'scripts/repair-generated-site-artifacts.js'],
  ['shared assets', 'scripts/ensure-shared-assets.js'],
  ['search repair after shared assets', 'scripts/repair-search-system.js'],
  ['worker asset origin patch', 'scripts/patch-worker-pages-origin.js'],
  ['Cloudflare output', 'scripts/build-cloudflare-output.js'],
  ['search repair after Cloudflare output', 'scripts/repair-search-system.js'],
  ['Cloudflare output final', 'scripts/build-cloudflare-output.js'],
  ['site brain health', 'scripts/site-brain-health.js']
]) run(label, file);
run('D1 forum persistence', 'scripts/forum-persistence-d1-test.js', true);
run('strict Worker routes', 'scripts/cloudflare-worker-routes-test.js', true);
run('final production reconciliation', 'scripts/final-production-reconcile.js', true, { DEPLOY_COMMIT_SHA: deploySha });
run('production freshness', 'scripts/production-freshness-guard.js', true);
run('production synchronization', 'scripts/production-sync-test.js', true);
run('production deploy guard', 'scripts/production-deploy-guard.js', true, { DEPLOY_COMMIT_SHA: deploySha });

for (const value of [
  'index.html','search.html','search.js','search-index.json','books.html','live-intel.html','forum.html','forum.js',
  'membership.html','paypal-membership.js','member-dashboard.html','member-dashboard-app.js','billing-dashboard.html','billing-dashboard.js',
  'admin-payment-dashboard.html','admin-payment-dashboard.js','deploy-health.html','deploy-health.json','deploy-manifest.json',
  'src/worker.js','src/worker-forum-persistence.js','src/worker-member-experience.js','src/worker-paypal-subscriptions.js','src/worker-production.js',
  'wrangler.toml','wrangler.jsonc','_headers','migrations/0004_forum_persistence.sql','migrations/phase5_member_experience.sql','migrations/phase6_paypal_subscriptions.sql',
  'scripts/build-production-health.js','scripts/final-production-reconcile.js'
]) needFile(value);
for (const value of [
  'index.html','index','search.html','search','search.js','search-index.json','books.html','books','live-intel.html','live-intel','forum.html','forum',
  'membership.html','membership','paypal-membership.js','member-dashboard.html','member-dashboard-app.js','billing-dashboard.html','billing-dashboard.js',
  'admin-payment-dashboard.html','admin-payment-dashboard.js','deploy-health.html','deploy-health','deploy-health.json','deploy-manifest.json'
]) needSite(value);
if (siteExists('_redirects')) hard.push('_site/_redirects must not exist for Worker assets deployment');

for (const marker of [
  "import forumWorker from './worker-forum-persistence.js'",
  "import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js'",
  'members-db-binding-unavailable','non-authoritative-forum-response-blocked','non-authoritative-paypal-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'","origin !== 'cloudflare-worker-paypal-subscriptions'"
]) needText('src/worker-production.js', marker, `strict Worker marker ${marker}`);
for (const marker of ['Cloudflare D1 MEMBERS_DB.forum_posts','INSERT OR IGNORE INTO forum_posts','kv_forum_migration_v1','D1 authoritative; KV compatibility mirror']) needText('src/worker-forum-persistence.js', marker, `D1 forum marker ${marker}`);
for (const marker of ['cloudflare-worker-paypal-subscriptions','/api/paypal/checkout-intent','/api/paypal/subscription/create','/api/paypal/subscription/return','/api/paypal/subscription/confirm','/api/paypal/webhook','PAYPAL_SANDBOX_ENABLED','PAYPAL_PRODUCTION_ENABLED','PAYPAL_LIVE_ACTIVATION_CONFIRMATION','paypal_runtime_settings']) needText('src/worker-paypal-subscriptions.js', marker, `PayPal Worker marker ${marker}`);
needText('src/worker.js', 'env.ASSETS.fetch', 'legacy asset fetch behind strict boundary');

for (const marker of ['Free Member','€0','€3','€6','€9','paypal-membership.js','paypal-membership-status','Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.']) {
  needText('membership.html', marker, `server-gated membership marker ${marker}`);
  needSiteText('membership.html', marker, `built server-gated membership marker ${marker}`);
}
forbidText('membership.html', 'Coming soon — no payment taken', 'obsolete deferred membership page');
forbidSiteText('membership.html', 'Coming soon — no payment taken', 'built obsolete deferred membership page');
for (const marker of ['/api/paypal/subscription/create','Continue securely to PayPal','/api/paypal/config','location.assign']) {
  needText('paypal-membership.js', marker, `PayPal server redirect runtime ${marker}`);
  needSiteText('paypal-membership.js', marker, `built PayPal server redirect runtime ${marker}`);
}
forbidText('paypal-membership.js', 'paypal.com/sdk/js', 'obsolete browser-loaded PayPal SDK');
forbidSiteText('paypal-membership.js', 'paypal.com/sdk/js', 'built obsolete browser-loaded PayPal SDK');
needText('billing-dashboard.html', 'billing-dashboard.js', 'billing dashboard runtime');
needText('admin-payment-dashboard.html', 'admin-payment-dashboard.js', 'payment admin runtime');

const wranglerToml = read('wrangler.toml');
const wranglerJsonc = read('wrangler.jsonc');
for (const marker of ['main = "src/worker-production.js"','directory = "./_site"','binding = "ASSETS"','run_worker_first = true','binding = "FORUM_POSTS"','binding = "MEMBERS_DB"','keep_vars = true']) needText('wrangler.toml', marker, `Cloudflare config marker ${marker}`);
if (!/"keep_vars"\s*:\s*true/.test(wranglerJsonc)) hard.push('wrangler.jsonc must preserve dashboard variables');
if (/^PAYPAL_[A-Z0-9_]+\s*=/m.test(wranglerToml)) hard.push('wrangler.toml contains forbidden active PAYPAL_* override');
if (/"PAYPAL_[A-Z0-9_]+"\s*:/.test(wranglerJsonc)) hard.push('wrangler.jsonc contains forbidden active PAYPAL_* override');
needText('_headers', 'Strict-Transport-Security', 'HSTS header');
needText('_headers', '/deploy-health.json', 'uncached production health header');

const health = exists('deploy-health.json') ? parseJson('deploy-health.json') : null;
const builtHealth = siteExists('deploy-health.json') ? parseJson('deploy-health.json', true) : null;
const manifest = exists('deploy-manifest.json') ? parseJson('deploy-manifest.json') : null;
for (const [label, item] of [['source', health], ['built', builtHealth]]) {
  if (!item) continue;
  if (!item.ok) hard.push(`${label} deploy-health.json should be ready`);
  if (item.workerScript !== 'src/worker-production.js') hard.push(`${label} deploy health must identify strict Worker`);
  if (item.paymentStatus !== 'runtime-gated-dashboard-managed') hard.push(`${label} deploy health must identify dashboard-managed runtime PayPal`);
  if (item.checkoutDefault !== 'runtime-d1-gated') hard.push(`${label} deploy health must identify D1-gated checkout`);
  if (!String(item.paymentMessage || '').includes('credentials') || !String(item.paymentMessage || '').includes('three active plans')) hard.push(`${label} deploy health must describe the complete activation boundary`);
  if (deploySha && item.buildSha !== deploySha) hard.push(`${label} deploy health SHA ${item.buildSha} does not match ${deploySha}`);
}
if (manifest && deploySha && manifest.commitSha !== deploySha) hard.push(`deploy manifest SHA ${manifest.commitSha} does not match ${deploySha}`);
if (health && manifest && health.manifestSha !== manifest.commitSha) hard.push('deploy health and manifest disagree');

if (siteExists('search-index.json')) {
  const index = parseJson('search-index.json', true);
  if (index && !Array.isArray(index)) hard.push('_site/search-index.json must be an array');
  if (Array.isArray(index) && index.length < 20) hard.push('_site/search-index.json should contain at least 20 routes');
}

const report = {
  ok: hard.length === 0,
  generatedAt: new Date().toISOString(),
  deploySha,
  hardIssues: hard,
  softIssues: soft,
  steps,
  forumStorage: 'Cloudflare D1 is authoritative behind the strict production Worker; KV is migration and compatibility only.',
  paymentStatus: 'runtime-gated-dashboard-managed: the Worker creates server-side PayPal subscriptions, redirects to the official approval page, verifies returns, and preserves dashboard-managed credentials and switches plus D1 activation.',
  boundary: 'This pressure gate blocks stale Worker entrypoints, false-success forum fallbacks, health/manifest drift, repository payment overrides, unguarded payment activation, obsolete browser SDK checkout and legacy generator regression.'
};
fs.writeFileSync(fp('downloads/cloudflare-focused-pressure-wrapper.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(fp('downloads/cloudflare-focused-pressure-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(fp('downloads/cloudflare-focused-pressure-report.md'), `# Cloudflare Focused Pressure Report\n\nGenerated: ${report.generatedAt}\nResult: ${report.ok ? 'PASS' : 'FAIL'}\nDeploy SHA: ${deploySha}\nForum: ${report.forumStorage}\nPayments: ${report.paymentStatus}\n\n## Hard Issues\n${hard.map(item => `- ${item}`).join('\n') || '- None'}\n\n## Soft Issues\n${soft.map(item => `- ${item}`).join('\n') || '- None'}\n`);
if (hard.length) {
  console.error('\nCLOUDFLARE FOCUSED PRESSURE FAILED\n');
  for (const item of hard) console.error(`- ${item}`);
  process.exit(1);
}
console.log('CLOUDFLARE FOCUSED PRESSURE PASSED');
console.log('Strict D1 forum, consent-bound report automation and runtime-gated server-created PayPal subscriptions are reconciled and commit-bound.');