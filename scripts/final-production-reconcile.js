const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'final-production-reconcile.json');
const report = { ok: true, generatedAt: new Date().toISOString(), commands: [], copied: [], checks: [] };
function persistReport() { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
process.on('uncaughtException', error => { report.ok = false; report.failedAt = new Date().toISOString(); report.error = String(error?.stack || error); persistReport(); console.error(report.error); process.exit(1); });
process.on('unhandledRejection', error => { throw error; });
function run(script, optional = false) { const file = path.join(root, script); if (!fs.existsSync(file)) { if (optional) return; throw new Error(`Missing reconciliation script: ${script}`); } const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 40 * 1024 * 1024 }); report.commands.push({ script, status: result.status, stdout: String(result.stdout || '').slice(-4000), stderr: String(result.stderr || '').slice(-4000) }); if (result.status !== 0) throw new Error(`${script} failed: ${result.stderr || result.stdout}`); }
function copy(rel) { const source = path.join(root, rel); if (!fs.existsSync(source)) throw new Error(`Critical release file missing: ${rel}`); const destination = path.join(site, rel); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); report.copied.push(rel); if (rel.endsWith('.html')) { const extensionless = path.join(site, rel.replace(/\.html$/i, '')); if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless); } }
function duplicateIds(html) { const ids = [...String(html).matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]); return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]; }
function requireMarker(rel, marker) { const text = fs.readFileSync(path.join(root, rel), 'utf8'); const ok = text.includes(marker); report.checks.push({ rel, marker, ok }); if (!ok) throw new Error(`${rel} missing required marker: ${marker}`); if (rel.endsWith('.html')) { const duplicates = duplicateIds(text); if (duplicates.length) throw new Error(`${rel} duplicate IDs: ${duplicates.join(', ')}`); } }
function rejectMarker(rel, marker) { const text = fs.readFileSync(path.join(root, rel), 'utf8'); const ok = !text.includes(marker); report.checks.push({ rel, rejectedMarker: marker, ok }); if (!ok) throw new Error(`${rel} contains forbidden legacy marker: ${marker}`); }

if (!fs.existsSync(site)) throw new Error('_site does not exist; run the normal build first.');
run('scripts/patch-main-navigation-safety-links.js');
run('scripts/patch-membership-tiers.js');
run('scripts/patch-commercial-paypal-guard.js');
run('scripts/patch-commercial-launch-readiness.js');
run('scripts/patch-homepage-mask-intro.js');
run('scripts/homepage-mask-intro-test.js');
run('scripts/build-live-intel-machine.js');
run('scripts/build-mission-intelligence-10.js');
run('scripts/build-investigation-pages.js');
run('scripts/build-outcome-briefings.js');
run('scripts/build-daily-brain-brief.js');
run('scripts/patch-conclusion-integrity-cards.js');
run('scripts/repair-public-site-errors.js', true);
run('scripts/build-evidence-badge-system.js');
run('scripts/build-premier-resource-upgrade.js');
run('scripts/ensure-evidence-badge-routes.js');
run('scripts/enforce-production-cache-policy.js');
run('scripts/phase7-paypal-sandbox-rehearsal-test.mjs');

// Final owners of search, conclusions, email, Signal Board and commercial surfaces.
run('scripts/repair-search-system.js');
run('scripts/build-search-v3-index.js');
run('scripts/build-search-v3-runtime.js');
run('scripts/patch-conclusion-integrity-cards.js');
run('scripts/patch-membership-tiers.js');
run('scripts/patch-commercial-paypal-guard.js');
run('scripts/patch-commercial-launch-readiness.js');
run('scripts/build-daily-brain-brief.js');
run('scripts/daily-brief-signal-board-test.js');
run('scripts/commercial-launch-readiness-test.js');
run('scripts/build-deploy-manifest.js');
run('scripts/build-production-health.js');

const critical = [
  'index.html','homepage-mask-intro.css','homepage-mask-intro.js','assets/intro-eye.svg','assets/intro-mask.svg',
  'start-here.html','store.html','membership.html','paypal-membership.js','membership-terms.html','cancellation-withdrawal.html','legal-notice.html',
  'member-dashboard.html','member-dashboard-app.js','billing-dashboard.html','billing-dashboard.js','admin-payment-dashboard.html','admin-payment-dashboard.js','admin-paypal-rehearsal.html','admin-paypal-rehearsal.js',
  'forum.html','dark-speculation-forum.html','epstein-alive-board.html','forum.js',
  'live-intel.html','daily-power-conclusions.html','daily-investigation-conclusions.html','weekly-investigation-report.html','daily-brain-brief.html','outcome-briefings.html',
  'security-privacy.html','dark-web-safety.html','geographic-power-atlas.html','data-lab.html','evidence-archive.html','timers.html','ai-speculative-conclusions.html',
  'search.html','search.js','search-index.json','data/search-facets.json','_headers','data/membership-tiers.json','data/live-intel.json','data/daily-power-conclusions.json','data/daily-investigation-conclusions.json','data/weekly-investigation-conclusions.json','data/daily-brain-brief.json','data/outcome-briefings.json','data/global-risk-clocks.json','data/clock-wall.json','data/production-freshness-policy.json',
  'downloads/daily-brain-brief.json','downloads/daily-brain-brief.md','deploy-manifest.json','deploy-health.html','deploy-health.json','downloads/deploy-health.json'
];
critical.forEach(copy);
run('scripts/final-release-sanitize.js');

for (const marker of ['Security Tools','Dark Web Safety','data-homepage-mask-intro','assets/intro-eye.svg','assets/intro-mask.svg','homepage-intro__burn','homepage-mask-intro.js']) requireMarker('index.html', marker);
requireMarker('start-here.html','Open Security Tools'); requireMarker('start-here.html','Open Dark Web Safety');
requireMarker('store.html','CURRENT COMMERCIAL STATUS.'); requireMarker('store.html','data-newsletter-form'); rejectMarker('store.html','Buy Placeholder'); rejectMarker('store.html','Email capture placeholder');
for (const marker of ['Free Member','€3','€6','€9','paypal-membership.js','paypal-membership-status','membership-terms-accepted','membership-recurring-acknowledged','membership-immediate-service-requested','membership-withdrawal-notice-acknowledged','Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.']) requireMarker('membership.html',marker);
for (const marker of ['Coming soon — no payment taken','€19/month','€49/month']) rejectMarker('membership.html',marker);
requireMarker('membership-terms.html','Version 2026-07-18-v1'); requireMarker('cancellation-withdrawal.html','Version 2026-07-18-v1'); requireMarker('legal-notice.html','data-commercial-legal-ready="false"'); requireMarker('legal-notice.html','LIVE CHECKOUT REMAINS BLOCKED.');
for (const marker of ['/api/paypal/checkout-intent','/api/paypal/subscription/confirm','recurringPaymentAcknowledged','consentRecorded']) requireMarker('paypal-membership.js',marker);
for (const marker of ['paypal_checkout_consents','commercialLegalReady','paypal.checkout.consent_recorded','paypal.membership_contract_confirmation']) requireMarker('src/worker-paypal-subscriptions.js',marker);
requireMarker('migrations/phase8_paypal_sandbox_bootstrap.sql','CREATE TABLE IF NOT EXISTS paypal_checkout_consents'); requireMarker('wrangler.toml','COMMERCIAL_LEGAL_READY = "false"'); requireMarker('wrangler.toml','PAYPAL_PRODUCTION_ENABLED = "false"');

// Deep brief and email invariants.
requireMarker('data/daily-brain-brief.json','"schemaVersion": 3');
for (const marker of ['"trigger"','"primaryRecord"','"recordStatus"','"establishedFacts"','"keyEntities"','"moneyAndAuthority"','"mechanismOfPower"','"solidConclusion"','"missionRelevance"','"eliteControlRelevance"','"globalConvergenceAssessment"','"speculativeConclusion"','"counterAnalysis"','"missingEvidence"','"watchNext"','"accessTier"']) requireMarker('data/daily-brain-brief.json',marker);
for (const marker of ['Structured intelligence lanes','Primary record','Money and authority','Speculative conclusion','Counter-analysis','Persistent Signal Board']) requireMarker('daily-brain-brief.html',marker);
for (const marker of ['Trigger','Primary record','Money and authority','Global convergence assessment','Speculative conclusion','Counter-analysis','Missing evidence','Watch next']) requireMarker('src/worker-daily-brief-email.js',marker);
for (const marker of ['queueImmediateDailyBrief',"messageKind:'first_daily_brief'",'issueReusableEmailToken','Manage preferences:','Unsubscribe:',"timeZone:'Europe/Paris'","parts.hour==='08'&&parts.minute==='05'","parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'"]) requireMarker('src/worker-email-lifecycle.js',marker);
requireMarker('wrangler.toml','EMAIL_AUTOMATION_ENABLED = "true"');
for (const marker of ['"5 6 * * *"','"5 7 * * *"','"15 7 * * 1"','"15 8 * * 1"']) requireMarker('wrangler.toml',marker);

// Persistent Signal Board invariants.
for (const marker of ['verified-free-member-session','forum_post_owners','forum_report_owners','forum_board_state','crossDevice:true','no browser or legacy fallback was accepted']) requireMarker('src/worker-forum-persistence.js',marker);
for (const marker of ['/api/member/me','emailVerifiedAt','No browser-only or temporary fallback is accepted','persistent D1']) requireMarker('forum.js',marker);
rejectMarker('forum.js','localStorage'); rejectMarker('forum.js','matrix_signal_pass_unlocked');
for (const rel of ['forum.html','dark-speculation-forum.html','epstein-alive-board.html']) { requireMarker(rel,'Verified Free Member'); requireMarker(rel,'Cloudflare D1'); rejectMarker(rel,'paypal.me'); }
for (const marker of ['forum_post_owners','forum_report_owners','forum_board_state','forum_persistence_health']) requireMarker('migrations/phase9_signal_board_persistence.sql',marker);
requireMarker('wrangler.toml','ENABLE_KV_COMPATIBILITY_MIRROR = "false"');

for (const marker of ['billing-dashboard.js']) requireMarker('billing-dashboard.html',marker);
requireMarker('admin-payment-dashboard.html','admin-payment-dashboard.js'); requireMarker('admin-payment-dashboard.html','payment-commercial-legal'); requireMarker('admin-payment-dashboard.js','commercialLegalReady'); requireMarker('admin-payment-dashboard.js','admin-paypal-rehearsal.html');
requireMarker('admin-paypal-rehearsal.html','PAYPAL SANDBOX REHEARSAL.'); requireMarker('admin-paypal-rehearsal.html','maximum 45-minute window'); requireMarker('admin-paypal-rehearsal.html','admin-paypal-rehearsal.js');
for (const marker of ['/api/paypal/admin/rehearsal/start','/api/paypal/admin/rehearsal/complete','/api/paypal/admin/rehearsal/abort']) requireMarker('admin-paypal-rehearsal.js',marker);
for (const marker of ['matrix-homepage-intro-seen-v2','eye: 3000','burn: 1100','mask: 3000']) requireMarker('homepage-mask-intro.js',marker);
for (const marker of ['intro-eye-burn','intro-fire-ring','intro-mask-dissolve']) requireMarker('homepage-mask-intro.css',marker);
requireMarker('assets/intro-eye.svg','Eye of Providence seal'); requireMarker('assets/intro-mask.svg','Anonymous revolutionary mask');
requireMarker('timers.html','MISSION TIMERS.'); requireMarker('timers.html','Classified claims, not confirmed events'); requireMarker('ai-speculative-conclusions.html','ai-speculative-conclusion-integrity'); requireMarker('data/global-risk-clocks.json','"speculativeReaderClockCount": 49'); requireMarker('data/clock-wall.json','"speculativeClockCount": 49');
for (const marker of ['SEARCH THE MACHINE','id="archive-search"','id="search-v3-filters"']) requireMarker('search.html',marker);
for (const marker of ['SEARCH V3',"cache:'no-store'",'HTML returned instead of JSON']) requireMarker('search.js',marker);
requireMarker('daily-power-conclusions.html','<!-- conclusion-integrity:start -->'); requireMarker('daily-investigation-conclusions.html','<!-- conclusion-integrity:start -->'); requireMarker('outcome-briefings.html','<!-- conclusion-integrity:start -->');
requireMarker('daily-drop.html','id="evidence-badge-system-route"'); requireMarker('network-search.html','id="evidence-badge-system-route"');
requireMarker('_headers','/deploy-manifest.json'); requireMarker('_headers','/deploy-health.json'); requireMarker('_headers','Cache-Control: no-store');
requireMarker('deploy-health.html','Daily email: ACTIVE / 08:05 PARIS'); requireMarker('deploy-health.html','Signal Board: D1 PERSISTENT / VERIFIED MEMBERS'); requireMarker('deploy-health.html','Payments: SANDBOX / LIVE DISABLED');
requireMarker('deploy-health.json','src/worker-production.js'); requireMarker('deploy-health.json','"paymentStatus": "sandbox-ready-disabled"'); requireMarker('deploy-health.json','"briefingStatus": "ACTIVE / CONSENT CONTROLLED / STRUCTURE V3"'); requireMarker('deploy-health.json','"forumCrossDevice": true');

persistReport();
console.log(`Final production reconciliation passed: ${report.copied.length} critical files copied; deep email, persistent Signal Board and commercial consent audited.`);
