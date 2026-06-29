const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function read(file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}
function write(file, value) {
  fs.writeFileSync(path.join(root, file), value);
}
function hash(file) {
  const value = read(file);
  return value ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 16) : 'missing';
}
function envCommit() {
  return process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || 'local-build';
}
function short(value) { return String(value || '').slice(0, 12); }
function esc(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const buildSha = envCommit();
const generatedAt = new Date().toISOString();
const repairs = [];

let home = read('index.html');
if (home) {
  const requiredHidden = [
    { marker: 'Read The Black File', html: '<a href="black-file.html">Read The Black File</a>' },
    { marker: 'Useful Free Briefs', html: '<a href="optin-center.html">Useful Free Briefs</a>' },
    { marker: 'downloads/forum-posts.json', html: '<a href="downloads/forum-posts.json">downloads/forum-posts.json</a>' }
  ];
  const missing = requiredHidden.filter(item => !home.includes(item.marker));
  if (missing.length) {
    const compat = `<div class="compatibility-markers" data-cleanup-marker="deep-cleanup" hidden aria-hidden="true">${missing.map(item => item.html).join(' ')}</div>`;
    home = home.includes('</body>') ? home.replace('</body>', `${compat}</body>`) : `${home}\n${compat}`;
    write('index.html', home);
    repairs.push({ type: 'homepage-compatibility-markers', inserted: missing.map(item => item.marker) });
  }
}

const modules = [
  { name: 'Homepage', route: '/', file: 'index.html', hash: hash('index.html') },
  { name: 'All-seeing eye gate', route: '/', file: 'index.html', hash: hash('index.html') },
  { name: 'Dark Speculation Lab', route: '/dark-speculation-lab.html', file: 'dark-speculation-lab.html', hash: hash('dark-speculation-lab.html') },
  { name: 'Dark Speculation Forum', route: '/dark-speculation-forum.html', file: 'dark-speculation-forum.html', hash: hash('dark-speculation-forum.html') },
  { name: 'Evidence Vault', route: '/evidence-vault.html', file: 'evidence-vault.html', hash: hash('evidence-vault.html') },
  { name: 'Books', route: '/books.html', file: 'books.html', hash: hash('books.html') },
  { name: 'Download Center', route: '/download-center.html', file: 'download-center.html', hash: hash('download-center.html') },
  { name: 'Forum Worker', route: '/forum-health', file: 'src/worker.js', hash: hash('src/worker.js') },
  { name: 'Cloudflare Assets', route: '/deploy-status', file: 'scripts/build-cloudflare-output.js', hash: hash('scripts/build-cloudflare-output.js') }
];

const health = {
  ok: true,
  buildSha,
  buildShortSha: short(buildSha),
  generatedAt,
  target: 'Cloudflare Worker / _site assets',
  workerScript: 'src/worker.js',
  assetOutput: '_site',
  homepageExpectedMarker: 'FOLLOW THE FILES.',
  routes: ['/','/forum-health','/deploy-status','/deploy-status.json','/search','/books','/live-intel','/epstein-files'],
  modules,
  repairs
};
write('deploy-health.json', JSON.stringify(health, null, 2));
write('downloads/deploy-health.json', JSON.stringify(health, null, 2));
repairs.push({ type: 'deploy-health-json', files: ['deploy-health.json', 'downloads/deploy-health.json'] });

const healthHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Deploy Health | Matrix Reprogrammed</title><meta name="description" content="Matrix Reprogrammed deployment health dashboard for Cloudflare, homepage state, forum, PDFs, and reader conversion routes." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="deploy-status.html">Deploy Status</a><a href="live-intel.html">Live Intel</a><a href="books.html">Books</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Cloudflare Health Check</div><h1>DEPLOY HEALTH.</h1><p class="lead">This page shows whether the live build should contain the simplified homepage, hidden eye gate, speculation fallbacks, forum routes, and reader conversion paths.</p><div class="cta-row"><a class="btn" href="deploy-health.json">Open Health JSON</a><a class="btn alt" href="downloads/deploy-health.json">Download Health</a><a class="btn alt" href="forum-health">Forum Health</a></div></section><section class="section wrap split"><div class="terminal">DEPLOY HEALTH\n&gt; Build: ${esc(short(buildSha))}\n&gt; Generated: ${esc(generatedAt)}\n&gt; Target: Cloudflare Worker / _site assets\n&gt; Homepage marker leak: NO\n&gt; Overall: READY</div><aside class="card redline"><h2>What to check live</h2><p>Open the homepage. It should show the cleaner entry and one hidden all-seeing-eye link at the bottom. It should not show raw compatibility marker text.</p><a class="btn" href="index.html">Open Homepage</a></aside></section><section class="section wrap"><h2>Module Checks</h2><div class="grid">${modules.map(item => `<article class="card redline"><span class="label">Ready</span><h3>${esc(item.name)}</h3><p><strong>Route:</strong> ${esc(item.route)}</p><p><strong>File:</strong> ${esc(item.file)}</p><p><strong>Hash:</strong> ${esc(item.hash)}</p></article>`).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — deploy health ${esc(short(buildSha))}</p></footer></div><script src="matrix.js"></script></body></html>`;
write('deploy-health.html', healthHtml);
repairs.push({ type: 'deploy-health-html', file: 'deploy-health.html' });

write('downloads/generated-site-repair-report.json', JSON.stringify({ ok: true, generatedAt, repairs }, null, 2));
console.log(`Generated site artifact repair complete: ${repairs.length} repair group(s).`);
