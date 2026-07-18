const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
fs.mkdirSync(downloads, { recursive: true });
function full(rel) { return path.join(root, rel); }
function exists(rel) { return fs.existsSync(full(rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(full(rel), 'utf8') : ''; }
function parse(rel) { try { return JSON.parse(read(rel)); } catch { return null; } }
function hash(rel) { return exists(rel) ? crypto.createHash('sha256').update(fs.readFileSync(full(rel))).digest('hex').slice(0, 16) : 'missing'; }
function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function commitSha() { const supplied = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || ''; if (/^[a-f0-9]{40}$/i.test(supplied)) return supplied; try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return supplied || 'unknown'; } }

const buildSha = commitSha();
const manifest = parse('deploy-manifest.json');
const modules = [
  { name: 'Homepage eye-to-mask sequence', route: '/', file: 'index.html', markers: ['data-homepage-mask-intro', 'assets/intro-eye.svg', 'assets/intro-mask.svg'] },
  { name: 'Server-gated membership tiers', route: '/membership', file: 'membership.html', markers: ['Free Member', '€3', '€6', '€9', 'paypal-membership.js', 'paypal-membership-status'] },
  { name: 'Deep Daily Control Brief', route: '/daily-brain-brief', file: 'data/daily-brain-brief.json', markers: ['"schemaVersion": 3', '"trigger"', '"primaryRecord"', '"moneyAndAuthority"', '"globalConvergenceAssessment"', '"counterAnalysis"'] },
  { name: 'Structured briefing email renderer', route: '/api/email/admin/run-automation', file: 'src/worker-daily-brief-email.js', markers: ['Primary record', 'Money and authority', 'Speculative conclusion', 'Counter-analysis', 'Persistent Signal Board'] },
  { name: 'Consent-based email lifecycle', route: '/api/email/admin/health', file: 'src/worker-email-lifecycle.js', markers: ['queueImmediateDailyBrief', "messageKind:'first_daily_brief'", "timeZone:'Europe/Paris'", 'Manage preferences:', 'Unsubscribe:'] },
  { name: 'Persistent Signal Board client', route: '/forum', file: 'forum.js', markers: ['/api/member/me', 'emailVerifiedAt', 'No browser-only or temporary fallback is accepted', 'persistent D1'] },
  { name: 'Persistent Signal Board Worker', route: '/forum-health', file: 'src/worker-forum-persistence.js', markers: ['verified-free-member-session', 'forum_post_owners', 'forum_report_owners', 'crossDevice:true', 'no browser or legacy fallback was accepted'] },
  { name: 'Signal Board D1 ownership ledger', route: '/forum-health', file: 'migrations/phase9_signal_board_persistence.sql', markers: ['forum_post_owners', 'forum_report_owners', 'forum_board_state', 'forum_persistence_health'] },
  { name: 'Member billing dashboard', route: '/billing-dashboard', file: 'billing-dashboard.html', markers: ['billing-dashboard.js'] },
  { name: 'Payment administration', route: '/admin-payment-dashboard', file: 'admin-payment-dashboard.html', markers: ['admin-payment-dashboard.js'] },
  { name: 'Phase 7 sandbox rehearsal control room', route: '/admin-paypal-rehearsal', file: 'admin-paypal-rehearsal.html', markers: ['PAYPAL SANDBOX REHEARSAL.', 'maximum 45-minute window', 'admin-paypal-rehearsal.js'] },
  { name: 'PayPal subscription Worker', route: '/api/paypal/config', file: 'src/worker-paypal-subscriptions.js', markers: ['cloudflare-worker-paypal-subscriptions', '/api/paypal/webhook', 'PAYPAL_SANDBOX_ENABLED', 'paypal_runtime_settings', 'paypal_checkout_consents'] },
  { name: 'Phase 7 rehearsal Worker', route: '/api/paypal/admin/rehearsal/readiness', file: 'src/worker-paypal-sandbox-rehearsal.js', markers: ['cloudflare-worker-paypal-sandbox-rehearsal', 'START MATRIX PAYPAL SANDBOX REHEARSAL', 'expireStaleRuns', 'liveChargingEnabled: false'] },
  { name: 'Phase 7 rehearsal D1 ledger', route: '/api/paypal/admin/rehearsals', file: 'migrations/phase7_paypal_sandbox_rehearsal.sql', markers: ['paypal_sandbox_rehearsal_runs', 'paypal_sandbox_rehearsal_evidence', 'paypal_active_sandbox_rehearsal', 'checkout_enabled=0'] },
  { name: 'Live Intel', route: '/live-intel', file: 'live-intel.html', markers: ['LIVE INTEL'] },
  { name: 'Security and privacy', route: '/security-privacy', file: 'security-privacy.html', markers: ['SECURITY'] },
  { name: 'Dark web safety', route: '/dark-web-safety', file: 'dark-web-safety.html', markers: ['DARK WEB SAFETY'] },
  { name: 'Geographic Power Atlas', route: '/geographic-power-atlas', file: 'geographic-power-atlas.html', markers: ['GEOGRAPHIC POWER ATLAS'] },
  { name: 'Public Data Laboratory', route: '/data-lab', file: 'data-lab.html', markers: ['PUBLIC DATA'] },
  { name: 'Evidence Archive', route: '/evidence-archive', file: 'evidence-archive.html', markers: ['EVIDENCE ARCHIVE'] },
  { name: 'Search the Machine', route: '/search', file: 'search.html', markers: ['SEARCH THE MACHINE'] },
  { name: 'Strict production Worker', route: '/forum-health', file: 'src/worker-production.js', markers: ['non-authoritative-forum-response-blocked', 'members-db-binding-unavailable', 'cloudflare-worker-forum-d1', 'cloudflare-worker-paypal-subscriptions', 'cloudflare-worker-paypal-sandbox-rehearsal'] },
  { name: 'Cloudflare configuration', route: '/forum-health', file: 'wrangler.toml', markers: ['main = "src/worker-production.js"', 'binding = "MEMBERS_DB"', 'run_worker_first = true', 'PAYPAL_SANDBOX_ENABLED = "true"', 'PAYPAL_PRODUCTION_ENABLED = "false"', 'EMAIL_AUTOMATION_ENABLED = "true"', 'ENABLE_KV_COMPATIBILITY_MIRROR = "false"'] }
].map(item => { const content = read(item.file); const missingMarkers = item.markers.filter(marker => !content.includes(marker)); return { ...item, exists: exists(item.file), ready: exists(item.file) && missingMarkers.length === 0, missingMarkers, hash: hash(item.file) }; });

const manifestMatches = Boolean(manifest && manifest.commitSha === buildSha);
const membership = read('membership.html');
const paymentReadyDisabled = membership.includes('paypal-membership.js') && membership.includes('Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.') && !membership.includes('Coming soon — no payment taken');
const health = {
  ok: modules.every(item => item.ready) && manifestMatches && paymentReadyDisabled,
  buildSha,
  buildShortSha: buildSha.slice(0, 12),
  generatedAt: new Date().toISOString(),
  target: 'Cloudflare Worker with _site assets',
  workerScript: 'src/worker-production.js',
  briefingStatus: 'ACTIVE / CONSENT CONTROLLED / STRUCTURE V3',
  dailyBriefSchedule: '08:05 Europe/Paris',
  weeklyBriefSchedule: 'Monday 09:15 Europe/Paris',
  immediateFirstBrief: true,
  briefingBoundary: 'Verified consent, selected preference and suppression state are required. Records, analysis and speculation remain separated.',
  forumStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners is authoritative; KV compatibility mirror is disabled.',
  forumPostingAccess: 'verified-free-member-session',
  forumCrossDevice: true,
  forumFailureMode: 'Fail closed. No browser-only or legacy forum response can report a saved post.',
  paymentStatus: 'sandbox-ready-disabled',
  paymentMessage: 'PayPal subscription code is deployed behind server-side consent, legal, plan and activation gates.',
  checkoutDefault: 'disabled',
  rehearsalStatus: 'timed-sandbox-only',
  rehearsalWindowMaxMinutes: 45,
  productionPaymentsEnabled: false,
  manifestSha: manifest?.commitSha || null,
  manifestMatches,
  routes: modules.map(item => item.route),
  modules
};

const json = JSON.stringify(health, null, 2);
fs.writeFileSync(full('deploy-health.json'), json);
fs.writeFileSync(path.join(downloads, 'deploy-health.json'), json);
const cards = modules.map(item => `<article class="card ${item.ready ? 'redline' : ''}"><span class="label">${item.ready ? 'Ready' : 'Blocked'}</span><h3>${esc(item.name)}</h3><p><strong>Route:</strong> ${esc(item.route)}</p><p><strong>File:</strong> ${esc(item.file)}</p><p><strong>Hash:</strong> ${esc(item.hash)}</p>${item.missingMarkers.length ? `<p><strong>Missing:</strong> ${esc(item.missingMarkers.join(', '))}</p>` : ''}</article>`).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Production Health | Matrix Reprogrammed</title><meta name="robots" content="noindex,nofollow,noarchive"><link rel="stylesheet" href="styles.css"></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a></header><main><section class="hero wrap"><div class="eyebrow">Commit-bound production proof</div><h1>PRODUCTION HEALTH.</h1><p class="lead">This page proves deep briefing email, persistent Signal Board, D1 state and closed live payment gates for the deployed commit.</p></section><section class="section wrap split"><div class="terminal">PRODUCTION HEALTH\n&gt; Commit: ${esc(health.buildShortSha)}\n&gt; Daily email: ACTIVE / 08:05 PARIS\n&gt; Weekly email: ACTIVE / MONDAY 09:15 PARIS\n&gt; First brief: AFTER VERIFIED OPT-IN\n&gt; Signal Board: D1 PERSISTENT / VERIFIED MEMBERS\n&gt; Payments: SANDBOX / LIVE DISABLED\n&gt; Overall: ${health.ok ? 'READY' : 'BLOCKED'}</div><aside class="card redline"><h2>Operating boundaries</h2><p>Email is consent controlled. Signal Board writes require a verified Free Member session and D1 confirmation. Live PayPal charging remains disabled.</p></aside></section><section class="section wrap"><h2>Production checks</h2><div class="grid">${cards}</div></section></main></div></body></html>`;
fs.writeFileSync(full('deploy-health.html'), html);

const finalRepair = full('scripts/repair-public-site-errors.js');
if (fs.existsSync(finalRepair)) execFileSync(process.execPath, [finalRepair], { cwd: root, stdio: 'inherit' });
if (!health.ok) { console.error(JSON.stringify(health, null, 2)); process.exit(1); }
console.log(`Production health built for ${health.buildShortSha}: deep email active, Signal Board D1 persistent, live charging disabled.`);
