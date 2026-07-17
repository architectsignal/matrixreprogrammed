const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const pagePath = path.join(root, 'membership.html');
const templatePath = path.join(root, 'templates', 'phase6-membership.template');
const registryPath = path.join(root, 'data', 'membership-tiers.json');
const reportPath = path.join(root, 'downloads', 'membership-tiers-report.json');
const preferencePatchPath = path.join(root, 'scripts', 'patch-membership-brief-preferences.js');

if (!fs.existsSync(templatePath)) throw new Error('templates/phase6-membership.template is missing');
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
if (registry.paymentLabel !== 'optional monthly donation') failures.push('membership registry payment label must be optional monthly donation');
if (!String(registry.evidenceAccessPromise || '').includes('same underlying public-source evidence')) failures.push('membership registry must preserve the free evidence access promise');

for (const marker of [
  'Free Member',
  '€0',
  '€3',
  '€6',
  '€9',
  'Monthly donation',
  'same underlying public-source evidence',
  'THE EVIDENCE IS FREE. DONATIONS FUND THE MACHINE.',
  'SAME EVIDENCE. DIFFERENT SERVICE LAYERS.',
  'not charitable donations',
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

for (const forbidden of ['€19/month', '€49/month', 'Coming soon — no payment taken', 'Paid access to premium briefs']) {
  if (html.includes(forbidden)) failures.push(`Phase 6 membership template contains obsolete marker: ${forbidden}`);
}

const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) failures.push(`Phase 6 membership template duplicate IDs: ${duplicateIds.join(', ')}`);

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
  mode: 'phase6-restore-protected-template-plus-explicit-email-preferences',
  template: 'templates/phase6-membership.template',
  freeTier: true,
  evidenceAccess: 'same-underlying-public-source-evidence',
  paymentLabel: 'optional-monthly-donation',
  prices: expectedPrices,
  checkoutDefault: 'disabled-until-runtime-and-d1-gates-pass',
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

console.log(`Membership page restored across ${synchronized.length} source/output route(s): Free Member evidence access, explicit Daily Control Brief and release preferences, plus optional €3, €6 and €9 monthly donations.`);
