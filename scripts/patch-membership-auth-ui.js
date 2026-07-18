const fs = require('fs');
const path = require('path');

const root = process.cwd();
require('./harden-worker-api-contracts.js');
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
  ['membership.html', '/api/paypal/config'],
  ['membership.html', '/api/paypal/checkout-intent'],
  ['membership.html', '/api/paypal/subscription/confirm'],
  ['membership.html', 'actions.subscription.create'],
  ['membership.html', 'config.checkoutEnabled'],
  ['membership.html', 'data.verification && data.verification.sent'],
  ['member-login.html', '/api/auth/request-link'],
  ['member-dashboard.html', '/api/member/me'],
  ['member-dashboard.html', '/api/auth/logout'],
  ['member-dashboard.html', '/api/paypal/subscription/cancel'],
  ['member-dashboard.html', 'paidAccessEnabled']
]) {
  const file = path.join(root, required[0]);
  if (!fs.readFileSync(file, 'utf8').includes(required[1])) {
    console.error(`Membership auth UI patch failed: ${required[0]} missing ${required[1]}`);
    process.exit(1);
  }
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  pages: pages.map(page => page.name),
  paypalCheckout: true,
  paidAccessPolicy: 'Server-verified PayPal ACTIVE subscriptions only',
  boundary: 'Canonical membership, passwordless authentication and PayPal subscription pages are restored after generated-site builders and copied to both HTML and extensionless Cloudflare asset routes.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'membership-auth-ui-patch.json'), JSON.stringify(report, null, 2));
console.log(`Membership auth UI patched: ${changed.length ? changed.join(', ') : 'already current'}`);
