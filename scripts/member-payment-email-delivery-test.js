const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
const checks = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail || 'failed'}`);
}

function containsAll(text, values) {
  return values.every(value => text.includes(value));
}

const required = [
  'src/worker-production.js',
  'src/worker-report-delivery.js',
  'src/worker-email-lifecycle.js',
  'src/worker-member-experience.js',
  'src/worker-paypal-sandbox-bootstrap-v2.js',
  'scripts/build-production-deploy-receipt.js',
  'wrangler.toml',
  'wrangler.jsonc'
];
for (const file of required) check(`required file ${file}`, fs.existsSync(path.join(root, file)), 'missing');

const production = read('src/worker-production.js');
const delivery = read('src/worker-report-delivery.js');
const email = read('src/worker-email-lifecycle.js');
const member = read('src/worker-member-experience.js');
const paypal = read('src/worker-paypal-sandbox-bootstrap-v2.js');
const receipt = read('scripts/build-production-deploy-receipt.js');
const toml = read('wrangler.toml');
const jsonc = read('wrangler.jsonc');

check('strict production worker imports report delivery', containsAll(production, [
  "queueVerifiedSelfReport",
  "queuePendingVerifiedSelfReports",
  "processOutbox"
]));
check('completed OSINT results trigger delivery', containsAll(production, [
  "completedReportJobId",
  "/api\\/admin\\/tools\\/jobs\\/",
  "queueAndDeliverVerifiedReport"
]));
check('scheduled job queues reports before processing outbox', production.indexOf('queuePendingVerifiedSelfReports') < production.lastIndexOf('emailWorker.scheduled'));

check('report is limited to active verified members', containsAll(delivery, [
  "row.member_status !== 'active'",
  "!row.email_verified_at",
  "verified-active-member-required"
]));
check('report is limited to verified-self searches', containsAll(delivery, [
  "row.target_hash !== memberHash",
  "report-is-not-verified-self"
]));
check('report email uses idempotent D1 outbox', containsAll(delivery, [
  "INSERT OR IGNORE INTO email_outbox",
  "idempotencyKey",
  "verified_self_intelligence_report"
]));
check('report contains no raw target address field', !/target\s*:\s*row\./.test(delivery));
check('report includes evidence boundary', /Association is not proof/.test(delivery));
check('report queues secure member route', delivery.includes('https://matrixreprogrammed.com/research-tools.html'));

check('email lifecycle exports outbox processor', email.includes('processOutbox') && email.includes('export {emailRoutes,ensureSchema,fetchHandler,scheduledHandler,processOutbox,automatedCampaign}'));
check('email provider remains Brevo transactional delivery', containsAll(email, [
  'BREVO_API_KEY',
  'MEMBERS_FROM_EMAIL',
  'https://api.brevo.com/v3/smtp/email'
]));
check('email verification and preferences routes exist', containsAll(email, [
  '/api/email/verify',
  '/api/email/preferences',
  '/api/email/unsubscribe'
]));

check('member area protects core routes', containsAll(member, [
  '/api/member/me',
  '/api/member/dashboard',
  'Authentication required',
  'member_effective_entitlements'
]));
check('member capabilities cover all paid tiers', containsAll(member, [
  'supporter_3',
  'intelligence_6',
  'research_pro_9'
]));

check('PayPal sandbox defines three EUR tiers', containsAll(paypal, [
  "supporter: { label: 'Supporter', price: '3.00' }",
  "intelligence: { label: 'Intelligence Member', price: '6.00' }",
  "research_pro: { label: 'Research Pro', price: '9.00' }",
  "currency_code: 'EUR'"
]));
check('PayPal live charging stays disabled by configuration', containsAll(toml, [
  'PAYPAL_ENVIRONMENT = "sandbox"',
  'PAYPAL_SANDBOX_ENABLED = "true"',
  'PAYPAL_PRODUCTION_ENABLED = "false"'
]));

check('daily and weekly report crons are active in TOML', containsAll(toml, [
  '"5 6 * * *"',
  '"15 7 * * 1"',
  'EMAIL_AUTOMATION_ENABLED = "true"'
]));
check('daily and weekly report crons are active in JSONC', containsAll(jsonc, [
  '"5 6 * * *"',
  '"15 7 * * 1"',
  '"EMAIL_AUTOMATION_ENABLED": "true"'
]));

check('deployment receipt accepts safe-disabled PayPal', containsAll(receipt, [
  'bootstrapSafeDisabled',
  'bootstrapSafe',
  "bootstrapMode: bootstrapReady ? 'sandbox-ready'"
]));
check('deployment receipt verifies member and email boundaries', containsAll(receipt, [
  '/api/member/me',
  '/api/email/admin/health',
  'memberBoundaryPassed',
  'emailBoundaryPassed'
]));
check('deployment receipt requires verified report wiring', containsAll(receipt, [
  'reportDeliveryWired',
  'reportsOnlyEmailVerifiedSelfResults'
]));

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'member-payment-email-delivery-test.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`MEMBER, PAYMENT AND EMAIL DELIVERY TEST FAILED: ${failures.length} failure(s)`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Member, payment and email delivery assurance passed: ${checks.length} checks.`);
