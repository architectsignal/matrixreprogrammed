const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const problems = [];
const exists = file => fs.existsSync(path.join(root, file));
const read = file => exists(file) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
const fail = message => problems.push(message);
const requireFile = file => { if (!exists(file)) fail(`missing required file: ${file}`); };
const requireIncludes = (file, text, label = text) => {
  if (!exists(file)) return;
  if (!read(file).includes(text)) fail(`${file}: missing ${label}`);
};
const forbidIncludes = (file, text, label = text) => {
  if (!exists(file)) return;
  if (read(file).includes(text)) fail(`${file}: should not contain ${label}`);
};

/*
 * Legacy generators still create former membership pages during the long build.
 * Restore the protected Phase 6 page before validating or copying deployable output.
 */
const membershipPatch = spawnSync(process.execPath, [path.join(root, 'scripts', 'patch-membership-tiers.js')], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
  maxBuffer: 20 * 1024 * 1024,
  env: process.env
});
if (membershipPatch.status !== 0) fail(`canonical membership rebuild failed: ${membershipPatch.stderr || membershipPatch.stdout}`);
if (exists('membership.html') && exists('_site')) {
  fs.copyFileSync(path.join(root, 'membership.html'), path.join(root, '_site', 'membership.html'));
  const extensionless = path.join(root, '_site', 'membership');
  if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(path.join(root, 'membership.html'), extensionless);
  if (exists('paypal-membership.js')) fs.copyFileSync(path.join(root, 'paypal-membership.js'), path.join(root, '_site', 'paypal-membership.js'));
}

[
  'src/worker.js',
  'src/worker-forum-persistence.js',
  'src/worker-member-experience.js',
  'src/worker-paypal-subscriptions.js',
  'src/worker-production.js',
  'wrangler.toml',
  'wrangler.jsonc',
  '_headers',
  'membership.html',
  'paypal-membership.js',
  'billing-dashboard.html',
  'billing-dashboard.js',
  'admin-payment-dashboard.html',
  'admin-payment-dashboard.js',
  'templates/phase6-membership.html',
  'data/membership-tiers.json',
  'migrations/0001_membership_foundation.sql',
  'migrations/0004_forum_persistence.sql',
  'migrations/phase5_member_experience.sql',
  'migrations/phase6_paypal_subscriptions.sql',
  'migrations/phase6_paypal_failure_counter_fix.sql',
  'scripts/build-cloudflare-output.js',
  'scripts/build-production-health.js',
  'scripts/final-production-reconcile.js',
  'scripts/forum-persistence-d1-test.js',
  'scripts/patch-membership-tiers.js',
  'scripts/repair-generated-site-artifacts.js',
  '_site/index.html',
  '_site/index',
  '_site/search.html',
  '_site/search',
  '_site/membership.html',
  '_site/membership',
  '_site/paypal-membership.js',
  '_site/forum.html',
  '_site/forum'
].forEach(requireFile);

if (exists('_site/_redirects')) fail('_site/_redirects must not be deployed with Worker assets');

for (const marker of [
  "import forumWorker from './worker-forum-persistence.js'",
  "import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js'",
  'members-db-binding-unavailable',
  'non-authoritative-forum-response-blocked',
  'non-authoritative-paypal-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'",
  "origin !== 'cloudflare-worker-paypal-subscriptions'",
  "health?.d1Connected === true",
  "health?.backend === 'src/worker-forum-persistence.js'",
  'status: 503',
  'isPayPalRoute(path)',
  'return forumWorker.fetch(request, env, ctx)'
]) requireIncludes('src/worker-production.js', marker, `strict production marker ${marker}`);

for (const marker of [
  "import legacyWorker from './worker.js'",
  '/forum-health',
  '/forum-feed-main',
  '/forum-feed-speculation',
  '/forum-feed-epstein-alive',
  '/submit-main-post',
  '/submit-speculation-post',
  '/submit-epstein-alive-post',
  '/report-main-post',
  '/downloads/forum-posts.json',
  '/downloads/forum-posts.md',
  'CREATE TABLE IF NOT EXISTS forum_posts',
  'INSERT OR IGNORE INTO forum_posts',
  "FROM forum_posts WHERE status='live'",
  'INSERT INTO forum_reports',
  'Cloudflare D1 MEMBERS_DB.forum_posts',
  'kv_forum_migration_v1',
  "prefix: 'post:'",
  'D1 authoritative; KV compatibility mirror',
  "return legacyWorker.fetch(request, env, ctx)"
]) requireIncludes('src/worker-forum-persistence.js', marker, `D1 forum marker ${marker}`);

for (const marker of [
  'cloudflare-worker-paypal-subscriptions',
  '/api/paypal/config',
  '/api/paypal/checkout-intent',
  '/api/paypal/subscription/confirm',
  '/api/paypal/subscription/cancel',
  '/api/paypal/webhook',
  '/api/paypal/admin/activation',
  '/v1/notifications/verify-webhook-signature',
  'PAYPAL_SANDBOX_ENABLED',
  'PAYPAL_PRODUCTION_ENABLED',
  'PAYPAL_LIVE_ACTIVATION_CONFIRMATION',
  'paypal_runtime_settings'
]) requireIncludes('src/worker-paypal-subscriptions.js', marker, `PayPal Worker marker ${marker}`);

for (const marker of [
  'const routeAliases = {',
  'routeAliases[originalPath]',
  'routeAliases[normalizedPath]',
  'env.ASSETS.fetch',
  '/api/membership/signup',
  '/api/membership/health',
  '/api/auth/request-link',
  '/api/auth/verify',
  '/api/auth/logout',
  '/api/member/me',
  'MEMBERS_DB'
]) requireIncludes('src/worker.js', marker, `legacy application marker ${marker}`);
forbidIncludes('src/worker.js', 'PAGES_STATIC_ORIGIN', 'stale Pages origin constant');
forbidIncludes('src/worker.js', 'matrixreprogrammed.pages.dev', 'stale Pages origin URL');
forbidIncludes('src/worker.js', 'clientSecret:', 'payment secret in response payload');

for (const marker of [
  'Free Member',
  '€0',
  '€3',
  '€6',
  '€9',
  'paypal-membership.js',
  'paypal-membership-status',
  'paypal-button-supporter',
  'paypal-button-intelligence',
  'paypal-button-research_pro',
  'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.'
]) {
  requireIncludes('membership.html', marker, `server-gated membership marker ${marker}`);
  requireIncludes('_site/membership.html', marker, `built server-gated membership marker ${marker}`);
}
for (const file of ['membership.html', '_site/membership.html', 'templates/phase6-membership.html']) {
  forbidIncludes(file, 'Coming soon — no payment taken', 'obsolete deferred membership page');
  forbidIncludes(file, '€19/month', 'legacy €19 tier');
  forbidIncludes(file, '€49/month', 'legacy €49 tier');
}
for (const marker of ['/api/paypal/checkout-intent', '/api/paypal/subscription/confirm']) {
  requireIncludes('paypal-membership.js', marker, `PayPal membership runtime ${marker}`);
  requireIncludes('_site/paypal-membership.js', marker, `built PayPal membership runtime ${marker}`);
}
requireIncludes('billing-dashboard.html', 'billing-dashboard.js', 'member billing dashboard runtime');
requireIncludes('admin-payment-dashboard.html', 'admin-payment-dashboard.js', 'administrator payment dashboard runtime');

for (const marker of ['paypal_runtime_settings', 'paypal_products', 'paypal_plans', 'paypal_subscription_transitions', 'paypal_payment_records']) {
  requireIncludes('migrations/phase6_paypal_subscriptions.sql', marker, `Phase 6 migration marker ${marker}`);
}
requireIncludes('migrations/phase6_paypal_failure_counter_fix.sql', 'paypal_preserve_failure_count_on_failed_snapshot', 'PayPal failure counter correction');

for (const marker of [
  'main = "src/worker-production.js"',
  'directory = "./_site"',
  'binding = "ASSETS"',
  'run_worker_first = true',
  'binding = "FORUM_POSTS"',
  'binding = "MEMBERS_DB"',
  'database_name = "matrix-members"',
  'c6e465d3-4e36-4a00-b8f8-309447240c52'
]) requireIncludes('wrangler.toml', marker, `wrangler.toml marker ${marker}`);
for (const marker of [
  '"main": "src/worker-production.js"',
  '"binding": "ASSETS"',
  '"binding": "FORUM_POSTS"',
  '"binding": "MEMBERS_DB"',
  '"database_name": "matrix-members"',
  '"pattern": "matrixreprogrammed.com/*"',
  '"pattern": "www.matrixreprogrammed.com/*"'
]) requireIncludes('wrangler.jsonc', marker, `wrangler.jsonc marker ${marker}`);

for (const marker of [
  'CREATE TABLE IF NOT EXISTS forum_posts',
  'CREATE TABLE IF NOT EXISTS forum_reports',
  'idx_forum_posts_board_created',
  'idx_forum_posts_status_created'
]) requireIncludes('migrations/0004_forum_persistence.sql', marker, `forum migration marker ${marker}`);

requireIncludes('_headers', 'Strict-Transport-Security', 'HSTS header');
requireIncludes('scripts/build-cloudflare-output.js', 'copyHtmlRouteVariant', 'extensionless route copier');
requireIncludes('scripts/final-production-reconcile.js', 'build-production-health.js', 'final commit-bound health generation');
requireIncludes('scripts/final-production-reconcile.js', 'paypal-membership.js', 'final PayPal membership reconciliation');
requireIncludes('scripts/final-production-reconcile.js', 'SANDBOX READY / CHECKOUT DISABLED', 'final server-gated payment guard');
requireIncludes('scripts/build-production-health.js', "workerScript: 'src/worker-production.js'", 'strict Worker health identity');
requireIncludes('scripts/build-production-health.js', "paymentStatus: 'sandbox-ready-disabled'", 'sandbox-ready disabled payment health status');
requireIncludes('scripts/repair-generated-site-artifacts.js', "productionHealthOwner: 'scripts/build-production-health.js'", 'single production-health owner');
forbidIncludes('scripts/repair-generated-site-artifacts.js', "workerScript: 'src/worker.js'", 'legacy health Worker identity');

const report = {
  ok: problems.length === 0,
  generatedAt: new Date().toISOString(),
  problems,
  canonicalMembershipPatch: {
    status: membershipPatch.status,
    stdout: String(membershipPatch.stdout || '').slice(-1000),
    stderr: String(membershipPatch.stderr || '').slice(-1000)
  },
  workerEntrypoint: 'src/worker-production.js',
  forumStorage: 'Cloudflare D1 authoritative with KV compatibility/recovery only',
  paymentStatus: 'sandbox-ready-disabled',
  boundary: 'PayPal routes and browser UI may be deployed, but checkout remains fail-closed until environment, credentials, verified plans and the D1 activation switch agree.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'cloudflare-worker-routes-test.json'), JSON.stringify(report, null, 2));

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}

console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked strict production routing, D1-authoritative forums, protected Phase 6 membership restoration, PayPal fail-closed gates, active bindings and single-owner commit-bound health.');
