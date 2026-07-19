const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const pagePath = path.join(root, 'membership.html');
const templatePath = path.join(root, 'scripts', 'templates', 'membership-auth', 'membership.template');
const registryPath = path.join(root, 'data', 'membership-tiers.json');
const reportPath = path.join(root, 'downloads', 'membership-tiers-report.json');
const preferencePatchPath = path.join(root, 'scripts', 'patch-membership-brief-preferences.js');

if (!fs.existsSync(templatePath)) throw new Error('scripts/templates/membership-auth/membership.template is missing');
if (!fs.existsSync(registryPath)) throw new Error('data/membership-tiers.json is missing');

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const tiers = Array.isArray(registry.tiers) ? registry.tiers : [];
const expectedPrices = [3, 6, 9];
const html = fs.readFileSync(templatePath, 'utf8');
const failures = [];
const synchronized = [];
let briefingPreferencePatch = { ran: false, status: null };

if (tiers.length !== 3) failures.push(`expected 3 paid membership tiers, found ${tiers.length}`);
if (tiers.some((tier, index) => Number(tier.price) !== expectedPrices[index])) failures.push('membership tier prices must be €3, €6 and €9 in ascending order');
if (!String(registry.evidenceAccessPromise || '').includes('same underlying public-source evidence')) failures.push('membership registry must preserve the free evidence access promise');

for (const marker of [
  'Free Member',
  '€0',
  '€3',
  '€6',
  '€9',
  'Monthly membership',
  'Underlying public-source evidence',
  'THE EVIDENCE IS FREE. PAID TIERS ADD SERVICE.',
  'SAME EVIDENCE. DIFFERENT SERVICE LAYERS.',
  'Paid memberships are opening soon. Free Member registration is available now.',
  'Create or access free account',
  'paypal-membership.js',
  'paypal-membership-status',
  'paypal-button-supporter',
  'paypal-button-intelligence',
  'paypal-button-research_pro',
  'billing-dashboard.html',
  'membership-terms.html',
  'terms-of-use.html',
  'Checkout approval alone never grants access.',
  'Only the verified €6 plan can grant the Intelligence tier.',
  'Only the verified €9 plan can grant Research Pro.'
]) {
  if (!html.includes(marker)) failures.push(`canonical membership template missing marker: ${marker}`);
}

for (const forbidden of [
  '€19/month',
  '€49/month',
  'Coming soon — no payment taken',
  'Paid access to premium briefs',
  'Join Placeholder',
  'Monthly donation',
  'donation / month',
  'activation gates',
  'checkout remains disabled until',
  'configured yet'
]) {
  if (html.includes(forbidden)) failures.push(`canonical membership template contains obsolete or implementation-facing marker: ${forbidden}`);
}

const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) failures.push(`canonical membership template duplicate IDs: ${duplicateIds.join(', ')}`);

if (!failures.length) {
  fs.writeFileSync(pagePath, html);
  synchronized.push('membership.html');
  const site = path.join(root, '_site');
  if (fs.existsSync(site) && fs.statSync(site).isDirectory()) {
    for (const relative of ['membership.html', 'membership']) {
      const target = path.join(site, relative);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, html);
      synchronized.push(`_site/${relative}`);
    }
  }

  if (!fs.existsSync(preferencePatchPath)) failures.push('scripts/patch-membership-brief-preferences.js is missing');
  else {
    const result = spawnSync(process.execPath, [preferencePatchPath], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    briefingPreferencePatch = {
      ran: true,
      status: result.status,
      stdout: String(result.stdout || '').slice(-2000),
      stderr: String(result.stderr || '').slice(-2000)
    };
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) failures.push(`membership briefing-preference patch failed with status ${result.status}`);
    else {
      for (const relative of ['membership.html', 'membership', 'newsletter.js']) {
        const target = path.join(root, '_site', relative);
        if (fs.existsSync(target) && !synchronized.includes(`_site/${relative}`)) synchronized.push(`_site/${relative}`);
      }
    }
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: 'launch-safe-canonical-template-plus-explicit-email-preferences',
  template: 'scripts/templates/membership-auth/membership.template',
  freeTier: true,
  evidenceAccess: 'same-underlying-public-source-evidence',
  publicPaymentLabel: 'monthly-membership',
  registryPaymentLabel: registry.paymentLabel || null,
  prices: expectedPrices,
  checkoutDefault: 'reader-facing-opening-soon-and-server-disabled',
  briefingPreferences: {
    publicDailyBrief: true,
    releaseNotices: true,
    publicWeeklyDigest: 'optional',
    patch: briefingPreferencePatch
  },
  tiers: tiers.map(tier => ({ id: tier.id, name: tier.name, price: tier.price, priceLabel: tier.priceLabel })),
  synchronized,
  failures
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (failures.length) {
  failures.forEach(item => console.error(`MEMBERSHIP TIER FAILURE: ${item}`));
  process.exit(1);
}

console.log(`Membership page restored from the launch-safe canonical template across ${synchronized.length} source/output route(s): Free Member evidence access plus €3, €6 and €9 monthly service tiers.`);
