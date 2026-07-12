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
  steps.push({
    label,
    file,
    status: result.status,
    stdout: String(result.stdout || '').slice(-3000),
    stderr: String(result.stderr || '').slice(-3000)
  });
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

/* Legacy generators may still run, but the canonical reconciliation always runs last. */
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
  'index.html', 'search.html', 'search.js', 'search-index.json', 'books.html', 'live-intel.html',
  'forum.html', 'forum.js', 'membership.html', 'deploy-health.html', 'deploy-health.json',
  'deploy-manifest.json', 'src/worker.js', 'src/worker-forum-persistence.js', 'src/worker-production.js',
  'wrangler.toml', 'wrangler.jsonc', '_headers', 'migrations/0004_forum_persistence.sql',
  'scripts/build-production-health.js', 'scripts/final-production-reconcile.js'
]) needFile(value);
for (const value of [
  'index.html', 'index', 'search.html', 'search', 'search.js', 'search-index.json',
  'books.html', 'books', 'live-intel.html', 'live-intel', 'forum.html', 'forum',
  'membership.html', 'membership', 'deploy-health.html', 'deploy-health',
  'deploy-health.json', 'deploy-manifest.json'
]) needSite(value);
if (siteExists('_redirects')) hard.push('_site/_redirects must not exist for Worker assets deployment');

for (const marker of [
  "import forumWorker from './worker-forum-persistence.js'",
  'members-db-binding-unavailable',
  'non-authoritative-forum-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'"
]) needText('src/worker-production.js', marker, `strict Worker marker ${marker}`);
for (const marker of [
  'Cloudflare D1 MEMBERS_DB.forum_posts',
  'INSERT OR IGNORE INTO forum_posts',
  'kv_forum_migration_v1',
  'D1 authoritative; KV compatibility mirror'
]) needText('src/worker-forum-persistence.js', marker, `D1 forum marker ${marker}`);
needText('src/worker.js', 'env.ASSETS.fetch', 'legacy asset fetch behind strict boundary');

for (const file of ['membership.html']) {
  for (const marker of ['<!-- membership-tiers:start -->', '€3', '€6', '€9', 'Coming soon — no payment taken', 'No payment is being taken yet.']) needText(file, marker, `deferred membership marker ${marker}`);
  forbidText(file, 'actions.subscription.create', 'active PayPal subscription creation');
  forbidText(file, '/api/paypal/checkout-intent', 'active PayPal checkout intent');
  forbidText(file, '/api/paypal/subscription/confirm', 'active PayPal subscription confirmation');
}
for (const marker of ['€3', '€6', '€9', 'Coming soon — no payment taken']) needSiteText('membership.html', marker, `built deferred membership marker ${marker}`);
forbidSiteText('membership.html', 'actions.subscription.create', 'built active PayPal subscription creation');
forbidSiteText('membership.html', '/api/paypal/checkout-intent', 'built active PayPal checkout intent');

for (const marker of [
  'main = "src/worker-production.js"',
  'directory = "./_site"',
  'binding = "ASSETS"',
  'run_worker_first = true',
  'binding = "FORUM_POSTS"',
  'binding = "MEMBERS_DB"'
]) needText('wrangler.toml', marker, `Cloudflare config marker ${marker}`);
needText('_headers', 'Strict-Transport-Security', 'HSTS header');
needText('_headers', '/deploy-health.json', 'uncached production health header');

const health = exists('deploy-health.json') ? parseJson('deploy-health.json') : null;
const builtHealth = siteExists('deploy-health.json') ? parseJson('deploy-health.json', true) : null;
const manifest = exists('deploy-manifest.json') ? parseJson('deploy-manifest.json') : null;
for (const [label, item] of [['source', health], ['built', builtHealth]]) {
  if (!item) continue;
  if (!item.ok) hard.push(`${label} deploy-health.json should be ready`);
  if (item.workerScript !== 'src/worker-production.js') hard.push(`${label} deploy health must identify strict Worker`);
  if (item.paymentStatus !== 'deferred') hard.push(`${label} deploy health must keep payments deferred`);
  if (!String(item.paymentMessage || '').includes('no payment is taken')) hard.push(`${label} deploy health must state no payment is taken`);
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
  paymentStatus: 'Deferred; checkout UI is disabled and no payment is taken.',
  boundary: 'This pressure gate blocks stale Worker entrypoints, false-success forum fallbacks, health/manifest drift, active payment UI and legacy generator regression.'
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
console.log('Strict D1 forum production is reconciled, commit-bound and payment-deferred.');
