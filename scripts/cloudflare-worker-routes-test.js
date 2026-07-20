const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const problems = [];
const full = file => path.join(root, file);
const exists = file => fs.existsSync(full(file));
const read = file => exists(file) ? fs.readFileSync(full(file), 'utf8') : '';
const fail = message => problems.push(message);
const need = file => { if (!exists(file)) fail(`missing required file: ${file}`); };
const needText = (file, text, label = text) => { if (!exists(file) || !read(file).includes(text)) fail(`${file}: missing ${label}`); };
const forbidText = (file, text, label = text) => { if (exists(file) && read(file).includes(text)) fail(`${file}: should not contain ${label}`); };

function runNodeRepair(script, label) {
  const result = spawnSync(process.execPath, [full(script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 20 * 1024 * 1024,
    env: process.env
  });
  if (result.status !== 0) fail(`${label} failed: ${result.stderr || result.stdout}`);
  return result;
}

const membershipPatch = runNodeRepair('scripts/patch-membership-tiers.js', 'canonical membership restore');
if (exists('membership.html') && exists('_site')) {
  fs.copyFileSync(full('membership.html'), full('_site/membership.html'));
  const extensionless = full('_site/membership');
  if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(full('membership.html'), extensionless);
  if (exists('paypal-membership.js')) fs.copyFileSync(full('paypal-membership.js'), full('_site/paypal-membership.js'));
}

// Late site generators can restore the legacy forum client and Signal Pass UI.
// Reapply every canonical forum owner at this final in-build audit boundary,
// then copy the exact repaired assets into the deployable Cloudflare directory.
const forumRepairResults = [
  ['scripts/repair-forum-member-posting.js', 'forum member-posting repair'],
  ['scripts/repair-forum-login-canonical.js', 'same-origin member-login repair'],
  ['scripts/repair-forum-session-compatibility.js', 'shared-session compatibility repair'],
  ['scripts/repair-forum-page-consistency.js', 'forum page consistency repair'],
  ['scripts/forum-member-posting-test.js', 'forum member-posting regression proof']
].map(([script, label]) => ({ script, label, result: runNodeRepair(script, label) }));

if (exists('_site')) {
  for (const file of ['forum.js', 'forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html', 'member-login.html']) {
    if (!exists(file)) continue;
    fs.copyFileSync(full(file), full(`_site/${file}`));
    if (file.endsWith('.html')) {
      const extensionless = full(`_site/${file.replace(/\.html$/, '')}`);
      if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(full(file), extensionless);
    }
  }
}

[
  'src/worker.js','src/worker-forum-persistence.js','src/worker-member-experience.js','src/worker-paypal-subscriptions.js','src/worker-production.js',
  'wrangler.toml','wrangler.jsonc','_headers','membership.html','paypal-membership.js','billing-dashboard.html','billing-dashboard.js',
  'admin-payment-dashboard.html','admin-payment-dashboard.js','forum.js','forum.html','dark-speculation-forum.html','epstein-alive-board.html',
  'templates/phase6-membership.template','data/membership-tiers.json',
  'migrations/0001_membership_foundation.sql','migrations/0004_forum_persistence.sql','migrations/phase5_member_experience.sql',
  'migrations/phase6_paypal_subscriptions.sql','migrations/phase6_paypal_failure_counter_fix.sql',
  'scripts/build-cloudflare-output.js','scripts/build-production-health.js','scripts/final-production-reconcile.js','scripts/forum-persistence-d1-test.js',
  'scripts/patch-membership-tiers.js','scripts/repair-generated-site-artifacts.js','scripts/repair-forum-page-consistency.js',
  '_site/index.html','_site/index','_site/search.html','_site/search','_site/membership.html','_site/membership','_site/paypal-membership.js','_site/forum.html','_site/forum',
  '_site/forum.js','_site/dark-speculation-forum.html','_site/epstein-alive-board.html'
].forEach(need);

if (exists('_site/_redirects')) fail('_site/_redirects must not be deployed with Worker assets');

for (const marker of [
  "import forumWorker from './worker-forum-persistence.js'",
  "import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js'",
  'members-db-binding-unavailable','non-authoritative-forum-response-blocked','non-authoritative-paypal-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'","origin !== 'cloudflare-worker-paypal-subscriptions'",'isPayPalRoute(path)','status: 503'
]) needText('src/worker-production.js', marker, `strict production marker ${marker}`);

for (const marker of [
  'Cloudflare D1 MEMBERS_DB.forum_posts',
  'CREATE TABLE IF NOT EXISTS forum_posts',
  'INSERT INTO forum_posts',
  'D1 did not confirm the forum insert',
  'D1 forum read-after-write confirmation failed',
  'INSERT INTO forum_reports',
  'kv_forum_migration_v1',
  "prefix: 'post:'",
  'D1 authoritative; KV compatibility mirror'
]) needText('src/worker-forum-persistence.js', marker, `strict D1 forum marker ${marker}`);
forbidText('src/worker-forum-persistence.js', 'INSERT OR IGNORE INTO forum_posts', 'silent duplicate-ignoring forum write');

needText('src/worker-member-experience.js', "cookieValue(request,'matrix_session_v2')||cookieValue(request,'matrix_session')", 'shared v2 and legacy session reader');
for (const marker of ["credentials:'include'",'member && member.emailVerifiedAt',"data.saved !== true","data.storage !== 'Cloudflare D1 MEMBERS_DB.forum_posts'",'Persistent posting is unlocked.']) {
  needText('forum.js', marker, `authenticated forum client marker ${marker}`);
  needText('_site/forum.js', marker, `deployable authenticated forum client marker ${marker}`);
}
for (const file of ['forum.html','dark-speculation-forum.html','epstein-alive-board.html','_site/forum.html','_site/dark-speculation-forum.html','_site/epstein-alive-board.html']) {
  needText(file, 'forum.js?v=20260720-forum-member-posting-v3', 'versioned repaired forum client');
  needText(file, 'id="forum-member-status"', 'member session status');
  needText(file, 'id="signal-board-form"', 'forum posting form');
}
forbidText('dark-speculation-forum.html', 'paypal.me/njmgroup/1', 'obsolete paid Signal Pass');
forbidText('dark-speculation-forum.html', 'unlock-signal-pass', 'obsolete browser Signal Pass unlock');
forbidText('_site/dark-speculation-forum.html', 'paypal.me/njmgroup/1', 'deployable obsolete paid Signal Pass');
forbidText('_site/dark-speculation-forum.html', 'unlock-signal-pass', 'deployable obsolete browser Signal Pass unlock');

for (const marker of ['cloudflare-worker-paypal-subscriptions','/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/confirm','/api/paypal/subscription/cancel','/api/paypal/webhook','/api/paypal/admin/activation','/v1/notifications/verify-webhook-signature','PAYPAL_SANDBOX_ENABLED','PAYPAL_PRODUCTION_ENABLED','PAYPAL_LIVE_ACTIVATION_CONFIRMATION','paypal_runtime_settings']) needText('src/worker-paypal-subscriptions.js', marker, `PayPal Worker marker ${marker}`);

for (const marker of ['Free Member','€0','€3','€6','€9','paypal-membership.js','paypal-membership-status','paypal-button-supporter','paypal-button-intelligence','paypal-button-research_pro','Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.']) {
  needText('templates/phase6-membership.template', marker, `protected template marker ${marker}`);
  needText('membership.html', marker, `server-gated membership marker ${marker}`);
  needText('_site/membership.html', marker, `built membership marker ${marker}`);
}
for (const file of ['templates/phase6-membership.template','membership.html','_site/membership.html']) {
  forbidText(file, 'Coming soon — no payment taken', 'obsolete deferred membership page');
  forbidText(file, '€19/month', 'legacy €19 tier');
  forbidText(file, '€49/month', 'legacy €49 tier');
}
for (const marker of ['/api/paypal/subscription/create','Continue securely to PayPal','/api/paypal/config']) {
  needText('paypal-membership.js', marker, `PayPal membership runtime ${marker}`);
  needText('_site/paypal-membership.js', marker, `built PayPal membership runtime ${marker}`);
}
needText('billing-dashboard.html', 'billing-dashboard.js');
needText('admin-payment-dashboard.html', 'admin-payment-dashboard.js');

for (const marker of ['paypal_runtime_settings','paypal_products','paypal_plans','paypal_subscription_transitions','paypal_payment_records']) needText('migrations/phase6_paypal-subscriptions.sql', marker, `Phase 6 migration marker ${marker}`);
needText('migrations/phase6_paypal_failure_counter_fix.sql', 'paypal_preserve_failure_count_on_failed_snapshot');

for (const marker of ['main = "src/worker-production.js"','directory = "./_site"','binding = "ASSETS"','run_worker_first = true','binding = "FORUM_POSTS"','binding = "MEMBERS_DB"','database_name = "matrix-members"','c6e465d3-4e36-4a00-b8f8-309447240c52','keep_vars = true']) needText('wrangler.toml', marker, `wrangler.toml marker ${marker}`);
for (const marker of ['"main": "src/worker-production.js"','"binding": "ASSETS"','"binding": "FORUM_POSTS"','"binding": "MEMBERS_DB"','"database_name": "matrix-members"','"pattern": "matrixreprogrammed.com/*"','"pattern": "www.matrixreprogrammed.com/*"','"keep_vars": true']) needText('wrangler.jsonc', marker, `wrangler.jsonc marker ${marker}`);
if (/^PAYPAL_[A-Z0-9_]+\s*=/m.test(read('wrangler.toml'))) fail('wrangler.toml must not contain active PAYPAL_* overrides');
if (/"PAYPAL_[A-Z0-9_]+"\s*:/.test(read('wrangler.jsonc'))) fail('wrangler.jsonc must not contain active PAYPAL_* overrides');

needText('_headers', 'Strict-Transport-Security', 'HSTS header');
needText('scripts/build-cloudflare-output.js', 'copyHtmlRouteVariant', 'extensionless route copier');
needText('scripts/final-production-reconcile.js', 'paypal-membership.js', 'final PayPal membership reconciliation');
needText('scripts/final-production-reconcile.js', 'Payments: RUNTIME GATED / DASHBOARD MANAGED', 'final runtime-gated payment guard');
needText('scripts/final-production-reconcile.js', 'repair-forum-page-consistency.js', 'final forum page consistency owner');
needText('scripts/build-production-health.js', "workerScript: 'src/worker-production.js'", 'strict Worker health identity');
needText('scripts/build-production-health.js', "paymentStatus: 'runtime-gated-dashboard-managed'", 'runtime-gated dashboard-managed health status');
needText('scripts/build-production-health.js', "checkoutDefault: 'runtime-d1-gated'", 'D1-gated checkout health status');
needText('scripts/repair-generated-site-artifacts.js', "productionHealthOwner: 'scripts/build-production-health.js'", 'single production-health owner');
forbidText('scripts/repair-generated-site-artifacts.js', "workerScript: 'src/worker.js'", 'legacy health Worker identity');

need('src/worker-email-lifecycle.js');
needText('src/worker-email-lifecycle.js', "function redirect(location){return new Response(null,{status:303,headers:{...securityHeaders,Location:location,'Cache-Control':'no-store','X-Matrix-Origin':'cloudflare-worker-email-lifecycle'}})}", 'authoritative email redirect origin header');

const report = {
  ok: problems.length === 0,
  generatedAt: new Date().toISOString(),
  problems,
  canonicalMembershipPatch: {
    status: membershipPatch.status,
    stdout: String(membershipPatch.stdout || '').slice(-1000),
    stderr: String(membershipPatch.stderr || '').slice(-1000)
  },
  forumRepairResults: forumRepairResults.map(item => ({
    script: item.script,
    status: item.result.status,
    stdout: String(item.result.stdout || '').slice(-1000),
    stderr: String(item.result.stderr || '').slice(-1000)
  })),
  workerEntrypoint: 'src/worker-production.js',
  forumStorage: 'Cloudflare D1 authoritative with strict insert and exact read-after-write confirmation; KV compatibility/recovery only',
  forumAccess: 'verified free member session across main, speculation and Epstein boards',
  paymentStatus: 'runtime-gated-dashboard-managed',
  boundary: 'Late generators are repaired before this audit. PayPal remains runtime-gated and forum success is impossible without authenticated D1 write/read proof.'
};
fs.mkdirSync(full('downloads'), { recursive: true });
fs.writeFileSync(full('downloads/cloudflare-worker-routes-test.json'), JSON.stringify(report, null, 2));

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Repaired late generators, then checked strict routing, authenticated D1 forum write/read, all three forum pages, protected membership restoration, runtime-gated PayPal, preserved bindings and commit-bound health.');
