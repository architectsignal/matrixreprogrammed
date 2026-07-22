const fs = require('fs');
const path = require('path');

const root = process.cwd();
require('./harden-worker-api-contracts.js');
require('./patch-member-login-paypal-newsletter.js');
require('./patch-money-graph-root-data.js');
const templateDir = path.join(root, 'scripts', 'templates', 'membership-auth');
const siteDir = path.join(root, '_site');
const pages = [
  { name: 'membership.html', template: path.join(templateDir, 'membership.template') },
  { name: 'member-login.html', template: path.join(root, 'member-login.html') },
  { name: 'member-dashboard.html', template: path.join(root, 'member-dashboard.html') }
];

const changed = [];

function writeIfDifferent(target, content) {
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (before === content) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return true;
}

for (const page of pages) {
  if (!fs.existsSync(page.template)) {
    console.error(`Membership auth UI patch failed: template missing for ${page.name}`);
    process.exit(1);
  }
  const content = fs.readFileSync(page.template, 'utf8');
  const rootTarget = path.join(root, page.name);
  if (writeIfDifferent(rootTarget, content)) changed.push(page.name);
  if (fs.existsSync(siteDir)) {
    const htmlTarget = path.join(siteDir, page.name);
    const extensionlessTarget = path.join(siteDir, page.name.replace(/\.html$/i, ''));
    if (writeIfDifferent(htmlTarget, content)) changed.push(`_site/${page.name}`);
    if (writeIfDifferent(extensionlessTarget, content)) changed.push(`_site/${page.name.replace(/\.html$/i, '')}`);
  }
}

for (const required of [
  ['membership.html', '/api/membership/signup'],
  ['membership.html', 'marketingConsent'],
  ['membership.html', 'consent:marketingConsent'],
  ['membership.html', '/api/paypal/config'],
  ['membership.html', '/api/paypal/checkout-intent'],
  ['membership.html', '/api/paypal/subscription/confirm'],
  ['membership.html', 'actions.subscription.create'],
  ['membership.html', 'config.checkoutEnabled'],
  ['membership.html', 'data.verification && data.verification.sent'],
  ['membership.html', 'Paid access is already active'],
  ['membership.html', 'Manage billing'],
  ['member-login.html', '/api/auth/request-link'],
  ['member-dashboard.html', '/api/member/me'],
  ['member-dashboard.html', '/api/auth/logout'],
  ['member-dashboard.html', '/api/paypal/subscription/cancel'],
  ['member-dashboard.html', 'paidAccessEnabled'],
  ['member-dashboard.html', 'id="membership-action"'],
  ['email-status.html', 'Open member login']
]) {
  const file = path.join(root, required[0]);
  if (!fs.readFileSync(file, 'utf8').includes(required[1])) {
    console.error(`Membership auth UI patch failed: ${required[0]} missing ${required[1]}`);
    process.exit(1);
  }
}

for (const required of [
  ['wrangler.toml', 'main = "src/worker-production.js"'],
  ['wrangler.toml', 'binding = "MEMBERS_DB"'],
  ['wrangler.toml', 'binding = "ASSETS"'],
  ['src/worker-production.js', 'isMemberExperienceRoute'],
  ['src/worker-production.js', 'isPayPalRoute'],
  ['src/worker-production.js', 'emailRoutes.has(path)'],
  ['src/worker-paypal-subscriptions.js', 'values.matrix_session_v2||values.matrix_session'],
  ['src/worker-paypal-subscriptions.js', 'currentSubscriptionForMember'],
  ['src/worker-paypal-subscriptions.js', 'An active PayPal membership already exists'],
  ['src/worker-paypal-subscriptions.js', "billingUrl:'/billing-dashboard.html'"],
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
  const file = path.join(root, required[0]);
  if (!fs.readFileSync(file, 'utf8').includes(required[1])) {
    console.error(`Cloudflare membership integration verification failed: ${required[0]} missing ${required[1]}`);
    process.exit(1);
  }
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
  changed,
  pages: pages.map(page => page.name),
  paypalCheckout: true,
  paidAccessPolicy: 'Server-verified PayPal ACTIVE subscriptions only; a second checkout is blocked while paid entitlement is active',
  sessionCookiePolicy: 'PayPal, billing, protected assets and member services accept matrix_session_v2 with legacy matrix_session fallback',
  newsletterConsentPolicy: 'Membership and newsletter forms send canonical explicit consent; the server retains compatibility for marketingConsent',
  newsletterDeliveryPolicy: 'Welcome email and selected first daily brief are delivered through the D1 outbox and Brevo lifecycle; the detailed intelligence builder falls back safely',
  dashboardTierPolicy: 'Free dashboards do not call Intelligence-only watchlist routes during initial loading; paid members are routed to billing management',
  dataRoutePolicy: 'Shared Cloudflare asset scripts use canonical root data routes so nested source pages and public routes load identical generated datasets',
  boundary: 'Canonical membership, passwordless authentication, protected assets and PayPal subscription pages are restored before Cloudflare Assets are copied to both HTML and extensionless routes.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'membership-auth-ui-patch.json'), JSON.stringify(report, null, 2));
console.log(`Cloudflare membership auth UI patched: ${changed.length ? changed.join(', ') : 'already current'}`);
