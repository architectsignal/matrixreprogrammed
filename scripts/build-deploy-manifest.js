const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const builtSiteEntry = path.join(site, 'index.html');
const moneyFinalizer = path.join(root, 'scripts', 'finalize-money-intelligence-release.js');
// Metadata-only proof workflows create an empty _site directory before building
// release aliases. Run the full Money finalizer only when a real site bundle exists.
if (fs.existsSync(builtSiteEntry) && fs.existsSync(moneyFinalizer)) {
  execFileSync(process.execPath, [moneyFinalizer], { cwd: root, stdio: 'inherit', env: process.env });
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function json(rel, fallback = {}) { try { return JSON.parse(read(rel)); } catch { return fallback; } }
function hash(rel) { const file = path.join(root, rel); return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; }
function gitSha() {
  const supplied = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if (/^[a-f0-9]{40}$/i.test(supplied)) return supplied;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return supplied || 'unknown'; }
}
function timestamp(rel, fields) { const data = json(rel, {}); for (const field of fields) if (data[field]) return data[field]; return null; }

const commitSha = gitSha();
const criticalFiles = [
  'index.html', 'start-here.html', 'live-intel.html', 'daily-power-conclusions.html',
  'daily-investigation-conclusions.html', 'weekly-investigation-report.html',
  'daily-brain-brief.html', 'outcome-briefings.html', 'security-privacy.html',
  'dark-web-safety.html', 'geographic-power-atlas.html', 'data-lab.html',
  'follow-the-money.html', 'making-money.html', 'follow-the-money.js', 'making-money.js', 'money-intelligence.css',
  'follow-the-money/people/elon-musk.html', 'downloads/wealth-guides/start-from-zero.pdf',
  'data/follow-the-money-top-100.json', 'data/making-money-core.json',
  'data/live-intel.json', 'data/daily-power-conclusions.json',
  'data/daily-investigation-conclusions.json', 'data/daily-brain-brief.json',
  'data/outcome-briefings.json'
];
const manifest = {
  ok: true,
  commitSha,
  commitShort: commitSha.slice(0, 12),
  generatedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || 'main',
  repository: process.env.GITHUB_REPOSITORY || 'architectsignal/matrixreprogrammed',
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  deploymentTarget: 'Cloudflare Workers static assets',
  cachePolicy: 'Critical HTML, live data and deploy manifest must revalidate or use no-store.',
  freshness: {
    liveIntel: timestamp('data/live-intel.json', ['updated']),
    dailyInvestigation: timestamp('data/daily-investigation-conclusions.json', ['generatedAt']),
    dailyPower: timestamp('data/daily-power-conclusions.json', ['updated']),
    dailyBrain: timestamp('data/daily-brain-brief.json', ['updated']),
    outcomes: timestamp('data/outcome-briefings.json', ['updated'])
  },
  criticalFiles: Object.fromEntries(criticalFiles.map(rel => [rel, hash(rel)])),
  verificationRoutes: [
    '/', '/start-here', '/live-intel', '/daily-power-conclusions', '/daily-investigation-conclusions',
    '/security-privacy', '/dark-web-safety', '/geographic-power-atlas', '/data-lab', '/evidence-archive',
    '/follow-the-money', '/making-money', '/follow-the-money/people/elon-musk',
    '/downloads/wealth-guides/start-from-zero.pdf'
  ]
};
const missingCritical = Object.entries(manifest.criticalFiles).filter(([, value]) => !value).map(([rel]) => rel);
if (missingCritical.length) throw new Error(`Deployment manifest missing critical money or production files: ${missingCritical.join(', ')}`);
const text = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(root, 'deploy-manifest.json'), text);
if (fs.existsSync(site)) {
  fs.writeFileSync(path.join(site, 'deploy-manifest.json'), text);
  fs.writeFileSync(path.join(site, 'deploy-manifest'), text);
}
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'deploy-manifest.json'), text);
console.log(`Deployment manifest built for ${manifest.commitShort}.`);
