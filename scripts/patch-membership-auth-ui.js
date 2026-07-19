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
const runtimes = [
  { name: 'newsletter.js', template: path.join(templateDir, 'newsletter.template.js') }
];

const changed = [];

function writeIfDifferent(target, content) {
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (before === content) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return true;
}

for (const runtime of runtimes) {
  if (!fs.existsSync(runtime.template)) {
    console.error(`Membership auth UI patch failed: runtime template missing for ${runtime.name}`);
    process.exit(1);
  }
  const content = fs.readFileSync(runtime.template, 'utf8');
  const rootTarget = path.join(root, runtime.name);
  if (writeIfDifferent(rootTarget, content)) changed.push(runtime.name);
  if (fs.existsSync(siteDir)) {
    const siteTarget = path.join(siteDir, runtime.name);
    if (writeIfDifferent(siteTarget, content)) changed.push(`_site/${runtime.name}`);
  }
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
  ['newsletter.js', 'consentGranted=Boolean(consent.checked)'],
  ['newsletter.js', 'public_daily_brief:preferences.daily'],
  ['newsletter.js', 'public_weekly_digest:preferences.weekly'],
  ['newsletter.js', 'release_notices:preferences.release'],
  ['newsletter.js', 'wordingVersion:\'newsletter-explicit-consent-v3\''],
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

const canonicalNewsletter = fs.readFileSync(path.join(templateDir, 'newsletter.template.js'), 'utf8');
if (fs.readFileSync(path.join(root, 'newsletter.js'), 'utf8') !== canonicalNewsletter) {
  console.error('Membership auth UI patch failed: newsletter.js differs from its canonical template');
  process.exit(1);
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
  canonicalRuntimes: runtimes.map(runtime => ({ name: runtime.name, template: path.relative(root, runtime.template).replace(/\\/g, '/') })),
  runtimes: {
    signup: 'newsletter.js → /newsletter-signup with explicit consent and selectable daily, weekly and release preferences',
    payment: 'paypal-membership.js',
    authentication: 'member-login.html and member-dashboard.js',
    billingTerms: 'billing-dashboard.html → membership-terms.html and terms-of-use.html'
  },
  paypalCheckout: 'server-verified-and-fail-closed',
  paidAccessPolicy: 'Server-verified PayPal ACTIVE subscriptions only',
  boundary: 'Canonical membership, billing, passwordless pages and the consent-aware newsletter runtime are restored after generated-site builders. Legacy generators cannot silently replace the newsletter contract with implied consent or missing preference fields.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'membership-auth-ui-patch.json'), JSON.stringify(report, null, 2));
console.log(`Membership auth UI patched: ${changed.length ? changed.join(', ') : 'already current'}`);
