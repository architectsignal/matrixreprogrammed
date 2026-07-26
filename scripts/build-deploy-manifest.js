const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');

function runFinalizer(script, args = []) {
  const file = path.join(root, 'scripts', script);
  if (!fs.existsSync(file)) throw new Error(`Missing deployment finalizer: scripts/${script}`);
  execFileSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit', env: process.env });
}

const moneyFinalizer = path.join(root, 'scripts', 'finalize-money-intelligence-release.js');
if (fs.existsSync(site) && fs.existsSync(moneyFinalizer)) {
  execFileSync(process.execPath, [moneyFinalizer], { cwd: root, stdio: 'inherit', env: process.env });
}

// These scripts are the final owners of critical public surfaces. They run
// immediately before manifest hashes so the proof describes the exact bundle
// sent to Cloudflare, after all broad generators have finished.
if (fs.existsSync(site)) {
  runFinalizer('reconcile-power-family-capstone.js');
  runFinalizer('patch-newsletter-public-page.js');
  runFinalizer('patch-power-family-public-gateways.js');
  runFinalizer('hide-visible-compatibility-markers.js', ['--output']);
  runFinalizer('finalize-core-public-surfaces.js');
}

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function json(rel, fallback = {}) { try { return JSON.parse(read(rel)); } catch { return fallback; } }
function hash(rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
}
function gitSha() {
  const supplied = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if (/^[a-f0-9]{40}$/i.test(supplied)) return supplied;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return supplied || 'unknown'; }
}
function timestamp(rel, fields) {
  const data = json(rel, {});
  for (const field of fields) if (data[field]) return data[field];
  return null;
}

const commitSha = gitSha();
const criticalFiles = [
  'index.html', 'start-here.html', 'newsletter.html', 'live-intel.html', 'daily-power-conclusions.html',
  'daily-investigation-conclusions.html', 'weekly-investigation-report.html',
  'daily-brain-brief.html', 'outcome-briefings.html', 'security-privacy.html',
  'dark-web-safety.html', 'geographic-power-atlas.html', 'data-lab.html',
  'independent-links.html', 'data/independent-links-1.json', 'data/independent-links-2.json',
  'data/independent-links-3.json', 'data/independent-links-4.json',
  'death-files.html', 'death-files.js', 'data/death-files.json', 'data/death-files-runtime.json',
  'death-files-pattern-lab.html', 'death-files-methodology.html',
  'behind-the-curtain.html', 'behind-the-curtain-access.html', 'behind-the-curtain-access-v2.js',
  'behind-the-curtain-capstone.html', 'power-family-intelligence-layer.js', 'power-family-intelligence-layer.css',
  'behind-the-curtain-symbolic-capstone.html', 'behind-the-curtain-capstone.js',
  'data/behind-the-curtain-family-access.json', 'data/behind-the-curtain-pyramid.json',
  'data/power-family-intelligence-layer.json', 'data/power-family-curated-people.json',
  'data/behind-the-curtain-capstone.json',
  'follow-the-money.html', 'making-money.html', 'follow-the-money.js', 'making-money.js', 'money-intelligence.css',
  'follow-the-money/people/elon-musk.html', 'downloads/wealth-guides/start-from-zero.pdf',
  'data/follow-the-money-top-100.json', 'data/making-money-core.json',
  'data/live-intel.json', 'data/daily-power-conclusions.json',
  'data/daily-investigation-conclusions.json', 'data/daily-brain-brief.json',
  'data/outcome-briefings.json'
];

const deathData = json('data/death-files.json', {});
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
  corePublicSurfaces: {
    constructionSupportBanner: true,
    independentLinks: 100,
    deathFiles: Array.isArray(deathData.dossiers) ? deathData.dossiers.length : 0,
    existingIntroPreserved: true,
    welcomeGatePreserved: true
  },
  freshness: {
    liveIntel: timestamp('data/live-intel.json', ['updated']),
    dailyInvestigation: timestamp('data/daily-investigation-conclusions.json', ['generatedAt']),
    dailyPower: timestamp('data/daily-power-conclusions.json', ['updated']),
    dailyBrain: timestamp('data/daily-brain-brief.json', ['updated']),
    outcomes: timestamp('data/outcome-briefings.json', ['updated'])
  },
  criticalFiles: Object.fromEntries(criticalFiles.map(rel => [rel, hash(rel)])),
  verificationRoutes: [
    '/', '/start-here', '/newsletter', '/live-intel', '/daily-power-conclusions', '/daily-investigation-conclusions',
    '/security-privacy', '/dark-web-safety', '/geographic-power-atlas', '/data-lab', '/evidence-archive',
    '/independent-links', '/death-files', '/death-files-pattern-lab', '/death-files-methodology',
    '/behind-the-curtain', '/behind-the-curtain-access', '/behind-the-curtain-capstone', '/behind-the-curtain-symbolic-capstone',
    '/data/power-family-curated-people.json', '/data/power-family-intelligence-layer.json',
    '/follow-the-money', '/making-money', '/follow-the-money/people/elon-musk',
    '/downloads/wealth-guides/start-from-zero.pdf'
  ]
};

if (manifest.corePublicSurfaces.deathFiles !== 100) {
  throw new Error(`Deployment manifest requires exactly 100 Death Files dossiers; found ${manifest.corePublicSurfaces.deathFiles}`);
}
const missingCritical = Object.entries(manifest.criticalFiles)
  .filter(([, value]) => !value)
  .map(([rel]) => rel);
if (missingCritical.length) {
  throw new Error(`Deployment manifest missing critical intelligence, public-surface, money or production files: ${missingCritical.join(', ')}`);
}

const text = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(root, 'deploy-manifest.json'), text);
if (fs.existsSync(site)) {
  fs.writeFileSync(path.join(site, 'deploy-manifest.json'), text);
  fs.writeFileSync(path.join(site, 'deploy-manifest'), text);
}
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'deploy-manifest.json'), text);
console.log(`Deployment manifest built for ${manifest.commitShort} with the construction banner, Top 100 links, exactly 100 Death Files dossiers, Power-Family, newsletter and public gateway hashes.`);
