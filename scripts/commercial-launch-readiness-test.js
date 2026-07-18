const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'commercial-launch-readiness.json');
const report = { ok: true, generatedAt: new Date().toISOString(), commands: [], checks: [], failures: [] };
function full(rel) { return path.join(root, rel); }
function read(rel) { return fs.existsSync(full(rel)) ? fs.readFileSync(full(rel), 'utf8') : ''; }
function check(name, condition, detail = '') { const ok = Boolean(condition); report.checks.push({ name, ok, detail }); if (!ok) report.failures.push(detail || name); }
function run(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  report.commands.push({ label, args, status: result.status, stdout: String(result.stdout || '').slice(-3000), stderr: String(result.stderr || '').slice(-3000) });
  if (result.status !== 0) report.failures.push(`${label} failed: ${result.stderr || result.stdout}`);
}

run(['scripts/patch-commercial-paypal-guard.js'], 'Patch commercial PayPal guard');
run(['scripts/patch-commercial-launch-readiness.js'], 'Generate commercial pages');
run(['scripts/patch-membership-tiers.js'], 'Restore launch membership page');

for (const rel of [
  'scripts/patch-commercial-paypal-guard.js',
  'scripts/patch-commercial-launch-readiness.js',
  'scripts/commercial-launch-readiness-test.js',
  'src/worker-paypal-subscriptions.js',
  'src/worker-membership-contract-email.js',
  'paypal-membership.js'
]) run(['--check', rel], `Syntax check ${rel}`);

const membership = read('membership.html');
const store = read('store.html');
const terms = read('membership-terms.html');
const withdrawal = read('cancellation-withdrawal.html');
const legal = read('legal-notice.html');
const client = read('paypal-membership.js');
const worker = read('src/worker-paypal-subscriptions.js');
const contractEmail = read('src/worker-membership-contract-email.js');
const migration = read('migrations/phase8_paypal_sandbox_bootstrap.sql');
const wrangler = read('wrangler.toml');
const pkg = JSON.parse(read('package.json'));
const adminHtml = read('admin-payment-dashboard.html');
const adminJs = read('admin-payment-dashboard.js');

for (const marker of ['Free Member','€0','€3','€6','€9','membership-terms-accepted','membership-recurring-acknowledged','membership-immediate-service-requested','membership-withdrawal-notice-acknowledged','data-terms-version="2026-07-18-v1"','paypal-membership.js']) {
  check(`membership:${marker}`, membership.includes(marker), `membership.html missing ${marker}`);
}
for (const obsolete of ['€19/month','€49/month','Join Placeholder','Buy Placeholder','Email capture placeholder','when the email provider is connected']) {
  check(`membership-no:${obsolete}`, !membership.includes(obsolete), `membership.html contains obsolete text: ${obsolete}`);
  check(`store-no:${obsolete}`, !store.includes(obsolete), `store.html contains obsolete text: ${obsolete}`);
}

check('store-real-newsletter', store.includes('data-newsletter-form') && store.includes('newsletter.js'), 'Store does not use the verified newsletter lifecycle');
check('store-commercial-status', store.includes('CURRENT COMMERCIAL STATUS.'), 'Store commercial status is missing');
check('terms-versioned', terms.includes('Version 2026-07-18-v1') && terms.includes('recurs monthly through PayPal'), 'Membership terms are missing or unversioned');
check('withdrawal-versioned', withdrawal.includes('Version 2026-07-18-v1') && withdrawal.includes('statutory withdrawal rights'), 'Withdrawal notice is missing or unversioned');
check('legal-fail-closed', legal.includes('data-commercial-legal-ready="false"') && legal.includes('LIVE CHECKOUT REMAINS BLOCKED.'), 'Legal notice does not fail closed');

for (const marker of ['termsAccepted','recurringPaymentAcknowledged','immediateServiceRequested','withdrawalNoticeAcknowledged','termsVersion','withdrawalNoticeVersion','consentRecorded']) {
  check(`client-consent:${marker}`, client.includes(marker), `paypal-membership.js missing ${marker}`);
}
for (const marker of ['commercialTermsVersion','commercialLegalReady','contractConfirmationReady','paypal_checkout_consents','paypal.checkout.consent_recorded','paypal.membership_contract_confirmation','protected commercial legal confirmation','durable membership contract confirmation']) {
  check(`worker-commercial:${marker}`, worker.includes(marker), `PayPal Worker missing ${marker}`);
}
for (const marker of ['membership_contract_confirmation','Recurring price:','Immediate digital service requested: yes','Membership Terms','Cancellation & Withdrawal','processOutbox','transactionalMembershipEmailReady']) {
  check(`contract-email:${marker}`, contractEmail.includes(marker), `Membership contract email missing ${marker}`);
}
for (const marker of ['CREATE TABLE IF NOT EXISTS paypal_checkout_consents','recurring_payment_acknowledged','immediate_service_requested','withdrawal_notice_acknowledged','paypal_checkout_consent_summary']) {
  check(`migration-consent:${marker}`, migration.includes(marker), `Consent migration missing ${marker}`);
}
check('commercial-default-disabled', wrangler.includes('COMMERCIAL_LEGAL_READY = "false"'), 'COMMERCIAL_LEGAL_READY must default to false');
check('live-paypal-default-disabled', wrangler.includes('PAYPAL_PRODUCTION_ENABLED = "false"'), 'PAYPAL_PRODUCTION_ENABLED must remain false');
check('marketing-automation-default-disabled', wrangler.includes('EMAIL_AUTOMATION_ENABLED = "false"'), 'EMAIL_AUTOMATION_ENABLED must remain false');
check('transactional-email-enabled', wrangler.includes('EMAIL_TRANSACTIONAL_ENABLED = "true"'), 'Transactional account and contract email must remain enabled');
check('commercial-prebuild', ['patch-membership-tiers.js','patch-commercial-paypal-guard.js','patch-commercial-launch-readiness.js'].every(marker=>String(pkg.scripts?.prebuild||'').includes(marker)), 'Commercial patches are not in npm prebuild');
check('admin-commercial-status', adminHtml.includes('payment-commercial-legal') && adminHtml.includes('payment-contract-email') && adminJs.includes('commercialLegalReady') && adminJs.includes('contractConfirmationReady'), 'Payment administration does not display both commercial and contract-confirmation readiness');

report.ok = report.failures.length === 0;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Commercial launch readiness passed: ${report.checks.length} checks; durable contract confirmation is wired while live PayPal and marketing automation remain disabled.`);
