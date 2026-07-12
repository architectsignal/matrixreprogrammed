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
  { name: 'Membership tiers', route: '/membership', file: 'membership.html', markers: ['<!-- membership-tiers:start -->', '€3', '€6', '€9', 'Coming soon — no payment taken'] },
  { name: 'Live Intel', route: '/live-intel', file: 'live-intel.html', markers: ['LIVE INTEL'] },
  { name: 'Security and privacy', route: '/security-privacy', file: 'security-privacy.html', markers: ['SECURITY'] },
  { name: 'Dark web safety', route: '/dark-web-safety', file: 'dark-web-safety.html', markers: ['DARK WEB SAFETY'] },
  { name: 'Geographic Power Atlas', route: '/geographic-power-atlas', file: 'geographic-power-atlas.html', markers: ['GEOGRAPHIC POWER ATLAS'] },
  { name: 'Public Data Laboratory', route: '/data-lab', file: 'data-lab.html', markers: ['PUBLIC DATA'] },
  { name: 'Evidence Archive', route: '/evidence-archive', file: 'evidence-archive.html', markers: ['EVIDENCE ARCHIVE'] },
  { name: 'Ask Matrix search', route: '/search', file: 'search.html', markers: ['ASK MATRIX'] },
  { name: 'Strict production Worker', route: '/forum-health', file: 'src/worker-production.js', markers: ['non-authoritative-forum-response-blocked', 'members-db-binding-unavailable', 'cloudflare-worker-forum-d1'] },
  { name: 'D1 forum persistence Worker', route: '/forum-health', file: 'src/worker-forum-persistence.js', markers: ['Cloudflare D1 MEMBERS_DB.forum_posts', 'd1Connected: true', 'storedPostCount'] },
  { name: 'Cloudflare D1 binding', route: '/forum-health', file: 'wrangler.toml', markers: ['main = "src/worker-production.js"', 'binding = "MEMBERS_DB"', 'run_worker_first = true'] }
].map(item => {
  const text = read(item.file);
  const missingMarkers = item.markers.filter(marker => !text.includes(marker));
  return { ...item, exists: exists(item.file), ready: exists(item.file) && missingMarkers.length === 0, missingMarkers, hash: hash(item.file) };
});

const manifestMatches = Boolean(manifest && manifest.commitSha === buildSha);
const paymentDeferred = read('membership.html').includes('Coming soon — no payment taken');
const health = {
  ok: modules.every(item => item.ready) && manifestMatches && paymentDeferred,
  buildSha,
  buildShortSha: buildSha.slice(0, 12),
  generatedAt: new Date().toISOString(),
  target: 'Cloudflare Worker with _site assets',
  workerScript: 'src/worker-production.js',
  forumStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts is authoritative; KV is compatibility and recovery only.',
  forumFailureMode: 'Fail closed. Legacy forum responses cannot report success when D1 is missing or unhealthy.',
  paymentStatus: 'deferred',
  paymentMessage: 'Membership prices and benefits are published; checkout remains disabled and no payment is taken.',
  manifestSha: manifest?.commitSha || null,
  manifestMatches,
  routes: modules.map(item => item.route),
  modules
};

const json = JSON.stringify(health, null, 2);
fs.writeFileSync(full('deploy-health.json'), json);
fs.writeFileSync(path.join(downloads, 'deploy-health.json'), json);

const cards = modules.map(item => `<article class="card ${item.ready ? 'redline' : ''}"><span class="label">${item.ready ? 'Ready' : 'Blocked'}</span><h3>${esc(item.name)}</h3><p><strong>Route:</strong> ${esc(item.route)}</p><p><strong>File:</strong> ${esc(item.file)}</p><p><strong>Hash:</strong> ${esc(item.hash)}</p>${item.missingMarkers.length ? `<p><strong>Missing:</strong> ${esc(item.missingMarkers.join(', '))}</p>` : ''}</article>`).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Production Health | Matrix Reprogrammed</title><meta name="description" content="Commit-bound Cloudflare production health, D1 forum persistence and payment-deferred status." /><meta name="robots" content="noindex,nofollow,noarchive" /><link rel="stylesheet" href="styles.css" /></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="research-tools.html">Research Tools</a><a href="membership.html">Membership</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Commit-bound production proof</div><h1>PRODUCTION HEALTH.</h1><p class="lead">This page is regenerated after every legacy builder and tied to the exact GitHub commit deployed to Cloudflare.</p><div class="cta-row"><a class="btn" href="deploy-health.json">Open Health JSON</a><a class="btn alt" href="forum-health">Open D1 Forum Health</a></div></section><section class="section wrap split"><div class="terminal">PRODUCTION HEALTH\n&gt; Commit: ${esc(health.buildShortSha)}\n&gt; Generated: ${esc(health.generatedAt)}\n&gt; Forum: D1 AUTHORITATIVE / FAIL CLOSED\n&gt; Payments: DEFERRED / NO PAYMENT TAKEN\n&gt; Manifest match: ${health.manifestMatches ? 'YES' : 'NO'}\n&gt; Overall: ${health.ok ? 'READY' : 'BLOCKED'}</div><aside class="card redline"><div class="pill">Payments later</div><h2>The membership system stays pre-launch.</h2><p>Prices and benefits remain visible, but checkout stays disabled until payment and member-delivery testing is deliberately activated.</p></aside></section><section class="section wrap"><h2>Production checks</h2><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — production health ${esc(health.buildShortSha)}</p></footer></div></body></html>`;
fs.writeFileSync(full('deploy-health.html'), html);

if (!health.ok) {
  console.error(JSON.stringify(health, null, 2));
  process.exit(1);
}
console.log(`Production health built for ${health.buildShortSha}: D1 fail-closed, payments deferred.`);
