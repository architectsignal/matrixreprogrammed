const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
fs.mkdirSync(downloads, { recursive: true });

const full = rel => path.join(root, rel);
const exists = rel => fs.existsSync(full(rel));
const read = rel => exists(rel) ? fs.readFileSync(full(rel), 'utf8') : '';
const parse = rel => { try { return JSON.parse(read(rel)); } catch { return null; } };
const hash = rel => exists(rel) ? crypto.createHash('sha256').update(fs.readFileSync(full(rel))).digest('hex').slice(0, 16) : 'missing';
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  { name: 'PayPal subscription Worker', route: '/api/paypal/config', file: 'src/worker-paypal-subscriptions.js', markers: ['cloudflare-worker-paypal-subscriptions', '/api/paypal/webhook', 'PAYPAL_PRODUCTION_ENABLED', 'paypal_runtime_settings'] },
  { name: 'Live Intel', route: '/live-intel', file: 'live-intel.html', markers: ['LIVE INTEL'] },
  { name: 'Security and privacy', route: '/security-privacy', file: 'security-privacy.html', markers: ['SECURITY'] },
  { name: 'Dark web safety', route: '/dark-web-safety', file: 'dark-web-safety.html', markers: ['DARK WEB SAFETY'] },
  { name: 'Geographic Power Atlas', route: '/geographic-power-atlas', file: 'geographic-power-atlas.html', markers: ['GEOGRAPHIC POWER ATLAS'] },
  { name: 'Public Data Laboratory', route: '/data-lab', file: 'data-lab.html', markers: ['PUBLIC DATA'] },
  { name: 'Evidence Archive', route: '/evidence-archive', file: 'evidence-archive.html', markers: ['EVIDENCE ARCHIVE'] },
  { name: 'Search the Machine', route: '/search', file: 'search.html', markers: ['SEARCH THE MACHINE'] },
  { name: 'Strict production Worker', route: '/forum-health', file: 'src/worker-production.js', markers: ['non-authoritative-forum-response-blocked', 'members-db-binding-unavailable', 'cloudflare-worker-forum-d1', 'cloudflare-worker-paypal-subscriptions'] },
  { name: 'D1 forum persistence Worker', route: '/forum-health', file: 'src/worker-forum-persistence.js', markers: ['Cloudflare D1 MEMBERS_DB.forum_posts', 'd1Connected: true', 'storedPostCount'] },
  { name: 'Cloudflare runtime preservation', route: '/forum-health', file: 'wrangler.toml', markers: ['main = "src/worker-production.js"', 'binding = "MEMBERS_DB"', 'run_worker_first = true', 'keep_vars = true', 'Runtime payment credentials and activation switches are managed in the Cloudflare dashboard'] }
].map(item => {
  const text = read(item.file);
  const missingMarkers = item.markers.filter(marker => !text.includes(marker));
  return { ...item, exists: exists(item.file), ready: exists(item.file) && missingMarkers.length === 0, missingMarkers, hash: hash(item.file) };
});

const manifestMatches = Boolean(manifest && manifest.commitSha === buildSha);
const membership = read('membership.html');
const wranglerToml = read('wrangler.toml');
const wranglerJsonc = read('wrangler.jsonc');
const paymentRuntimeReady = membership.includes('paypal-membership.js')
  && membership.includes('paypal-membership-status')
  && !membership.includes('Coming soon — no payment taken')
  && /^keep_vars\s*=\s*true\s*$/m.test(wranglerToml)
  && /"keep_vars"\s*:\s*true/.test(wranglerJsonc)
  && !/^PAYPAL_[A-Z0-9_]+\s*=/m.test(wranglerToml)
  && !/"PAYPAL_[A-Z0-9_]+"\s*:/.test(wranglerJsonc);

const health = {
  ok: modules.every(item => item.ready) && manifestMatches && paymentRuntimeReady,
  buildSha,
  buildShortSha: buildSha.slice(0, 12),
  generatedAt: new Date().toISOString(),
  target: 'Cloudflare Worker with _site assets',
  workerScript: 'src/worker-production.js',
  forumStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts is authoritative; KV is compatibility and recovery only.',
  forumFailureMode: 'Fail closed. Legacy forum responses cannot report success when D1 is missing or unhealthy.',
  paymentStatus: 'runtime-gated-dashboard-managed',
  paymentMessage: 'PayPal credentials, webhook and environment switches are managed in Cloudflare. Checkout opens only when credentials, the environment switch, the D1 switch, live confirmation and all three active plans agree.',
  checkoutDefault: 'runtime-d1-gated',
  runtimeConfigurationOwner: 'Cloudflare dashboard',
  sandboxCheckoutPolicy: 'closed outside an explicit sandbox rehearsal',
  productionPaymentsEnabled: null,
  manifestSha: manifest?.commitSha || null,
  manifestMatches,
  routes: modules.map(item => item.route),
  modules
};

const json = JSON.stringify(health, null, 2);
fs.writeFileSync(full('deploy-health.json'), json);
fs.writeFileSync(path.join(downloads, 'deploy-health.json'), json);

const cards = modules.map(item => `<article class="card ${item.ready ? 'redline' : ''}"><span class="label">${item.ready ? 'Ready' : 'Blocked'}</span><h3>${esc(item.name)}</h3><p><strong>Route:</strong> ${esc(item.route)}</p><p><strong>File:</strong> ${esc(item.file)}</p><p><strong>Hash:</strong> ${esc(item.hash)}</p>${item.missingMarkers.length ? `<p><strong>Missing:</strong> ${esc(item.missingMarkers.join(', '))}</p>` : ''}</article>`).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Production Health | Matrix Reprogrammed</title><meta name="description" content="Commit-bound Cloudflare production health, D1 persistence and runtime-gated PayPal readiness." /><meta name="robots" content="noindex,nofollow,noarchive" /><link rel="stylesheet" href="styles.css" /></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="research-tools.html">Research Tools</a><a href="membership.html">Membership</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Commit-bound production proof</div><h1>PRODUCTION HEALTH.</h1><p class="lead">This page is regenerated after every legacy builder and tied to the exact GitHub commit deployed to Cloudflare.</p><div class="cta-row"><a class="btn" href="deploy-health.json">Open Health JSON</a><a class="btn alt" href="/forum-health">Open D1 Forum Health</a></div></section><section class="section wrap split"><div class="terminal">PRODUCTION HEALTH
&gt; Commit: ${esc(health.buildShortSha)}
&gt; Generated: ${esc(health.generatedAt)}
&gt; Forum: D1 AUTHORITATIVE / FAIL CLOSED
&gt; Payments: RUNTIME GATED / DASHBOARD MANAGED
&gt; Sandbox checkout: CLOSED OUTSIDE REHEARSAL
&gt; Live charging: CONTROLLED BY WORKER + D1 GATES
&gt; Manifest match: ${health.manifestMatches ? 'YES' : 'NO'}
&gt; Overall: ${health.ok ? 'READY' : 'BLOCKED'}</div><aside class="card redline"><div class="pill">Controlled billing runtime</div><h2>PayPal state survives deployment.</h2><p>Wrangler preserves the Cloudflare dashboard credentials and switches. The Worker still requires credentials, the matching environment switch, D1 activation, live confirmation and three active plans before checkout can open.</p></aside></section><section class="section wrap"><h2>Production checks</h2><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — production health ${esc(health.buildShortSha)}</p></footer></div></body></html>`;
fs.writeFileSync(full('deploy-health.html'), html);

const finalRepair = full('scripts/repair-public-site-errors.js');
if (fs.existsSync(finalRepair)) execFileSync(process.execPath, [finalRepair], { cwd: root, stdio: 'inherit' });

if (!health.ok) {
  console.error(JSON.stringify(health, null, 2));
  process.exit(1);
}
console.log(`Production health built for ${health.buildShortSha}: D1 fail-closed and Cloudflare-managed PayPal runtime gates preserved.`);
