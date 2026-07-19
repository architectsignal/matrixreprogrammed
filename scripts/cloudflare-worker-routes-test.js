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
function headerRuleBlock(text, route) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === route);
  if (start < 0) return '';
  const block = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim().startsWith('/')) break;
    block.push(line);
  }
  return block.join('\n');
}

const membershipPatch = spawnSync(process.execPath, [full('scripts/patch-membership-tiers.js')], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
  maxBuffer: 20 * 1024 * 1024,
  env: process.env
});
if (membershipPatch.status !== 0) fail(`canonical membership restore failed: ${membershipPatch.stderr || membershipPatch.stdout}`);
if (exists('membership.html') && exists('_site')) {
  fs.copyFileSync(full('membership.html'), full('_site/membership.html'));
  const extensionless = full('_site/membership');
  if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(full('membership.html'), extensionless);
  if (exists('paypal-membership.js')) fs.copyFileSync(full('paypal-membership.js'), full('_site/paypal-membership.js'));
}

[
  'src/worker.js', 'src/worker-forum-persistence.js', 'src/worker-member-experience.js',
  'src/worker-paypal-subscriptions.js', 'src/worker-production.js',
  'wrangler.toml', 'wrangler.jsonc', '_headers',
  'membership.html', 'paypal-membership.js', 'billing-dashboard.html', 'billing-dashboard.js',
  'admin-payment-dashboard.html', 'admin-payment-dashboard.js',
  'scripts/templates/membership-auth/membership.template',
  'scripts/templates/membership-auth/newsletter.template.js',
  'data/membership-tiers.json',
  'migrations/0001_membership_foundation.sql', 'migrations/0004_forum_persistence.sql',
  'migrations/phase5_member_experience.sql', 'migrations/phase6_paypal_subscriptions.sql',
  'migrations/phase6_paypal_failure_counter_fix.sql',
  'scripts/build-cloudflare-output.js', 'scripts/build-production-health.js',
  'scripts/final-production-reconcile.js', 'scripts/forum-persistence-d1-test.js',
  'scripts/patch-membership-tiers.js', 'scripts/patch-membership-auth-ui.js',
  'scripts/repair-generated-site-artifacts.js',
  '_site/index.html', '_site/index', '_site/search.html', '_site/search',
  '_site/membership.html', '_site/membership', '_site/paypal-membership.js',
  '_site/forum.html', '_site/forum'
].forEach(need);

if (exists('_site/_redirects')) fail('_site/_redirects must not be deployed with Worker assets');

for (const marker of [
  "import forumWorker from './worker-forum-persistence.js'",
  "import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js'",
  'members-db-binding-unavailable', 'non-authoritative-forum-response-blocked',
  'non-authoritative-paypal-response-blocked', "origin !== 'cloudflare-worker-forum-d1'",
  "origin !== 'cloudflare-worker-paypal-subscriptions'", 'isPayPalRoute(path)', 'status: 503'
]) needText('src/worker-production.js', marker, `strict production marker ${marker}`);

for (const marker of [
  'Cloudflare D1 MEMBERS_DB.forum_posts', 'CREATE TABLE IF NOT EXISTS forum_posts',
  'INSERT OR IGNORE INTO forum_posts', 'INSERT INTO forum_reports',
  'kv_forum_migration_v1', "prefix: 'post:'", 'D1 authoritative; KV compatibility mirror'
]) needText('src/worker-forum-persistence.js', marker, `D1 forum marker ${marker}`);

for (const marker of [
  'cloudflare-worker-paypal-subscriptions', '/api/paypal/config', '/api/paypal/checkout-intent',
  '/api/paypal/subscription/confirm', '/api/paypal/subscription/cancel', '/api/paypal/webhook',
  '/api/paypal/admin/activation', '/v1/notifications/verify-webhook-signature',
  'PAYPAL_SANDBOX_ENABLED', 'PAYPAL_PRODUCTION_ENABLED',
  'PAYPAL_LIVE_ACTIVATION_CONFIRMATION', 'paypal_runtime_settings',
  "if(!state.checkoutEnabled)return json", 'plansReady', 'checkoutEnabled'
]) needText('src/worker-paypal-subscriptions.js', marker, `PayPal Worker marker ${marker}`);

const membershipFiles = [
  'scripts/templates/membership-auth/membership.template',
  'membership.html',
  '_site/membership.html'
];
for (const marker of [
  'Free Member', '€0', '€3', '€6', '€9', 'paypal-membership.js',
  'paypal-membership-status', 'paypal-button-supporter', 'paypal-button-intelligence',
  'paypal-button-research_pro',
  'Paid memberships are opening soon. Free Member registration is available now.',
  'Create or access free account',
  'Checkout approval alone never grants access.',
  'Only the verified €6 plan can grant the Intelligence tier.',
  'Only the verified €9 plan can grant Research Pro.',
  'membership-terms.html', 'terms-of-use.html'
]) {
  for (const file of membershipFiles) needText(file, marker, `launch-safe membership marker ${marker}`);
}
for (const file of membershipFiles) {
  forbidText(file, 'Coming soon — no payment taken', 'obsolete deferred membership page');
  forbidText(file, 'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.', 'reader-visible implementation gate language');
  forbidText(file, 'Join Placeholder', 'join placeholder');
  forbidText(file, 'Monthly donation', 'obsolete donation wording');
  forbidText(file, '€19/month', 'legacy €19 tier');
  forbidText(file, '€49/month', 'legacy €49 tier');
}
needText('scripts/patch-membership-tiers.js', "scripts', 'templates', 'membership-auth', 'membership.template", 'true canonical membership template owner');
needText('scripts/patch-membership-auth-ui.js', 'newsletter.template.js', 'canonical newsletter runtime restoration');
for (const marker of ['marketingConsent', 'public_daily_brief:preferences.daily', 'public_weekly_digest:preferences.weekly', 'release_notices:preferences.release']) {
  needText('scripts/templates/membership-auth/newsletter.template.js', marker, `newsletter contract ${marker}`);
}

for (const marker of ['/api/paypal/checkout-intent', '/api/paypal/subscription/confirm', 'checkoutEnabled']) {
  needText('paypal-membership.js', marker, `PayPal membership runtime ${marker}`);
  needText('_site/paypal-membership.js', marker, `built PayPal membership runtime ${marker}`);
}
needText('billing-dashboard.html', 'billing-dashboard.js');
needText('billing-dashboard.html', 'membership-terms.html', 'billing membership terms link');
needText('admin-payment-dashboard.html', 'admin-payment-dashboard.js');

for (const marker of ['paypal_runtime_settings', 'paypal_products', 'paypal_plans', 'paypal_subscription_transitions', 'paypal_payment_records']) {
  needText('migrations/phase6_paypal_subscriptions.sql', marker, `Phase 6 migration marker ${marker}`);
}
needText('migrations/phase6_paypal_failure_counter_fix.sql', 'paypal_preserve_failure_count_on_failed_snapshot');

for (const marker of [
  'main = "src/worker-production.js"', 'directory = "./_site"', 'binding = "ASSETS"',
  'run_worker_first = true', 'binding = "FORUM_POSTS"', 'binding = "MEMBERS_DB"',
  'database_name = "matrix-members"', 'c6e465d3-4e36-4a00-b8f8-309447240c52',
  'PAYPAL_ENVIRONMENT = "sandbox"', 'PAYPAL_PRODUCTION_ENABLED = "false"',
  'COMMERCIAL_LAUNCH_APPROVED = "false"', 'EMAIL_AUTOMATION_ENABLED = "false"',
  'EMAIL_TRANSACTIONAL_ENABLED = "true"'
]) needText('wrangler.toml', marker, `wrangler.toml marker ${marker}`);
for (const marker of [
  '"main": "src/worker-production.js"', '"binding": "ASSETS"',
  '"binding": "FORUM_POSTS"', '"binding": "MEMBERS_DB"',
  '"database_name": "matrix-members"', '"pattern": "matrixreprogrammed.com/*"',
  '"pattern": "www.matrixreprogrammed.com/*"'
]) needText('wrangler.jsonc', marker, `wrangler.jsonc marker ${marker}`);

needText('_headers', 'Strict-Transport-Security', 'HSTS header');
const headersText = read('_headers');
for (const route of ['/*.css', '/*.js']) {
  const block = headerRuleBlock(headersText, route);
  if (!block) fail(`_headers: missing ${route} cache rule`);
  else if (/max-age=31536000[^\n]*immutable/i.test(block)) fail(`_headers: ${route} must not use year-long immutable caching`);
}
needText('scripts/build-cloudflare-output.js', 'copyHtmlRouteVariant', 'extensionless route copier');
needText('scripts/final-production-reconcile.js', 'paypal-membership.js', 'final PayPal membership reconciliation');
needText('scripts/final-production-reconcile.js', 'SANDBOX READY / CHECKOUT DISABLED', 'final payment guard');
needText('scripts/build-production-health.js', "workerScript: 'src/worker-production.js'", 'strict Worker health identity');
needText('scripts/build-production-health.js', "paymentStatus: 'sandbox-ready-disabled'", 'sandbox-ready disabled health status');
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
  workerEntrypoint: 'src/worker-production.js',
  forumStorage: 'Cloudflare D1 authoritative with KV compatibility/recovery only',
  paymentStatus: 'sandbox-ready-disabled',
  emailStatus: 'transactional-enabled-scheduled-marketing-disabled',
  boundary: 'Reader-facing membership copy stays useful and non-technical. Server activation, verified plans, D1 state and webhook verification remain the authoritative fail-closed controls.'
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
console.log('Checked strict routing, D1 forums, launch-safe membership restoration, PayPal fail-closed gates, email state, bindings and commit-bound health.');
