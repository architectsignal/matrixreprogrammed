const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const checks = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const check = (name, condition, detail = '') => { const ok = Boolean(condition); checks.push({ name, ok, detail: ok ? '' : detail }); if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`); };
const includesAll = (text, values) => values.every(value => text.includes(value));
function prepare(script, label) {
  const full = path.join(root, script);
  if (!fs.existsSync(full)) { failures.push(`${label}: missing ${script}`); return; }
  const result = spawnSync(process.execPath, [full], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failures.push(`${label} failed with status ${result.status}`);
}

// Mission readiness must inspect the final owned surfaces, not stale source snapshots
// that a legacy generator is about to replace later in the same build.
prepare('scripts/build-daily-brain-brief.js', 'Build current Daily Control Brief');
prepare('scripts/patch-persistent-signal-board.js', 'Restore persistent D1 Signal Board');
prepare('scripts/patch-deep-email-automation.js', 'Restore deep consent-controlled email');
prepare('scripts/patch-list-unsubscribe-headers.js', 'Restore one-click unsubscribe headers');
prepare('scripts/patch-persistent-signal-board.js', 'Reassert persistent D1 Signal Board after email preparation');

const requiredFiles = [
  'data/reader-interpretation-standard.json','data/access-route-policy.json','data/daily-brain-brief.json',
  'scripts/build-mission-timers.js','scripts/build-daily-brain-brief.js','scripts/patch-osint-tool-tiers.js','scripts/patch-membership-tiers.js','scripts/patch-commercial-paypal-guard.js','scripts/patch-commercial-launch-readiness.js','scripts/patch-deep-email-automation.js','scripts/patch-list-unsubscribe-headers.js','scripts/patch-persistent-signal-board.js',
  'src/worker-access-gate.js','src/worker-report-delivery.js','src/worker-production.js','src/worker-membership-contract-email.js','src/worker-daily-brief-email.js','src/worker-email-lifecycle.js','src/worker-forum-persistence.js','src/worker-member-experience.js',
  'forum.js','forum.html','dark-speculation-forum.html','epstein-alive-board.html','migrations/phase9_signal_board_persistence.sql',
  'research-tools.html','research-tools.js','newsletter.html','newsletter.js','wrangler.toml','scripts/build-production-deploy-receipt.js','docs/PAYPAL_EMAIL_LAUNCH_MASTER_PLAN.md'
];
for (const file of requiredFiles) check(`required file ${file}`, fs.existsSync(path.join(root, file)), 'missing');

const standard = json('data/reader-interpretation-standard.json');
const policy = json('data/access-route-policy.json');
const brain = json('data/daily-brain-brief.json');
const worker = read('src/worker.js');
const production = read('src/worker-production.js');
const delivery = read('src/worker-report-delivery.js');
const accessGate = read('src/worker-access-gate.js');
const contractEmail = read('src/worker-membership-contract-email.js');
const dailyEmail = read('src/worker-daily-brief-email.js');
const emailLifecycle = read('src/worker-email-lifecycle.js');
const forumWorker = read('src/worker-forum-persistence.js');
const forumClient = read('forum.js');
const memberWorker = read('src/worker-member-experience.js');
const forumMigration = read('migrations/phase9_signal_board_persistence.sql');
const commercialGuard = read('scripts/patch-commercial-paypal-guard.js');
const commercialPatch = read('scripts/patch-commercial-launch-readiness.js');
const toolsPage = read('research-tools.html');
const toolsUi = read('research-tools.js');
const newsletterPage = read('newsletter.html');
const newsletterUi = read('newsletter.js');
const wrangler = read('wrangler.toml');
const pkg = json('package.json');
const receipt = read('scripts/build-production-deploy-receipt.js');
const launchPlan = read('docs/PAYPAL_EMAIL_LAUNCH_MASTER_PLAN.md');

check('site purpose is explicit', typeof standard.sitePurpose === 'string' && standard.sitePurpose.length > 100);
check('conclusion standard covers usefulness and boundaries', includesAll(JSON.stringify(standard), ['plainEnglishConclusion','mechanismOfPower','counterEvidenceOrAlternative','usefulNextAction','A global standard or interoperable system is not by itself proof of a secret one-world government','A CBDC, digital wallet or cross-border payment project is not by itself proof of a planned single world currency','Interfaith dialogue, shared ethics or institutional religious cooperation is not by itself proof of an imposed single world religion']));
check('score definitions explain meaning and movement', includesAll(JSON.stringify(standard), ['Pressure index','It is not the probability that a dramatic event will happen','whatRaises','whatLowers']));

check('asset access policy is active fail closed', policy.status === 'active-fail-closed');
check('public evidence remains open', Array.isArray(policy.publicEvidencePatterns) && policy.publicEvidencePatterns.includes('public-record'));
check('h8mail is Intelligence verified-self', policy.toolTiers?.h8mail_verified_self === 'intelligence_6');
check('administrator h8mail scope remains distinct', policy.toolTiers?.h8mail_documented_admin_scope === 'admin');
check('server-side access gate reads D1 entitlements and fails closed', includesAll(accessGate, ['member_effective_entitlements','Protected content remains closed','requiredTier']));
check('production Worker applies protected asset gate', includesAll(production, ['protectedAssetTier','enforceProtectedAssetAccess','protected-asset-gate-exception']));

check('Holehe is registered tier', worker.includes("holehe:{label:'Email account signals',access:'member',minimumTier:'registered'"));
check('SpiderFoot is Intelligence tier', worker.includes("spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6'"));
check('h8mail is Intelligence tier', worker.includes("h8mail:{label:'Breach exposure review',access:'member',minimumTier:'intelligence_6',selfOnlyForMembers:true"));
check('h8mail member scope is verified-self only', worker.includes('This Intelligence tool may review only your own verified account email'));
check('h8mail page is visible and correctly labelled', toolsPage.includes('Intelligence Tool · h8mail') && !toolsPage.includes('Administrator Only · h8mail'));
check('h8mail UI explains verified-self boundary', toolsUi.includes('Intelligence membership required. Members may review only their own verified email.'));
check('verified-self report delivery is tier checked', includesAll(delivery, ['current-membership-tier-required',"['spiderfoot', 'h8mail'].includes(row.tool)",'report-is-not-verified-self']));
check('production Worker queues and processes reports', includesAll(production, ['queueVerifiedSelfReport','queuePendingVerifiedSelfReports','processOutbox']));

check('daily brief schema is deep and evidence bounded', brain.schemaVersion === 3 && Array.isArray(brain.briefings) && brain.briefings.length >= 4 && brain.briefings.every(item => ['trigger','primaryRecord','recordStatus','establishedFacts','keyEntities','moneyAndAuthority','mechanismOfPower','solidConclusion','missionRelevance','eliteControlRelevance','globalConvergenceAssessment','speculativeConclusion','counterAnalysis','missingEvidence','watchNext','confidence','accessTier'].every(key => Object.prototype.hasOwnProperty.call(item, key))));
check('daily email renderer preserves mandatory structure', includesAll(dailyEmail, ['Trigger','Primary record','Record status','Established facts','Key entities','Money and authority','Mechanism of power','Solid conclusion','Mission relevance','Elite-control relevance','Global convergence assessment','Speculative conclusion','Counter-analysis','Missing evidence','Watch next','Access tier','const strongestHeadline=','const subject=`${brief.title}:']));
check('daily and weekly email schedules are DST safe', includesAll(wrangler, ['"5 6 * * *"','"5 7 * * *"','"15 7 * * 1"','"15 8 * * 1"']) && includesAll(emailLifecycle, ["timeZone:'Europe/Paris'","parts.hour==='08'&&parts.minute==='05'","parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'"]));
check('consent-based email automation is active', includesAll(wrangler, ['EMAIL_AUTOMATION_ENABLED = "true"','EMAIL_TRANSACTIONAL_ENABLED = "true"','BREVO_DOMAIN_AUTHENTICATED = "true"','EMAIL_RETRY_QUARANTINE_BEFORE = "2026-07-18T00:00:00.000Z"']) && includesAll(emailLifecycle, ['eligibleMembers','marketing_status=\'subscribed\'','email_verified_at IS NOT NULL','email_suppressions']));
const legacyFirstBrief = emailLifecycle.includes('queueImmediateDailyBrief') && emailLifecycle.includes("messageKind:'first_daily_brief'") && emailLifecycle.includes('public_daily_brief!==1');
const currentFirstBrief = emailLifecycle.includes('sendFirstDailyBrief') && emailLifecycle.includes('public_daily_brief!==1') && emailLifecycle.includes('daily-control-brief:${member.id}:') && emailLifecycle.includes('firstDailyBrief');
check('verification queues immediate first brief', legacyFirstBrief || currentFirstBrief);
check('every campaign has personalised and one-click controls', includesAll(emailLifecycle, ['issueReusableEmailToken','Manage preferences:','Unsubscribe:','subscriber-dashboard.html?token=',"'List-Unsubscribe'","'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'",'headers:payload.headers||undefined']));
check('launch plan records active controlled automation', includesAll(launchPlan, ['Automated daily and weekly briefing email is enabled.','08:05 Europe/Paris','09:15 Europe/Paris','Immediate first Daily Control Brief','Personalised preference and unsubscribe routes']));

check('durable membership confirmation email is wired', includesAll(contractEmail, ['membership_contract_confirmation','Recurring price:','Immediate digital service requested: yes','Membership Terms','Cancellation & Withdrawal','processOutbox']) && includesAll(commercialGuard, ['queueMembershipContractConfirmation','contractConfirmationReady','paypal.membership_contract_confirmation','Authenticated transactional email is required to deliver the durable membership contract confirmation']));
check('newsletter requires explicit consent', newsletterPage.includes('data-marketing-consent') && newsletterPage.includes('required'));
check('newsletter runtime refuses absent consent', includesAll(newsletterUi, ['const consentGranted=Boolean(consent.checked);','marketingConsent:consentGranted','Please confirm that you agree to receive the selected briefings.']));
check('newsletter runtime sends explicit preferences', includesAll(newsletterUi, ['public_daily_brief:preferences.daily','public_weekly_digest:preferences.weekly','release_notices:preferences.release']));

const forumClientLower = forumClient.toLowerCase();
check('Signal Board requires verified Free Member session', includesAll(forumWorker, ["import { memberSessionContext } from './worker-member-experience.js';",'A verified free member account is required to post.',"postingAccess:'verified-free-member-session'"]) && forumClient.includes('/api/member/me') && forumClient.includes('emailVerifiedAt') && forumClientLower.includes('verified free member account is required'));
check('Signal Board is D1 authoritative and cross-device', includesAll(forumWorker, ['forum_post_owners','forum_report_owners','forum_board_state','crossDevice:true','no browser or legacy fallback was accepted']) && includesAll(forumMigration, ['CREATE TABLE IF NOT EXISTS forum_post_owners','CREATE TABLE IF NOT EXISTS forum_report_owners','CREATE VIEW forum_persistence_health']));
check('Signal Board no longer uses device-only paid unlock', !forumClient.includes('localStorage') && !forumClient.includes('matrix_signal_pass_unlocked') && !['forum.html','dark-speculation-forum.html','epstein-alive-board.html'].some(file => /paypal\.me|Pay €1|Signal Pass required to post|unlocked on this device/i.test(read(file))));
check('member capabilities include Signal Board', memberWorker.includes('export async function memberSessionContext') && memberWorker.includes("'signal_board_posting'"));
check('KV recovery mirror is disabled by default', wrangler.includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"'));

check('timer builder is in normal build validation', pkg.scripts?.build?.includes('global-risk-clocks-test.js'));
check('tier and mission guards run before every npm build', includesAll(pkg.scripts?.prebuild || '', ['patch-osint-tool-tiers.js','patch-membership-tiers.js','patch-commercial-paypal-guard.js','patch-commercial-launch-readiness.js']) && includesAll(commercialPatch, ['patch-deep-email-automation.js','patch-persistent-signal-board.js']));
check('tier patch runs again before Cloudflare output', pkg.scripts?.build?.includes('patch-osint-tool-tiers.js'));
check('production receipt certifies mission systems', includesAll(receipt, ['schemaVersion: 4','Cloudflare D1 Time Travel bookmark','protectedAssetTiersWired','osintToolTiersWired','timersExplained','current-membership-tier-required','deepBriefWired','signalBoardWired']));

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), phase: 12, emailAutomationState: 'consent-based-daily-weekly-active-paris-time', signalBoardState: 'verified-member-d1-persistent-cross-device', checks, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'mission-readiness-test.json'), JSON.stringify(report, null, 2));
if (failures.length) { console.error(`MISSION READINESS TEST FAILED: ${failures.length} issue(s)`); failures.forEach(failure => console.error(`- ${failure}`)); process.exit(1); }
console.log(`Mission readiness regression passed: ${checks.length} checks; deep consent-based brief email and persistent verified-member Signal Board are active.`);