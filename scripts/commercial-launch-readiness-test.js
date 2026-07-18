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
run(['scripts/patch-commercial-launch-readiness.js'], 'Generate commercial, email and Signal Board surfaces');
run(['scripts/patch-membership-tiers.js'], 'Restore launch membership page');
run(['scripts/build-daily-brain-brief.js'], 'Build deep daily brief');

for (const rel of [
  'scripts/patch-commercial-paypal-guard.js',
  'scripts/patch-commercial-launch-readiness.js',
  'scripts/patch-deep-email-automation.js',
  'scripts/patch-persistent-signal-board.js',
  'scripts/build-daily-brain-brief.js',
  'scripts/commercial-launch-readiness-test.js',
  'src/worker-paypal-subscriptions.js',
  'src/worker-membership-contract-email.js',
  'src/worker-daily-brief-email.js',
  'src/worker-email-lifecycle.js',
  'src/worker-forum-persistence.js',
  'src/worker-member-experience.js',
  'paypal-membership.js',
  'forum.js'
]) run(['--check', rel], `Syntax check ${rel}`);

const membership = read('membership.html');
const store = read('store.html');
const terms = read('membership-terms.html');
const withdrawal = read('cancellation-withdrawal.html');
const legal = read('legal-notice.html');
const client = read('paypal-membership.js');
const worker = read('src/worker-paypal-subscriptions.js');
const contractEmail = read('src/worker-membership-contract-email.js');
const deepEmail = read('src/worker-daily-brief-email.js');
const emailLifecycle = read('src/worker-email-lifecycle.js');
const forumWorker = read('src/worker-forum-persistence.js');
const forumClient = read('forum.js');
const memberWorker = read('src/worker-member-experience.js');
const dailyBrief = read('data/daily-brain-brief.json');
const dailyPage = read('daily-brain-brief.html');
const consentMigration = read('migrations/phase8_paypal_sandbox_bootstrap.sql');
const forumMigration = read('migrations/phase9_signal_board_persistence.sql');
const wrangler = read('wrangler.toml');
const pkg = JSON.parse(read('package.json'));
const adminHtml = read('admin-payment-dashboard.html');
const adminJs = read('admin-payment-dashboard.js');

for (const marker of ['Free Member','€0','€3','€6','€9','membership-terms-accepted','membership-recurring-acknowledged','membership-immediate-service-requested','membership-withdrawal-notice-acknowledged','data-terms-version="2026-07-18-v1"','paypal-membership.js']) check(`membership:${marker}`, membership.includes(marker), `membership.html missing ${marker}`);
for (const obsolete of ['€19/month','€49/month','Join Placeholder','Buy Placeholder','Email capture placeholder','when the email provider is connected']) {
  check(`membership-no:${obsolete}`, !membership.includes(obsolete), `membership.html contains obsolete text: ${obsolete}`);
  check(`store-no:${obsolete}`, !store.includes(obsolete), `store.html contains obsolete text: ${obsolete}`);
}

check('store-real-newsletter', store.includes('data-newsletter-form') && store.includes('newsletter.js'), 'Store does not use the verified newsletter lifecycle');
check('store-commercial-status', store.includes('CURRENT COMMERCIAL STATUS.'), 'Store commercial status is missing');
check('terms-versioned', terms.includes('Version 2026-07-18-v1') && terms.includes('recurs monthly through PayPal'), 'Membership terms are missing or unversioned');
check('withdrawal-versioned', withdrawal.includes('Version 2026-07-18-v1') && withdrawal.includes('statutory withdrawal rights'), 'Withdrawal notice is missing or unversioned');
check('legal-fail-closed', legal.includes('data-commercial-legal-ready="false"') && legal.includes('LIVE CHECKOUT REMAINS BLOCKED.'), 'Legal notice does not fail closed');

for (const marker of ['termsAccepted','recurringPaymentAcknowledged','immediateServiceRequested','withdrawalNoticeAcknowledged','termsVersion','withdrawalNoticeVersion','consentRecorded']) check(`client-consent:${marker}`, client.includes(marker), `paypal-membership.js missing ${marker}`);
for (const marker of ['commercialTermsVersion','commercialLegalReady','contractConfirmationReady','paypal_checkout_consents','paypal.checkout.consent_recorded','paypal.membership_contract_confirmation','protected commercial legal confirmation','durable membership contract confirmation']) check(`worker-commercial:${marker}`, worker.includes(marker), `PayPal Worker missing ${marker}`);
for (const marker of ['membership_contract_confirmation','Recurring price:','Immediate digital service requested: yes','Membership Terms','Cancellation & Withdrawal','processOutbox','transactionalMembershipEmailReady']) check(`contract-email:${marker}`, contractEmail.includes(marker), `Membership contract email missing ${marker}`);
for (const marker of ['CREATE TABLE IF NOT EXISTS paypal_checkout_consents','recurring_payment_acknowledged','immediate_service_requested','withdrawal_notice_acknowledged','paypal_checkout_consent_summary']) check(`migration-consent:${marker}`, consentMigration.includes(marker), `Consent migration missing ${marker}`);

for (const marker of ['Trigger','Primary record','Record status','Established facts','Key entities','Money and authority','Mechanism of power','Solid conclusion','Mission relevance','Elite-control relevance','Global convergence assessment','Speculative conclusion','Counter-analysis','Missing evidence','Watch next','Access tier']) check(`deep-email:${marker}`, deepEmail.includes(marker), `Deep email renderer missing ${marker}`);
check('daily-brief-schema-v3', dailyBrief.includes('"schemaVersion": 3') && dailyBrief.includes('"briefings"') && dailyBrief.includes('"globalConvergenceAssessment"'), 'Daily brief JSON is not schema v3 structured output');
check('daily-page-structured', ['Structured intelligence lanes','Primary record','Money and authority','Speculative conclusion','Counter-analysis'].every(marker => dailyPage.includes(marker)), 'Daily brief page is missing structured analysis sections');
check('immediate-first-brief', emailLifecycle.includes('queueImmediateDailyBrief') && emailLifecycle.includes("messageKind:'first_daily_brief'"), 'Verification does not queue an immediate first daily brief');
check('personalized-email-controls', emailLifecycle.includes('issueReusableEmailToken') && emailLifecycle.includes('Manage preferences:') && emailLifecycle.includes('Unsubscribe:'), 'Campaign email does not include personalized preference and unsubscribe routes');
check('paris-dst-delivery', emailLifecycle.includes("timeZone:'Europe/Paris'") && emailLifecycle.includes("parts.hour==='08'&&parts.minute==='05'") && emailLifecycle.includes("parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'"), 'Email schedule is not protected by Europe/Paris local time');
check('email-automation-authorized', wrangler.includes('EMAIL_AUTOMATION_ENABLED = "true"'), 'Consent-based daily and weekly automation must be enabled');
check('email-cron-dst-candidates', ['"5 6 * * *"','"5 7 * * *"','"15 7 * * 1"','"15 8 * * 1"'].every(marker => wrangler.includes(marker)), 'Wrangler does not contain all DST candidate schedules');

check('signal-board-session', forumWorker.includes("import { memberSessionContext } from './worker-member-experience.js';") && forumWorker.includes('verified-free-member-session'), 'Signal Board is not tied to verified member sessions');
check('signal-board-owner-ledgers', forumWorker.includes('forum_post_owners') && forumWorker.includes('forum_report_owners') && forumMigration.includes('CREATE TABLE IF NOT EXISTS forum_post_owners'), 'Signal Board D1 ownership ledgers are missing');
check('signal-board-fail-closed', forumWorker.includes('no browser or legacy fallback was accepted') && forumClient.includes('No browser-only or temporary fallback is accepted'), 'Signal Board does not fail closed on D1 persistence');
check('signal-board-cross-device', forumWorker.includes('crossDevice:true') && forumClient.includes('/api/member/me'), 'Signal Board does not prove cross-device member persistence');
check('signal-board-no-local-pass', !forumClient.includes('localStorage') && !forumClient.includes('matrix_signal_pass_unlocked') && !['forum.html','dark-speculation-forum.html','epstein-alive-board.html'].some(rel => read(rel).includes('paypal.me')), 'Signal Board still contains a device-only or paid unlock');
check('member-session-export', memberWorker.includes('export async function memberSessionContext') && memberWorker.includes('signal_board_posting'), 'Member Worker does not expose Signal Board session/capability');
check('kv-mirror-disabled', wrangler.includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"'), 'KV forum compatibility mirror must remain disabled by default');

check('commercial-default-disabled', wrangler.includes('COMMERCIAL_LEGAL_READY = "false"'), 'COMMERCIAL_LEGAL_READY must default to false');
check('live-paypal-default-disabled', wrangler.includes('PAYPAL_PRODUCTION_ENABLED = "false"'), 'PAYPAL_PRODUCTION_ENABLED must remain false');
check('transactional-email-enabled', wrangler.includes('EMAIL_TRANSACTIONAL_ENABLED = "true"'), 'Transactional account and contract email must remain enabled');
check('commercial-prebuild', ['patch-membership-tiers.js','patch-commercial-paypal-guard.js','patch-commercial-launch-readiness.js'].every(marker => String(pkg.scripts?.prebuild || '').includes(marker)), 'Commercial patches are not in npm prebuild');
check('integrated-mission-patches', read('scripts/patch-commercial-launch-readiness.js').includes('patch-deep-email-automation.js') && read('scripts/patch-commercial-launch-readiness.js').includes('patch-persistent-signal-board.js'), 'Deep email and Signal Board patches are not protected by prebuild');
check('admin-commercial-status', adminHtml.includes('payment-commercial-legal') && adminHtml.includes('payment-contract-email') && adminJs.includes('commercialLegalReady') && adminJs.includes('contractConfirmationReady'), 'Payment administration does not display both commercial and contract-confirmation readiness');

report.ok = report.failures.length === 0;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Commercial launch readiness passed: ${report.checks.length} checks; deep consent-based emails and persistent verified-member Signal Board are active while live PayPal remains disabled.`);
