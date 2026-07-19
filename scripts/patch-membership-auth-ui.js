const fs = require('fs');
const path = require('path');

const root = process.cwd();
require('./harden-worker-api-contracts.js');
require('./ensure-billing-commercial-terms.js');
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
  ['membership.html', 'data-newsletter-form'],
  ['membership.html', 'newsletter.js'],
  ['membership.html', 'paypal-membership.js'],
  ['membership.html', 'paypal-membership-status'],
  ['membership.html', 'paypal-button-supporter'],
  ['membership.html', 'paypal-button-intelligence'],
  ['membership.html', 'paypal-button-research_pro'],
  ['membership.html', 'Paid memberships are opening soon. Free Member registration is available now.'],
  ['membership.html', 'membership-terms.html'],
  ['membership.html', 'terms-of-use.html'],
  ['member-login.html', '/api/auth/request-link'],
  ['member-dashboard.html', '/api/member/me'],
  ['member-dashboard.html', '/api/auth/logout'],
  ['member-dashboard.html', '/api/paypal/subscription/cancel'],
  ['member-dashboard.html', 'paidAccessEnabled'],
  ['newsletter.js', '/newsletter-signup'],
  ['newsletter.js', 'marketingConsent'],
  ['newsletter.js', 'public_daily_brief:preferences.daily'],
  ['newsletter.js', 'public_weekly_digest:preferences.weekly'],
  ['newsletter.js', 'release_notices:preferences.release'],
  ['paypal-membership.js', '/api/paypal/config'],
  ['paypal-membership.js', '/api/paypal/checkout-intent'],
  ['paypal-membership.js', '/api/paypal/subscription/confirm'],
  ['paypal-membership.js', 'actions.subscription.create'],
  ['paypal-membership.js', 'checkoutEnabled'],
  ['billing-dashboard.html', 'data-billing-commercial-terms'],
  ['billing-dashboard.html', 'membership-terms.html'],
  ['billing-dashboard.html', 'terms-of-use.html']
]) {
  const file = path.join(root, required[0]);
  if (!fs.readFileSync(file, 'utf8').includes(required[1])) {
    console.error(`Membership auth UI patch failed: ${required[0]} missing ${required[1]}`);
    process.exit(1);
  }
}

for (const forbidden of ['Join Placeholder', 'Monthly donation', '€19/month', '€49/month', 'activation gates']) {
  if (fs.readFileSync(path.join(root, 'membership.html'), 'utf8').includes(forbidden)) {
    console.error(`Membership auth UI patch failed: membership.html contains obsolete marker ${forbidden}`);
    process.exit(1);
  }
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  pages: pages.map(page => page.name),
  runtimes: {
    signup: 'newsletter.js → /newsletter-signup',
    payment: 'paypal-membership.js',
    authentication: 'member-login.html and member-dashboard.js',
    billingTerms: 'billing-dashboard.html → membership-terms.html and terms-of-use.html'
  },
  paypalCheckout: 'server-verified-and-fail-closed',
  paidAccessPolicy: 'Server-verified PayPal ACTIVE subscriptions only',
  boundary: 'Canonical membership, billing and passwordless pages are restored after generated-site builders. Signup and PayPal behavior remain in their dedicated audited runtimes rather than obsolete inline scripts.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'membership-auth-ui-patch.json'), JSON.stringify(report, null, 2));
console.log(`Membership auth UI patched: ${changed.length ? changed.join(', ') : 'already current'}`);
