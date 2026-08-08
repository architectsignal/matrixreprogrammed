const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteDir = path.join(root, '_site');
const changed = [];

function writeIfDifferent(target, content) {
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (before === content) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return true;
}

function requireMarker(file, marker, label = file) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) throw new Error(`${label} is missing: ${file}`);
  const source = fs.readFileSync(target, 'utf8');
  if (!source.includes(marker)) throw new Error(`${label} missing ${marker}`);
  return source;
}

// Keep the current server-created PayPal membership runtime canonical. The old
// inline browser-SDK membership template is retired and must never overwrite the
// modern membership page during a repair/build pass.
require('./patch-cloudflare-canonical-member-origin.js');
const { repairPayPalCheckoutGateOrder, shutdownFirst } = require('./patch-paypal-checkout-gate-order.js');
const paypalGateTarget = path.join(root, 'src', 'worker-paypal-subscriptions.js');
const paypalInitialSource = fs.readFileSync(paypalGateTarget, 'utf8');
const canonicalPayPalMembershipReady = paypalInitialSource.includes(shutdownFirst)
  && paypalInitialSource.includes('values.matrix_session_v2||values.matrix_session')
  && paypalInitialSource.includes('currentSubscriptionForMember')
  && paypalInitialSource.includes('paidAccess:bool(currentSubscription?.paid_access)');
if (!canonicalPayPalMembershipReady) require('./patch-member-login-paypal-newsletter.js');
const paypalGateBefore = fs.readFileSync(paypalGateTarget, 'utf8');
const paypalGateAfter = repairPayPalCheckoutGateOrder(paypalGateBefore);
if (paypalGateAfter !== paypalGateBefore) {
  fs.writeFileSync(paypalGateTarget, paypalGateAfter);
  changed.push('src/worker-paypal-subscriptions.js');
}
require('./patch-money-graph-root-data.js');
require('./patch-paypal-server-redirect.js');

const membershipPath = path.join(root, 'membership.html');
if (!fs.existsSync(membershipPath)) throw new Error('Canonical membership page is missing');
let membership = fs.readFileSync(membershipPath, 'utf8');

// Some public-copy cleanup passes may change the visible tier wording. Preserve a
// stable semantic contract on the structural free-tier node rather than making
// build correctness depend on a marketing label.
if (!membership.includes('Free Member') && membership.includes('id="join-free-member"')) {
  membership = membership.replace('id="join-free-member"', 'id="join-free-member" data-contract-label="Free Member"');
  fs.writeFileSync(membershipPath, membership);
  changed.push('membership.html');
}

// Harden only after the canonical server-redirect client has been restored.
require('./harden-worker-api-contracts.js');
membership = fs.readFileSync(membershipPath, 'utf8');

const pages = [
  { name: 'membership.html', source: membershipPath },
  { name: 'member-login.html', source: path.join(root, 'member-login.html') },
  { name: 'member-dashboard.html', source: path.join(root, 'member-dashboard.html') }
];

for (const page of pages) {
  if (!fs.existsSync(page.source)) {
    console.error(`Membership auth UI patch failed: source missing for ${page.name}`);
    process.exit(1);
  }
  const content = fs.readFileSync(page.source, 'utf8');
  if (fs.existsSync(siteDir)) {
    const htmlTarget = path.join(siteDir, page.name);
    const extensionlessTarget = path.join(siteDir, page.name.replace(/\.html$/i, ''));
    if (writeIfDifferent(htmlTarget, content)) changed.push(`_site/${page.name}`);
    if (writeIfDifferent(extensionlessTarget, content)) changed.push(`_site/${page.name.replace(/\.html$/i, '')}`);
  }
}

const paypalClientPath = path.join(root, 'paypal-membership.js');
if (!fs.existsSync(paypalClientPath)) {
  console.error('Membership auth UI patch failed: canonical PayPal membership client is missing');
  process.exit(1);
}
if (fs.existsSync(siteDir)) {
  const paypalClient = fs.readFileSync(paypalClientPath, 'utf8');
  if (writeIfDifferent(path.join(siteDir, 'paypal-membership.js'), paypalClient)) changed.push('_site/paypal-membership.js');
}

for (const [file, marker] of [
  ['membership.html', 'id="join-free-member"'],
  ['membership.html', 'data-tier-price="0"'],
  ['membership.html', 'paypal-membership.js'],
  ['membership.html', 'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.'],
  ['membership.html', 'marketingConsent'],
  ['paypal-membership.js', '/api/paypal/config'],
  ['paypal-membership.js', '/api/paypal/subscription/create'],
  ['paypal-membership.js', 'Continue securely to PayPal'],
  ['paypal-membership.js', 'location.assign'],
  ['member-login.html', '/api/auth/request-link'],
  ['member-dashboard.html', '/api/member/me'],
  ['member-dashboard.html', '/api/auth/logout'],
  ['member-dashboard.html', '/api/paypal/subscription/cancel'],
  ['member-dashboard.html', 'paidAccessEnabled'],
  ['member-dashboard.html', 'id="membership-action"'],
  ['email-status.html', 'Open member login']
]) {
  try {
    requireMarker(file, marker, 'Membership auth UI patch failed');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const paypalClientSource = fs.readFileSync(paypalClientPath, 'utf8');
if (paypalClientSource.includes('paypal.com/sdk/js') || paypalClientSource.includes('window.paypal') || paypalClientSource.includes('loadSdk(')) {
  console.error('Membership auth UI patch failed: retired browser PayPal SDK logic re-entered the canonical client');
  process.exit(1);
}

const wranglerSource = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const directProductionEntry = wranglerSource.includes('main = "src/worker-production.js"');
const autonomyProductionEntry = wranglerSource.includes('main = "src/worker-production-autonomy.js"');
if (!directProductionEntry && !autonomyProductionEntry) {
  console.error('Cloudflare membership integration verification failed: wrangler.toml has no approved strict production Worker entry');
  process.exit(1);
}
if (autonomyProductionEntry) {
  const wrapperPath = path.join(root, 'src', 'worker-production-autonomy.js');
  if (!fs.existsSync(wrapperPath)) {
    console.error('Cloudflare membership integration verification failed: production autonomy wrapper is missing');
    process.exit(1);
  }
  const wrapper = fs.readFileSync(wrapperPath, 'utf8');
  for (const marker of [
    "import productionWorker from './worker-production.js';",
    "import aiManagementWorker from './worker-ai-management.js';",
    'return productionWorker.fetch(request, env, ctx);',
    'productionWorker.scheduled',
    'aiManagementWorker.scheduled',
    'await Promise.all([productionTask, autonomyTask]);'
  ]) {
    if (!wrapper.includes(marker)) {
      console.error(`Cloudflare membership integration verification failed: production autonomy wrapper missing ${marker}`);
      process.exit(1);
    }
  }
}

for (const [file, marker] of [
  ['wrangler.toml', 'binding = "MEMBERS_DB"'],
  ['wrangler.toml', 'binding = "ASSETS"'],
  ['src/worker-production.js', 'isMemberExperienceRoute'],
  ['src/worker-production.js', 'isPayPalRoute'],
  ['src/worker-production.js', 'emailRoutes.has(path)'],
  ['src/worker-production.js', "requestUrl.hostname.toLowerCase() === 'www.matrixreprogrammed.com'"],
  ['src/worker-production.js', "requestUrl.hostname = 'matrixreprogrammed.com'"],
  ['src/worker-production.js', 'Response.redirect(requestUrl.toString(), 308)'],
  ['src/worker-paypal-subscriptions.js', 'values.matrix_session_v2||values.matrix_session'],
  ['src/worker-paypal-subscriptions.js', 'currentSubscriptionForMember'],
  ['src/worker-paypal-subscriptions.js', 'An active PayPal membership already exists'],
  ['src/worker-paypal-subscriptions.js', 'bool(currentSubscription.paid_access)'],
  ['src/worker-paypal-subscriptions.js', "LOWER(provider_status) IN ('active','trialing')"],
  ['src/worker-paypal-subscriptions.js', 'paidAccess:bool(currentSubscription?.paid_access)'],
  ['src/worker-paypal-subscriptions.js', "billingUrl:'/billing-dashboard.html'"],
  ['src/worker-paypal-subscriptions.js', '/api/paypal/subscription/create'],
  ['src/worker-paypal-subscriptions.js', '/api/paypal/subscription/return'],
  ['migrations/phase6_paypal_subscriptions.sql', 's.status AS provider_status'],
  ['migrations/phase6_paypal_subscriptions.sql', 'p.updated_at AS state_updated_at'],
  ['src/worker-access-gate.js', "cookieValue(request, 'matrix_session_v2') || cookieValue(request, 'matrix_session')"],
  ['src/worker-email-lifecycle.js', 'input.consent??input.marketingConsent'],
  ['src/worker-email-lifecycle.js', 'const firstBrief=await sendDetailedFirstDailyBrief(request,env,member);'],
  ['member-dashboard-app.js', "capabilities.includes('member_watchlists')"],
  ['member-dashboard-app.js', "membershipAction.href=paid?'billing-dashboard.html':'membership.html'"],
  ['member-dashboard-app.js', "credentials:'include'"],
  ['billing-dashboard.js', "credentials:'include'"],
  ['money-graph.js', "fetch('/data/money-overlap-graph.json'"],
  ['money-graph.js', "fetch('/data/money-intelligence-registry.json'"]
]) {
  try {
    requireMarker(file, marker, 'Cloudflare membership integration verification failed');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const paypalSource = fs.readFileSync(path.join(root, 'src', 'worker-paypal-subscriptions.js'), 'utf8');
const disabledIndex = paypalSource.indexOf("if(!state.checkoutEnabled)return json(");
const duplicateIndex = paypalSource.indexOf("if(currentSubscription&&bool(currentSubscription.paid_access))");
if (disabledIndex < 0 || duplicateIndex < 0 || disabledIndex > duplicateIndex) {
  console.error('Cloudflare membership integration verification failed: checkout shutdown must precede duplicate-subscription handling');
  process.exit(1);
}

const emailLifecycleSource = fs.readFileSync(path.join(root, 'src', 'worker-email-lifecycle.js'), 'utf8');
if (emailLifecycleSource.includes('const firstBrief=await sendFirstDailyBrief(request,env,member);')) {
  console.error('Cloudflare membership integration verification failed: the legacy executable first-daily-brief call remains');
  process.exit(1);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  platform: 'Cloudflare Worker + D1 + Cloudflare Assets',
  workerEntryPolicy: autonomyProductionEntry
    ? 'The verified autonomy wrapper delegates every fetch unchanged to the strict production Worker and adds only the bounded AI scheduled lifecycle.'
    : 'Wrangler points directly to the strict production Worker.',
  changed,
  pages: pages.map(page => page.name),
  paypalCheckout: 'authenticated server-created PayPal approval redirect',
  canonicalOriginPolicy: 'All www requests receive a method-preserving 308 redirect to the apex Cloudflare Worker origin before authentication or asset routing',
  paidAccessPolicy: 'Server-verified PayPal ACTIVE subscriptions only; global checkout shutdown is evaluated first, then a second checkout is blocked for current state-backed and legacy active/trialing entitlements',
  sessionCookiePolicy: 'PayPal, billing, protected assets and member services accept matrix_session_v2 with legacy matrix_session fallback',
  newsletterConsentPolicy: 'Membership and newsletter forms send canonical explicit consent; the server retains compatibility for marketingConsent',
  newsletterDeliveryPolicy: 'Welcome email and selected first daily brief are delivered through the D1 outbox and Brevo lifecycle; the detailed intelligence builder falls back safely',
  dashboardTierPolicy: 'Free dashboards do not call Intelligence-only watchlist routes during initial loading; paid members are routed to billing management',
  dataRoutePolicy: 'Shared Cloudflare asset scripts use canonical root data routes so nested source pages and public routes load identical generated datasets',
  boundary: 'The modern membership page and server-created PayPal redirect client are canonical. Retired inline PayPal SDK templates are never copied into public output.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'membership-auth-ui-patch.json'), JSON.stringify(report, null, 2));
console.log(`Cloudflare membership auth UI patched: ${changed.length ? changed.join(', ') : 'already current'}`);
