const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
const checks = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const check = (name, condition, detail = '') => {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const includesAll = (text, values) => values.every(value => text.includes(value));

const requiredFiles = [
  'data/reader-interpretation-standard.json',
  'data/access-route-policy.json',
  'scripts/build-mission-timers.js',
  'scripts/patch-osint-tool-tiers.js',
  'src/worker-access-gate.js',
  'src/worker-report-delivery.js',
  'src/worker-production.js',
  'research-tools.html',
  'research-tools.js',
  'newsletter.html',
  'newsletter.js',
  'wrangler.toml',
  'scripts/build-production-deploy-receipt.js',
  'docs/PAYPAL_EMAIL_LAUNCH_MASTER_PLAN.md'
];
for (const file of requiredFiles) check(`required file ${file}`, fs.existsSync(path.join(root, file)), 'missing');

const standard = json('data/reader-interpretation-standard.json');
const policy = json('data/access-route-policy.json');
const worker = read('src/worker.js');
const production = read('src/worker-production.js');
const delivery = read('src/worker-report-delivery.js');
const accessGate = read('src/worker-access-gate.js');
const toolsPage = read('research-tools.html');
const toolsUi = read('research-tools.js');
const newsletterPage = read('newsletter.html');
const newsletterUi = read('newsletter.js');
const wrangler = read('wrangler.toml');
const pkg = json('package.json');
const receipt = read('scripts/build-production-deploy-receipt.js');
const launchPlan = read('docs/PAYPAL_EMAIL_LAUNCH_MASTER_PLAN.md');

check('site purpose is explicit', typeof standard.sitePurpose === 'string' && standard.sitePurpose.length > 100);
check('conclusion standard covers usefulness and boundaries', includesAll(JSON.stringify(standard), [
  'plainEnglishConclusion',
  'mechanismOfPower',
  'counterEvidenceOrAlternative',
  'usefulNextAction',
  'A global standard or interoperable system is not by itself proof of a secret one-world government',
  'A CBDC, digital wallet or cross-border payment project is not by itself proof of a planned single world currency',
  'Interfaith dialogue, shared ethics or institutional religious cooperation is not by itself proof of an imposed single world religion'
]));
check('score definitions explain meaning and movement', includesAll(JSON.stringify(standard), [
  'Pressure index',
  'It is not the probability that a dramatic event will happen',
  'whatRaises',
  'whatLowers'
]));

check('asset access policy is active fail closed', policy.status === 'active-fail-closed');
check('public evidence remains open', Array.isArray(policy.publicEvidencePatterns) && policy.publicEvidencePatterns.includes('public-record'));
check('h8mail is Intelligence verified-self', policy.toolTiers?.h8mail_verified_self === 'intelligence_6');
check('administrator h8mail scope remains distinct', policy.toolTiers?.h8mail_documented_admin_scope === 'admin');
check('server-side access gate reads D1 entitlements and fails closed', includesAll(accessGate, [
  'member_effective_entitlements',
  'Protected content remains closed',
  'requiredTier'
]));
check('production Worker applies protected asset gate', includesAll(production, [
  'protectedAssetTier',
  'enforceProtectedAssetAccess',
  'protected-asset-gate-exception'
]));

check('Holehe is registered tier', worker.includes("holehe:{label:'Email account signals',access:'member',minimumTier:'registered'"));
check('SpiderFoot is Intelligence tier', worker.includes("spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6'"));
check('h8mail is Intelligence tier', worker.includes("h8mail:{label:'Breach exposure review',access:'member',minimumTier:'intelligence_6',selfOnlyForMembers:true"));
check('h8mail member scope is verified-self only', worker.includes('This Intelligence tool may review only your own verified account email'));
check('h8mail page is visible and correctly labelled', toolsPage.includes('Intelligence Tool · h8mail') && !toolsPage.includes('Administrator Only · h8mail'));
check('h8mail UI explains verified-self boundary', toolsUi.includes('Intelligence membership required. Members may review only their own verified email.'));

check('verified-self report delivery is tier checked', includesAll(delivery, [
  'current-membership-tier-required',
  "['spiderfoot', 'h8mail'].includes(row.tool)",
  'report-is-not-verified-self'
]));
check('production Worker queues and processes reports', includesAll(production, [
  'queueVerifiedSelfReport',
  'queuePendingVerifiedSelfReports',
  'processOutbox'
]));
check('daily and weekly email schedules are configured', includesAll(wrangler, ['"5 6 * * *"', '"15 7 * * 1"']));
check('automated email remains disabled before Phase 11', wrangler.includes('EMAIL_AUTOMATION_ENABLED = "false"') && launchPlan.includes('EMAIL_AUTOMATION_ENABLED remains false until Phase 11'));
check('newsletter requires explicit consent', newsletterPage.includes('data-marketing-consent') && newsletterPage.includes('required'));
check('newsletter runtime refuses absent consent', includesAll(newsletterUi, ['consentGranted', 'Please confirm that you agree to receive email reports and updates.']));

check('timer builder is in normal build validation', pkg.scripts?.build?.includes('global-risk-clocks-test.js'));
check('tier patch runs before every npm build', pkg.scripts?.prebuild === 'node scripts/patch-osint-tool-tiers.js');
check('tier patch runs again before Cloudflare output', pkg.scripts?.build?.includes('patch-osint-tool-tiers.js'));
check('production receipt certifies mission systems', includesAll(receipt, [
  'schemaVersion: 4',
  'Cloudflare D1 Time Travel bookmark',
  'protectedAssetTiersWired',
  'osintToolTiersWired',
  'timersExplained',
  'current-membership-tier-required'
]));

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'mission-readiness-test.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`MISSION READINESS TEST FAILED: ${failures.length} issue(s)`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Mission readiness regression passed: ${checks.length} checks.`);
