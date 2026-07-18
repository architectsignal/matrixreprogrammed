const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'daily-brief-signal-board-test.json');
const report = { ok: true, generatedAt: new Date().toISOString(), commands: [], checks: [], failures: [] };
const file = rel => path.join(root, rel);
const read = rel => fs.existsSync(file(rel)) ? fs.readFileSync(file(rel), 'utf8') : '';
const json = rel => JSON.parse(read(rel));
function check(name, condition, detail = '') { const ok = Boolean(condition); report.checks.push({ name, ok, detail: ok ? '' : detail }); if (!ok) report.failures.push(detail || name); }
function run(script, label) { const result = spawnSync(process.execPath, [file(script)], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 }); report.commands.push({ script, label, status: result.status, stdout: String(result.stdout || '').slice(-4000), stderr: String(result.stderr || '').slice(-4000) }); if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr); if (result.status !== 0) report.failures.push(`${label} failed with status ${result.status}`); }

run('scripts/patch-deep-email-automation.js', 'Patch deep email automation');
run('scripts/patch-list-unsubscribe-headers.js', 'Patch one-click unsubscribe headers');
run('scripts/build-daily-brain-brief.js', 'Build daily brain brief and all late dependent surfaces');
run('scripts/patch-persistent-signal-board.js', 'Reapply persistent Signal Board after late generators');
run('scripts/patch-deep-email-automation.js', 'Reapply deep email automation after late generators');
run('scripts/patch-list-unsubscribe-headers.js', 'Reapply one-click unsubscribe headers after late generators');

const requiredFiles = ['src/worker-daily-brief-email.js','src/worker-email-lifecycle.js','src/worker-forum-persistence.js','src/worker-member-experience.js','forum.js','forum.html','dark-speculation-forum.html','epstein-alive-board.html','data/daily-brain-brief.json','downloads/daily-brain-brief.json','downloads/daily-brain-brief.md','daily-brain-brief.html','migrations/phase9_signal_board_persistence.sql','wrangler.toml','wrangler.jsonc'];
for (const rel of requiredFiles) check(`file:${rel}`, fs.existsSync(file(rel)), `${rel} is missing`);
for (const rel of ['src/worker-daily-brief-email.js','src/worker-email-lifecycle.js','src/worker-forum-persistence.js','src/worker-member-experience.js','forum.js','scripts/patch-deep-email-automation.js','scripts/patch-list-unsubscribe-headers.js','scripts/patch-persistent-signal-board.js','scripts/build-daily-brain-brief.js']) { const result = spawnSync(process.execPath, ['--check', file(rel)], { cwd: root, encoding: 'utf8' }); check(`syntax:${rel}`, result.status === 0, result.stderr || result.stdout || `${rel} syntax failed`); }

let brain = {};
try { brain = json('data/daily-brain-brief.json'); } catch (error) { report.failures.push(`daily brief JSON invalid: ${error.message}`); }
const mandatoryFields = ['id','section','headline','trigger','primaryRecord','recordStatus','establishedFacts','keyEntities','moneyAndAuthority','mechanismOfPower','solidConclusion','missionRelevance','eliteControlRelevance','globalConvergenceAssessment','speculativeConclusion','counterAnalysis','missingEvidence','watchNext','confidence','accessTier'];
check('brief-schema-version', brain.schemaVersion === 3, 'Daily brief schemaVersion must be 3');
check('brief-has-depth', Array.isArray(brain.briefings) && brain.briefings.length >= 4, 'Daily brief needs at least four structured lanes');
check('brief-mandatory-fields', Array.isArray(brain.briefings) && brain.briefings.every(item => mandatoryFields.every(field => Object.prototype.hasOwnProperty.call(item, field))), 'One or more daily brief lanes lacks a mandatory field');
check('brief-fact-analysis-speculation-separation', Array.isArray(brain.briefings) && brain.briefings.every(item => Array.isArray(item.establishedFacts) && item.mechanismOfPower && item.solidConclusion && item.speculativeConclusion && item.counterAnalysis), 'Daily brief does not separate facts, analysis, speculation and counter-analysis');
check('brief-missing-evidence-and-watch', Array.isArray(brain.briefings) && brain.briefings.every(item => Array.isArray(item.missingEvidence) && Array.isArray(item.watchNext)), 'Daily brief lacks missing evidence or watch conditions');
check('brief-public-boundary', String(brain.boundary || '').includes('Association is not proof'), 'Daily brief evidence boundary is missing');

const renderer = read('src/worker-daily-brief-email.js');
for (const marker of ['Trigger','Primary record','Record status','Established facts','Key entities','Money and authority','Mechanism of power','Solid conclusion','Mission relevance','Elite-control relevance','Global convergence assessment','Speculative conclusion','Counter-analysis','Missing evidence','Watch next','Access tier']) check(`renderer:${marker}`, renderer.includes(marker), `Email renderer missing ${marker}`);
check('renderer-links', ['Open full brief','Evidence Vault','Persistent Signal Board'].every(marker => renderer.includes(marker)), 'Deep email does not link to the full brief, Evidence Vault and Signal Board');

const lifecycle = read('src/worker-email-lifecycle.js');
check('email-automation-enabled', read('wrangler.toml').includes('EMAIL_AUTOMATION_ENABLED = "true"'), 'Email automation is not enabled');
check('immediate-first-brief', lifecycle.includes('queueImmediateDailyBrief') && lifecycle.includes("messageKind:'first_daily_brief'") && lifecycle.includes('public_daily_brief!==1'), 'Immediate first daily brief is not preference-gated');
check('personalized-controls', lifecycle.includes('issueReusableEmailToken') && lifecycle.includes('Manage preferences:') && lifecycle.includes('Unsubscribe:'), 'Email campaigns lack personalized controls');
check('one-click-unsubscribe', lifecycle.includes("'List-Unsubscribe'") && lifecycle.includes("'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'") && lifecycle.includes('headers:headers||undefined') && lifecycle.includes('headers:payload.headers||undefined'), 'Campaign and immediate brief emails lack machine-readable one-click unsubscribe headers');
check('paris-schedule', lifecycle.includes("timeZone:'Europe/Paris'") && lifecycle.includes("parts.hour==='08'&&parts.minute==='05'") && lifecycle.includes("parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'"), 'Email delivery is not guarded by Paris local time');
check('four-cron-candidates', ['"5 6 * * *"','"5 7 * * *"','"15 7 * * 1"','"15 8 * * 1"'].every(marker => read('wrangler.toml').includes(marker)), 'Wrangler lacks summer/winter cron candidates');
check('campaign-idempotency', lifecycle.includes('campaignKey:`automation:${kind}:${date}:v3`') && lifecycle.includes('idempotencyKey:`${campaign.id}:${member.id}`'), 'Campaign or recipient idempotency is missing');
check('consent-and-suppression', lifecycle.includes("marketing_status='subscribed'") && lifecycle.includes('email_verified_at IS NOT NULL') && lifecycle.includes('email_suppressions'), 'Automated recipients are not constrained by consent/verification/suppression');

const forumWorker = read('src/worker-forum-persistence.js');
const forumClient = read('forum.js');
const migration = read('migrations/phase9_signal_board_persistence.sql');
check('forum-member-session', forumWorker.includes('memberSessionContext') && forumWorker.includes('A verified free member account is required to post.'), 'Forum posting is not tied to verified member sessions');
check('forum-owner-ledgers', forumWorker.includes('forum_post_owners') && forumWorker.includes('forum_report_owners') && migration.includes('CREATE TABLE IF NOT EXISTS forum_post_owners') && migration.includes('CREATE TABLE IF NOT EXISTS forum_report_owners'), 'Forum ownership ledgers are incomplete');
check('forum-board-state', forumWorker.includes('forum_board_state') && migration.includes('CREATE TABLE IF NOT EXISTS forum_board_state') && migration.includes('forum_persistence_health'), 'Forum board persistence state is incomplete');
check('forum-cross-device', forumWorker.includes('crossDevice:true') && forumClient.includes('/api/member/me'), 'Cross-device member persistence is not declared');
check('forum-fail-closed', forumWorker.includes('no browser or legacy fallback was accepted') && forumClient.includes('No browser-only or temporary fallback is accepted'), 'Forum can present non-D1 state as saved');
check('forum-no-local-storage', !forumClient.includes('localStorage') && !forumClient.includes('matrix_signal_pass_unlocked'), 'Forum still uses a device-only unlock');
check('forum-no-paypal-pass', !['forum.html','dark-speculation-forum.html','epstein-alive-board.html'].some(rel => read(rel).includes('paypal.me')), 'A board page still contains the old paid Signal Pass');
check('forum-verified-copy', ['forum.html','dark-speculation-forum.html','epstein-alive-board.html'].every(rel => read(rel).includes('Verified Free Member') && read(rel).includes('Cloudflare D1')), 'A board page lacks verified-member D1 copy');
check('kv-disabled', read('wrangler.toml').includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"') && read('wrangler.jsonc').includes('"ENABLE_KV_COMPATIBILITY_MIRROR": "false"'), 'KV compatibility mirror is not disabled by default');

report.ok = report.failures.length === 0;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Daily brief and Signal Board acceptance passed: ${report.checks.length} checks after late generators, including one-click unsubscribe headers.`);
