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
function commitSha() {
  const supplied = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || '';
  if (/^[a-f0-9]{40}$/i.test(supplied)) return supplied;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return supplied || 'unknown'; }
}

const buildSha = commitSha();
const manifest = parse('deploy-manifest.json');
const modules = [
  { name: 'Homepage eye-to-mask sequence', route: '/', file: 'index.html', markers: ['data-homepage-mask-intro', 'assets/intro-eye.svg', 'assets/intro-mask.svg'] },
  { name: 'Server-gated membership tiers', route: '/membership', file: 'membership.html', markers: ['Free Member', '€3', '€6', '€9', 'paypal-membership.js', 'paypal-membership-status'] },
  { name: 'Member billing dashboard', route: '/billing-dashboard', file: 'billing-dashboard.html', markers: ['billing-dashboard.js'] },
  { name: 'Payment administration', route: '/admin-payment-dashboard', file: 'admin-payment-dashboard.html', markers: ['admin-payment-dashboard.js'] },
  { name: 'Phase 7 sandbox rehearsal control room', route: '/admin-paypal-rehearsal', file: 'admin-paypal-rehearsal.html', markers: ['PAYPAL SANDBOX REHEARSAL.', 'maximum 45-minute window', 'admin-paypal-rehearsal.js'] },
  { name: 'PayPal subscription Worker', route: '/api/paypal/config', file: 'src/worker-paypal-subscriptions.js', markers: ['cloudflare-worker-paypal-subscriptions', '/api/paypal/webhook', 'PAYPAL_SANDBOX_ENABLED', 'paypal_runtime_settings'] },
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
  { name: 'D1 forum persistence Worker', route: '/forum-health', file: 'src/worker-forum-persistence.js', markers: ['Cloudflare D1 MEMBERS_DB.forum_posts', 'd1Connected: true', 'storedPostCount'] },
  { name: 'Cloudflare D1 binding', route: '/forum-health', file: 'wrangler.toml', markers: ['main = "src/worker-production.js"', 'binding = "MEMBERS_DB"', 'run_worker_first = true', 'PAYPAL_SANDBOX_ENABLED = "true"', 'PAYPAL_PRODUCTION_ENABLED = "false"'] }
].map(item => {
  const text = read(item.file);
  const missingMarkers = item.markers.filter(marker => !text.includes(marker));
  return { ...item, exists: exists(item.file), ready: exists(item.file) && missingMarkers.length === 0, missingMarkers, hash: hash(item.file) };
});

const manifestMatches = Boolean(manifest && manifest.commitSha === buildSha);
const membership = read('membership.html');
const paymentReadyDisabled = membership.includes('paypal-membership.js')
  && membership.includes('Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.')
  && !membership.includes('Coming soon — no payment taken');
const health = {
  ok: modules.every(item => item.ready) && manifestMatches && paymentReadyDisabled,
  buildSha,
  buildShortSha: buildSha.slice(0, 12),
  generatedAt: new Date().toISOString(),
  target: 'Cloudflare Worker with _site assets',
  workerScript: 'src/worker-production.js',
  forumStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts is authoritative; KV is compatibility and recovery only.',
  forumFailureMode: 'Fail closed. Legacy forum responses cannot report success when D1 is missing or unhealthy.',
  paymentStatus: 'sandbox-ready-disabled',
  paymentMessage: 'PayPal subscription code is deployed behind server-side gates; checkout remains disabled until Cloudflare configuration, D1 activation and verified plans agree.',
  checkoutDefault: 'disabled',
  rehearsalStatus: 'timed-sandbox-only',
  rehearsalWindowMaxMinutes: 45,
  rehearsalMessage: 'Sandbox checkout may open only inside an administrator-started Phase 7 rehearsal. Expiry, abort or completion closes checkout automatically.',
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
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Production Health | Matrix Reprogrammed</title><meta name="description" content="Commit-bound Cloudflare production health, D1 persistence and server-gated PayPal readiness." /><meta name="robots" content="noindex,nofollow,noarchive" /><link rel="stylesheet" href="styles.css" /></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="research-tools.html">Research Tools</a><a href="membership.html">Membership</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Commit-bound production proof</div><h1>PRODUCTION HEALTH.</h1><p class="lead">This page is regenerated after every legacy builder and tied to the exact GitHub commit deployed to Cloudflare.</p><div class="cta-row"><a class="btn" href="deploy-health.json">Open Health JSON</a><a class="btn alt" href="forum-health">Open D1 Forum Health</a></div></section><section class="section wrap split"><div class="terminal">PRODUCTION HEALTH
&gt; Commit: ${esc(health.buildShortSha)}
&gt; Generated: ${esc(health.generatedAt)}
&gt; Forum: D1 AUTHORITATIVE / FAIL CLOSED
&gt; Payments: SANDBOX READY / CHECKOUT DISABLED
&gt; Rehearsal: TIMED SANDBOX ONLY / 45 MIN MAX
&gt; Live charging: DISABLED
&gt; Manifest match: ${health.manifestMatches ? 'YES' : 'NO'}
&gt; Overall: ${health.ok ? 'READY' : 'BLOCKED'}</div><aside class="card redline"><div class="pill">Phase 7 controlled billing test</div><h2>PayPal is deployed but closed by default.</h2><p>The Free Member tier is active. Sandbox checkout can open only during a timed administrator rehearsal. Production charging remains disabled.</p></aside></section><section class="section wrap"><h2>Production checks</h2><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — production health ${esc(health.buildShortSha)}</p></footer></div></body></html>`;
fs.writeFileSync(full('deploy-health.html'), html);

if (!health.ok) {
  console.error(JSON.stringify(health, null, 2));
  process.exit(1);
}
console.log(`Production health built for ${health.buildShortSha}: D1 fail-closed, Phase 7 timed sandbox rehearsal ready, live charging disabled.`);
