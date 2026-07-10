const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const problems = [];
const exists = file => fs.existsSync(path.join(root, file));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = msg => problems.push(msg);
const requireFile = file => { if (!exists(file)) fail(`missing required file: ${file}`); };
const requireIncludes = (file, text, label = text) => {
  if (!exists(file)) return;
  if (!read(file).includes(text)) fail(`${file}: missing ${label}`);
};
const requireAnyIncludes = (file, texts, label) => {
  if (!exists(file)) return;
  const body = read(file);
  if (!texts.some(text => body.includes(text))) fail(`${file}: missing ${label}`);
};
const forbidIncludes = (file, text, label = text) => {
  if (!exists(file)) return;
  if (read(file).includes(text)) fail(`${file}: should not contain ${label}`);
};

function runPatch(script, label) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 40 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status}`);
}

runPatch('scripts/patch-worker-newsletter-system.js', 'membership Worker patch');
runPatch('scripts/patch-membership-auth-ui.js', 'membership auth UI patch');

[
  'src/worker.js',
  'wrangler.toml',
  'wrangler.jsonc',
  '_headers',
  'migrations/0001_membership_foundation.sql',
  'migrations/0002_paypal_subscriptions.sql',
  'scripts/build-cloudflare-output.js',
  'scripts/patch-worker-pages-origin.js',
  'scripts/patch-worker-membership-auth.js',
  'scripts/patch-worker-paypal-membership.js',
  'scripts/patch-membership-auth-ui.js',
  'scripts/membership-auth-test.js',
  'package.json',
  'membership.html',
  'member-login.html',
  'member-dashboard.html',
  '_site/index.html',
  '_site/index',
  '_site/search.html',
  '_site/search',
  '_site/books.html',
  '_site/books',
  '_site/live-intel.html',
  '_site/live-intel',
  '_site/epstein-files.html',
  '_site/epstein-files',
  '_site/forum.html',
  '_site/forum',
  '_site/membership.html',
  '_site/membership',
  '_site/member-login.html',
  '_site/member-login',
  '_site/member-dashboard.html',
  '_site/member-dashboard',
  '_site/deploy-status.html',
  '_site/deploy-status'
].forEach(requireFile);

if (exists('_site/_redirects')) fail('_site/_redirects must not be deployed with Worker assets');

requireIncludes('src/worker.js', 'const routeAliases = {', 'routeAliases map');
requireIncludes('src/worker.js', 'routeAliases[originalPath]', 'original route alias lookup');
requireIncludes('src/worker.js', 'routeAliases[normalizedPath]', 'normalized route alias lookup');
requireIncludes('src/worker.js', 'env.ASSETS.fetch', 'bundled Worker asset fetch');
requireAnyIncludes('src/worker.js', ["X-Matrix-Origin', 'cloudflare-worker-assets", "X-Matrix-Origin', 'worker-assets"], 'worker asset origin header');
requireIncludes('src/worker.js', '/forum-health', 'forum health endpoint');
requireIncludes('src/worker.js', '/forum-feed', 'forum feed endpoint');
requireIncludes('src/worker.js', '/submit-forum-post', 'forum submit endpoint');
requireIncludes('src/worker.js', '/report-forum-post', 'forum report endpoint');
requireIncludes('src/worker.js', '/downloads/forum-posts.json', 'forum JSON export');
requireIncludes('src/worker.js', '/downloads/forum-posts.md', 'forum Markdown export');
requireIncludes('src/worker.js', '/track-event', 'analytics endpoint');
requireIncludes('src/worker.js', '/intro-voice', 'intro voice endpoint');
requireIncludes('src/worker.js', '/api/membership/signup', 'membership signup endpoint');
requireIncludes('src/worker.js', '/api/membership/health', 'membership health endpoint');
requireIncludes('src/worker.js', '/api/auth/request-link', 'magic-link request endpoint');
requireIncludes('src/worker.js', '/api/auth/verify', 'magic-link verification endpoint');
requireIncludes('src/worker.js', '/api/auth/logout', 'member logout endpoint');
requireIncludes('src/worker.js', '/api/auth/health', 'auth health endpoint');
requireIncludes('src/worker.js', '/api/member/me', 'member identity endpoint');
requireIncludes('src/worker.js', '/api/paypal/config', 'PayPal public configuration endpoint');
requireIncludes('src/worker.js', '/api/paypal/checkout-intent', 'PayPal checkout intent endpoint');
requireIncludes('src/worker.js', '/api/paypal/subscription/confirm', 'PayPal confirmation endpoint');
requireIncludes('src/worker.js', '/api/paypal/subscription/cancel', 'PayPal cancellation endpoint');
requireIncludes('src/worker.js', '/api/paypal/webhook', 'PayPal webhook endpoint');
requireIncludes('src/worker.js', '/api/paypal/health', 'PayPal health endpoint');
requireIncludes('src/worker.js', '/v1/notifications/verify-webhook-signature', 'PayPal webhook signature verification');
requireIncludes('src/worker.js', '/v1/billing/subscriptions/', 'PayPal server-side subscription lookup');
requireIncludes('src/worker.js', 'paypal_checkout_intents', 'PayPal checkout-intent D1 usage');
requireIncludes('src/worker.js', "paypalPaidStatus(value){return paypalSafeStatus(value)==='ACTIVE'}", 'ACTIVE-only paid access rule');
requireIncludes('src/worker.js', 'api.brevo.com/v3/smtp/email', 'Brevo transactional email delivery');
requireIncludes('src/worker.js', "crypto.subtle.digest('SHA-256'", 'hashed auth tokens');
requireIncludes('src/worker.js', 'MEMBERS_DB', 'membership D1 usage');
requireIncludes('src/worker.js', 'FORUM_POSTS', 'FORUM_POSTS binding usage');
requireIncludes('src/worker.js', 'ELEVENLABS_API_KEY', 'ElevenLabs secret usage');

requireIncludes('membership.html', '/api/membership/signup', 'live membership signup call');
requireIncludes('membership.html', 'marketingConsent', 'explicit marketing consent field');
requireIncludes('membership.html', '/api/paypal/config', 'PayPal configuration call');
requireIncludes('membership.html', '/api/paypal/checkout-intent', 'PayPal checkout-intent call');
requireIncludes('membership.html', '/api/paypal/subscription/confirm', 'PayPal server confirmation call');
requireIncludes('membership.html', 'actions.subscription.create', 'PayPal subscription button flow');
requireIncludes('member-login.html', '/api/auth/request-link', 'passwordless login request call');
requireIncludes('member-dashboard.html', '/api/member/me', 'member identity request');
requireIncludes('member-dashboard.html', '/api/auth/logout', 'member logout request');
requireIncludes('member-dashboard.html', '/api/paypal/subscription/cancel', 'PayPal cancellation request');
requireIncludes('member-dashboard.html', 'paidAccessEnabled', 'server entitlement display');
requireIncludes('_site/membership.html', '/api/paypal/subscription/confirm', 'deployed PayPal confirmation call');
requireIncludes('_site/member-login.html', '/api/auth/request-link', 'deployed login request call');
requireIncludes('_site/member-dashboard.html', '/api/paypal/subscription/cancel', 'deployed PayPal cancellation call');

requireIncludes('migrations/0001_membership_foundation.sql', 'CREATE TABLE IF NOT EXISTS paypal_checkout_intents', 'PayPal checkout-intent table in deployment migration');
requireIncludes('migrations/0001_membership_foundation.sql', 'CREATE TABLE IF NOT EXISTS payment_webhook_events', 'PayPal webhook event table');
requireIncludes('migrations/0001_membership_foundation.sql', 'provider_subscription_id TEXT UNIQUE', 'unique PayPal subscription identifier');

forbidIncludes('src/worker.js', 'PAGES_STATIC_ORIGIN', 'stale Pages origin constant');
forbidIncludes('src/worker.js', 'matrixreprogrammed.pages.dev', 'stale Pages origin URL');
forbidIncludes('src/worker.js', 'STATIC_ORIGIN ||', 'stale origin override');
forbidIncludes('src/worker.js', 'cacheEverything', 'stale origin cache path');
forbidIncludes('src/worker.js', 'clientSecret:', 'PayPal client secret in JSON response');

requireIncludes('wrangler.toml', 'main = "src/worker.js"', 'Worker entrypoint');
requireIncludes('wrangler.toml', 'directory = "./_site"', 'asset directory');
requireIncludes('wrangler.toml', 'binding = "ASSETS"', 'ASSETS binding');
requireIncludes('wrangler.toml', 'FORUM_POSTS', 'FORUM_POSTS KV binding');
requireIncludes('wrangler.toml', 'binding = "MEMBERS_DB"', 'MEMBERS_DB D1 binding');
requireIncludes('wrangler.toml', 'database_name = "matrix-members"', 'matrix-members D1 database');
requireIncludes('wrangler.toml', 'c6e465d3-4e36-4a00-b8f8-309447240c52', 'production D1 database ID');

requireIncludes('wrangler.jsonc', '"main": "src/worker.js"', 'active Worker entrypoint');
requireIncludes('wrangler.jsonc', '"binding": "ASSETS"', 'active ASSETS binding');
requireIncludes('wrangler.jsonc', '"binding": "FORUM_POSTS"', 'active FORUM_POSTS binding');
requireIncludes('wrangler.jsonc', '"binding": "MEMBERS_DB"', 'active MEMBERS_DB D1 binding');
requireIncludes('wrangler.jsonc', '"database_name": "matrix-members"', 'active matrix-members D1 database');
requireIncludes('wrangler.jsonc', '"database_id": "c6e465d3-4e36-4a00-b8f8-309447240c52"', 'active production D1 database ID');
requireIncludes('wrangler.jsonc', '"pattern": "matrixreprogrammed.com/*"', 'active apex Worker route');
requireIncludes('wrangler.jsonc', '"pattern": "www.matrixreprogrammed.com/*"', 'active www Worker route');

requireIncludes('_headers', 'Strict-Transport-Security', 'HSTS header');
requireIncludes('_headers', 'immutable', 'immutable cache header');
requireIncludes('scripts/build-cloudflare-output.js', 'copyHtmlRouteVariant', 'extensionless route copier');
requireIncludes('scripts/build-cloudflare-output.js', 'Cloudflare output ready', 'output success marker');
requireIncludes('package.json', 'patch-worker-pages-origin.js', 'Worker asset patch in build');
requireIncludes('package.json', 'build-cloudflare-output.js', 'Cloudflare output builder in build');
requireIncludes('package.json', 'cloudflare-worker-routes-test.js', 'Cloudflare route test in build');

for (const testFile of ['forum-board-split-test.js', 'newsletter-system-test.js', 'cloudflare-error-hardening-test.js']) {
  const testPath = path.join(root, 'scripts', testFile);
  if (!fs.existsSync(testPath)) continue;
  try { require(testPath); } catch (error) { fail(`${testFile}: ${error.message}`); }
}

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}

console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked Worker assets, forum routes, D1 membership capture, passwordless auth, PayPal verification and webhooks, canonical member pages, active bindings, analytics, headers and build wiring.');
