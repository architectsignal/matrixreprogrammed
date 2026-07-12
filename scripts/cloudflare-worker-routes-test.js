const fs = require('fs');
const path = require('path');

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

[
  'src/worker.js',
  'src/worker-forum-persistence.js',
  'src/worker-production.js',
  'wrangler.toml',
  'wrangler.jsonc',
  '_headers',
  'membership.html',
  'data/membership-tiers.json',
  'migrations/0001_membership_foundation.sql',
  'migrations/0004_forum_persistence.sql',
  'scripts/build-cloudflare-output.js',
  'scripts/build-production-health.js',
  'scripts/final-production-reconcile.js',
  'scripts/forum-persistence-d1-test.js',
  'scripts/repair-generated-site-artifacts.js',
  '_site/index.html',
  '_site/index',
  '_site/search.html',
  '_site/search',
  '_site/membership.html',
  '_site/membership',
  '_site/forum.html',
  '_site/forum'
].forEach(requireFile);

if (exists('_site/_redirects')) fail('_site/_redirects must not be deployed with Worker assets');

/* Strict production boundary. */
for (const marker of [
  "import forumWorker from './worker-forum-persistence.js'",
  'members-db-binding-unavailable',
  'non-authoritative-forum-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'",
  "health?.d1Connected === true",
  "health?.backend === 'src/worker-forum-persistence.js'",
  'status: 503',
  'return forumWorker.fetch(request, env, ctx)'
]) requireIncludes('src/worker-production.js', marker, `strict production marker ${marker}`);

/* D1-authoritative forum layer with KV retained only for migration and recovery. */
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

/* Legacy application Worker remains available only behind the two boundaries. */
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

/* Payments remain deliberately dormant. Backend/schema code may stay for later activation. */
for (const marker of [
  '<!-- membership-tiers:start -->',
  '€3',
  '€6',
  '€9',
  'No payment is being taken yet.',
  'Coming soon — no payment taken',
  'disabled aria-disabled="true"'
]) {
  requireIncludes('membership.html', marker, `deferred membership marker ${marker}`);
  requireIncludes('_site/membership.html', marker, `built deferred membership marker ${marker}`);
}
for (const file of ['membership.html', '_site/membership.html']) {
  forbidIncludes(file, 'actions.subscription.create', 'active PayPal subscription creation');
  forbidIncludes(file, '/api/paypal/checkout-intent', 'active PayPal checkout-intent call');
  forbidIncludes(file, '/api/paypal/subscription/confirm', 'active PayPal confirmation call');
  forbidIncludes(file, '€19/month', 'legacy €19 tier');
  forbidIncludes(file, '€49/month', 'legacy €49 tier');
}
requireIncludes('migrations/0001_membership_foundation.sql', 'CREATE TABLE IF NOT EXISTS paypal_checkout_intents', 'dormant future payment schema');
requireIncludes('src/worker.js', '/api/paypal/webhook', 'dormant payment webhook backend');
requireIncludes('src/worker.js', '/v1/notifications/verify-webhook-signature', 'dormant webhook verification backend');

/* Active Cloudflare wiring must point to the strict boundary. */
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
requireIncludes('scripts/final-production-reconcile.js', 'Coming soon — no payment taken', 'final deferred-payment guard');
requireIncludes('scripts/build-production-health.js', "workerScript: 'src/worker-production.js'", 'strict Worker health identity');
requireIncludes('scripts/build-production-health.js', "paymentStatus: 'deferred'", 'deferred payment health status');
requireIncludes('scripts/repair-generated-site-artifacts.js', "productionHealthOwner: 'scripts/build-production-health.js'", 'single production-health owner');
forbidIncludes('scripts/repair-generated-site-artifacts.js', "workerScript: 'src/worker.js'", 'legacy health Worker identity');

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}

console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked strict production routing, D1-authoritative forums, KV recovery, application assets, disabled payment UI, active bindings and single-owner commit-bound health.');
