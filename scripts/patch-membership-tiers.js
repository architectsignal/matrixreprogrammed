const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pagePath = path.join(root, 'membership.html');
const templatePath = path.join(root, 'templates', 'phase6-membership.template');
const registryPath = path.join(root, 'data', 'membership-tiers.json');
const reportPath = path.join(root, 'downloads', 'membership-tiers-report.json');

if (!fs.existsSync(templatePath)) throw new Error('templates/phase6-membership.template is missing');
if (!fs.existsSync(registryPath)) throw new Error('data/membership-tiers.json is missing');

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const tiers = Array.isArray(registry.tiers) ? registry.tiers : [];
const expectedPrices = [3, 6, 9];
const html = fs.readFileSync(templatePath, 'utf8');
const failures = [];

if (tiers.length !== 3) failures.push(`expected 3 paid membership tiers, found ${tiers.length}`);
if (tiers.some((tier, index) => Number(tier.price) !== expectedPrices[index])) failures.push('membership tier prices must be €3, €6 and €9 in ascending order');

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
  'billing-dashboard.html',
  'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.'
]) {
  if (!html.includes(marker)) failures.push(`Phase 6 membership template missing marker: ${marker}`);
}

for (const forbidden of ['€19/month', '€49/month', 'Coming soon — no payment taken']) {
  if (html.includes(forbidden)) failures.push(`Phase 6 membership template contains obsolete marker: ${forbidden}`);
}

const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) failures.push(`Phase 6 membership template duplicate IDs: ${duplicateIds.join(', ')}`);

if (!failures.length) fs.writeFileSync(pagePath, html);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: 'phase6-restore-protected-template',
  template: 'templates/phase6-membership.template',
  freeTier: true,
  prices: expectedPrices,
  checkoutDefault: 'disabled-until-runtime-and-d1-gates-pass',
  tiers: tiers.map(tier => ({ id: tier.id, name: tier.name, price: tier.price })),
  failures
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (failures.length) {
  failures.forEach(item => console.error(`MEMBERSHIP TIER FAILURE: ${item}`));
  process.exit(1);
}

console.log('Membership page restored from protected Phase 6 template: Free Member plus server-gated PayPal tiers at €3, €6 and €9.');
