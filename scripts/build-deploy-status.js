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
function exists(file) {
  return fs.existsSync(path.join(root, file));
}
function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}
function envCommit() {
  return process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || 'local-build';
}
function short(value) {
  return String(value || '').slice(0, 12);
}
function esc(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function hashFile(file) {
  const data = read(file);
  return data ? crypto.createHash('sha256').update(data).digest('hex').slice(0, 16) : 'missing';
}

const worker = read('src/worker.js');
const packageJson = read('package.json');
const epsteinFiles = read('epstein-files.html');
const liveIntel = read('live-intel.html');
const buildSha = envCommit();
const generatedAt = new Date().toISOString();
const routeAliasCount = countMatches(worker, /'\/[^']+'\s*:/g);
const requiredAliases = ['/deploy-status','/epstein','/live-intel','/evidence-vault','/power-atlas','/book-universe','/offer-center','/opt-in','/rss','/forum'];
const aliasStatus = requiredAliases.map(route => ({ route, present: worker.includes(`'${route}'`) }));

const modules = [
  { name: 'Homepage', file: 'index.html', marker: 'FOLLOW THE FILES.' },
  { name: 'Live Intel', file: 'live-intel.html', marker: 'Latest Actionable Updates' },
  { name: 'Epstein Command Center', file: 'epstein-files.html', marker: 'Evidence Boundary' },
  { name: 'Epstein People Tracker', file: 'epstein-files.html', marker: 'People / Entity Tracker' },
  { name: 'Epstein Timeline Map', file: 'epstein-files.html', marker: 'Timeline + Cross-Reference Map' },
  { name: 'Epstein Evidence Ladder', file: 'epstein-files.html', marker: 'Evidence Strength Ladder' },
  { name: 'Actual Files Cockpit', file: 'epstein-files.html', marker: 'Actual Files Cockpit' },
  { name: 'Network Architecture Matrix', file: 'epstein-files.html', marker: 'Network Architecture Matrix' },
  { name: 'Forum Worker', file: 'src/worker.js', marker: 'FORUM_POSTS' },
  { name: 'Cloudflare Output Builder', file: 'scripts/build-cloudflare-output.js', marker: '_site' }
].map(item => {
  const content = read(item.file);
  return { ...item, exists: exists(item.file), markerPresent: content.includes(item.marker), hash: hashFile(item.file) };
});

const status = {
  ok: aliasStatus.every(item => item.present) && modules.every(item => item.exists && item.markerPresent),
  buildSha,
  buildShortSha: short(buildSha),
  generatedAt,
  deploymentTarget: 'Cloudflare Workers / Pages static assets via wrangler',
  buildCommand: 'npm run build',
  workerScript: 'src/worker.js',
  assetOutput: '_site',
  routeAliasCount,
  requiredAliases: aliasStatus,
  modules,
  hashes: {
    worker: hashFile('src/worker.js'),
    package: hashFile('package.json'),
    epsteinFiles: hashFile('epstein-files.html'),
    liveIntel: hashFile('live-intel.html')
  },
  pressureTests: {
    packageIncludesBuild: packageJson.includes('npm run build') || packageJson.includes('scripts'),
    cloudflareRoutesTest: packageJson.includes('cloudflare-worker-routes-test.js'),
    tenOutOfTenTest: packageJson.includes('ten-out-of-ten-pressure-test.js'),
    epsteinWatchTest: packageJson.includes('epstein-watch-pressure-test.js')
  },
  liveProof: {
    homepageExpectedMarker: 'FOLLOW THE FILES.',
    epsteinExpectedMarker: 'THE EPSTEIN FILES COMMAND CENTER / Evidence Boundary layer',
    cacheNote: 'If this page shows the latest build but the homepage looks old, purge Cloudflare cache.'
  }
};

fs.writeFileSync(path.join(root, 'deploy-status.json'), JSON.stringify(status, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'deploy-status.json'), JSON.stringify(status, null, 2));

const moduleCards = modules.map(item => `<article class="card ${item.markerPresent ? 'redline' : ''}"><span class="label">${item.markerPresent ? 'Ready' : 'Check needed'}</span><h3>${esc(item.name)}</h3><p><strong>File:</strong> ${esc(item.file)}</p><p><strong>Marker:</strong> ${esc(item.marker)}</p><p><strong>Hash:</strong> ${esc(item.hash)}</p></article>`).join('');
const aliasRows = aliasStatus.map(item => `<tr><td>${esc(item.route)}</td><td>${item.present ? 'Present' : 'Missing'}</td></tr>`).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Deploy Status | Matrix Reprogrammed</title><meta name="description" content="Cloudflare deployment status, build marker, route aliases, and upgrade verification for Matrix Reprogrammed." /><link rel="stylesheet" href="styles.css" /></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="epstein-files.html">Epstein Files</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Cloudflare Deploy Verification</div><h1>DEPLOY STATUS.</h1><p class="lead">This page proves which build is live, which route aliases are in the Cloudflare Worker, and whether the latest Matrix Reprogrammed upgrade modules are present in the deployed output.</p><div class="cta-row"><a class="btn" href="deploy-status.json">Open Status JSON</a><a class="btn alt" href="downloads/deploy-status.json">Download Status</a><a class="btn alt" href="forum-health">Forum Health</a></div></section><section class="section wrap split"><div class="terminal">DEPLOY STATUS\n&gt; Build SHA: ${esc(short(buildSha))}\n&gt; Generated: ${esc(generatedAt)}\n&gt; Target: Cloudflare Worker / _site assets\n&gt; Worker aliases: ${routeAliasCount}\n&gt; Overall status: ${status.ok ? 'READY' : 'CHECK NEEDED'}</div><aside class="card redline"><div class="pill">Live Proof</div><h2>What to check after deploy</h2><p>Open the homepage and confirm it says <strong>FOLLOW THE FILES.</strong>. Open <strong>/epstein</strong> and confirm the Command Center loads. If not, purge Cloudflare cache.</p></aside></section><section class="section wrap"><h2>Cloudflare Route Aliases</h2><table><thead><tr><th>Route</th><th>Status</th></tr></thead><tbody>${aliasRows}</tbody></table></section><section class="section wrap"><h2>Upgrade Modules</h2><div class="grid">${moduleCards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — deploy marker ${esc(short(buildSha))}</p></footer></div></body></html>`;
fs.writeFileSync(path.join(root, 'deploy-status.html'), html);

console.log(`Built deploy status page with build ${short(buildSha)}, ${routeAliasCount} Worker route aliases, and ${modules.length} module checks.`);
