const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const hard = [];
const soft = [];
function source(rel) { return path.join(root, rel); }
function built(rel) { return path.join(site, rel); }
function exists(rel) { return fs.existsSync(source(rel)); }
function siteExists(rel) { return fs.existsSync(built(rel)); }
function read(rel) { return fs.readFileSync(source(rel), 'utf8'); }
function siteRead(rel) { return fs.readFileSync(built(rel), 'utf8'); }
function parse(file, fromSite = false) {
  try { return JSON.parse(fromSite ? siteRead(file) : read(file)); }
  catch (error) { hard.push(`${fromSite ? '_site/' : ''}${file} invalid JSON: ${error.message}`); return null; }
}
function need(rel) { if (!exists(rel)) hard.push(`missing source file: ${rel}`); }
function needSite(rel) { if (!siteExists(rel)) hard.push(`missing built asset: _site/${rel}`); }
function requireText(rel, text, fromSite = false) {
  const available = fromSite ? siteExists(rel) : exists(rel);
  if (!available || !(fromSite ? siteRead(rel) : read(rel)).includes(text)) hard.push(`${fromSite ? '_site/' : ''}${rel} missing ${text}`);
}
function duplicateIds(html) {
  const ids = [...String(html).matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

const requiredSource = [
  'index.html', 'start-here.html', 'membership.html', 'live-intel.html', 'daily-power-conclusions.html',
  'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html',
  'security-privacy.html', 'dark-web-safety.html', 'geographic-power-atlas.html', 'data-lab.html',
  'evidence-archive.html', 'search.html', 'deploy-manifest.json', 'deploy-health.html', 'deploy-health.json',
  'data/production-freshness-policy.json', 'data/live-intel.json', 'data/daily-power-conclusions.json',
  'data/daily-investigation-conclusions.json', 'data/daily-brain-brief.json', 'data/outcome-briefings.json',
  'src/worker.js', 'src/worker-forum-persistence.js', 'src/worker-production.js',
  'migrations/0004_forum_persistence.sql', 'scripts/forum-persistence-d1-test.js',
  'scripts/build-production-health.js', 'wrangler.toml', 'wrangler.jsonc'
];
const requiredBuilt = [
  'index.html', 'index', 'start-here.html', 'start-here', 'membership.html', 'membership',
  'live-intel.html', 'live-intel', 'daily-power-conclusions.html', 'daily-power-conclusions',
  'daily-investigation-conclusions.html', 'daily-investigation-conclusions',
  'daily-brain-brief.html', 'daily-brain-brief', 'outcome-briefings.html', 'outcome-briefings',
  'security-privacy.html', 'security-privacy', 'dark-web-safety.html', 'dark-web-safety',
  'geographic-power-atlas.html', 'geographic-power-atlas', 'data-lab.html', 'data-lab',
  'evidence-archive.html', 'evidence-archive', 'search.html', 'search',
  'deploy-manifest.json', 'deploy-manifest', 'deploy-health.html', 'deploy-health', 'deploy-health.json',
  'downloads/deploy-health.json', 'data/live-intel.json', 'data/daily-power-conclusions.json',
  'data/daily-investigation-conclusions.json', 'data/daily-brain-brief.json', 'data/outcome-briefings.json'
];
requiredSource.forEach(need);
requiredBuilt.forEach(needSite);

for (const rel of ['index.html', 'start-here.html', 'membership.html', 'live-intel.html', 'daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html', 'deploy-health.html']) {
  if (exists(rel)) {
    const duplicates = duplicateIds(read(rel));
    if (duplicates.length) hard.push(`${rel} duplicate IDs: ${duplicates.join(', ')}`);
  }
  if (siteExists(rel)) {
    const duplicates = duplicateIds(siteRead(rel));
    if (duplicates.length) hard.push(`_site/${rel} duplicate IDs: ${duplicates.join(', ')}`);
  }
}

requireText('index.html', 'Security Tools');
requireText('index.html', 'Dark Web Safety');
requireText('membership.html', 'Coming soon — no payment taken');
requireText('deploy-health.html', 'D1 AUTHORITATIVE / FAIL CLOSED');
requireText('deploy-health.html', 'Payments: DEFERRED / NO PAYMENT TAKEN');
requireText('deploy-health.html', 'D1 AUTHORITATIVE / FAIL CLOSED', true);
for (const rel of ['daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html']) {
  requireText(rel, '<!-- conclusion-integrity:start -->');
  requireText(rel, '<!-- conclusion-integrity:start -->', true);
}

const expectedSha = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';
const manifest = exists('deploy-manifest.json') ? parse('deploy-manifest.json') : null;
const builtManifest = siteExists('deploy-manifest.json') ? parse('deploy-manifest.json', true) : null;
const health = exists('deploy-health.json') ? parse('deploy-health.json') : null;
const builtHealth = siteExists('deploy-health.json') ? parse('deploy-health.json', true) : null;
if (manifest && expectedSha && manifest.commitSha !== expectedSha) hard.push(`source deploy manifest SHA ${manifest.commitSha} does not match expected ${expectedSha}`);
if (builtManifest && expectedSha && builtManifest.commitSha !== expectedSha) hard.push(`built deploy manifest SHA ${builtManifest.commitSha} does not match expected ${expectedSha}`);
if (manifest && builtManifest && manifest.commitSha !== builtManifest.commitSha) hard.push('source and built deploy manifests disagree');
for (const [label, item] of [['source', health], ['built', builtHealth]]) {
  if (!item) continue;
  if (!item.ok) hard.push(`${label} production health reports not ready`);
  if (expectedSha && item.buildSha !== expectedSha) hard.push(`${label} production health SHA ${item.buildSha} does not match expected ${expectedSha}`);
  if (item.manifestSha !== expectedSha) hard.push(`${label} production health manifest SHA ${item.manifestSha} does not match expected ${expectedSha}`);
  if (item.workerScript !== 'src/worker-production.js') hard.push(`${label} production health does not name strict Worker`);
  if (item.paymentStatus !== 'deferred') hard.push(`${label} production health does not keep payments deferred`);
}

const freshnessReport = exists('downloads/production-freshness-guard.json') ? parse('downloads/production-freshness-guard.json') : null;
if (!freshnessReport) hard.push('production freshness report missing');
else if (!freshnessReport.ok) hard.push(`production freshness guard reports ${freshnessReport.hardIssues?.length || 1} issue(s)`);

for (const text of ['env.ASSETS.fetch', '/api/membership/signup', '/api/paypal/webhook', '/api/tools/jobs']) {
  if (!read('src/worker.js').includes(text)) hard.push(`src/worker.js missing delegated route marker ${text}`);
}
for (const text of [
  "import forumWorker from './worker-forum-persistence.js'",
  'members-db-binding-unavailable',
  'non-authoritative-forum-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'",
  "return forumWorker.fetch(request, env, ctx)"
]) {
  if (!read('src/worker-production.js').includes(text)) hard.push(`strict production Worker missing ${text}`);
}
for (const text of [
  "import legacyWorker from './worker.js'",
  '/forum-health', '/forum-feed-main', '/submit-main-post',
  'CREATE TABLE IF NOT EXISTS forum_posts', 'Cloudflare D1 MEMBERS_DB.forum_posts',
  'kv_forum_migration_v1', 'return legacyWorker.fetch(request, env, ctx)'
]) {
  if (!read('src/worker-forum-persistence.js').includes(text)) hard.push(`forum persistence wrapper missing ${text}`);
}
for (const text of ['CREATE TABLE IF NOT EXISTS forum_posts', 'CREATE TABLE IF NOT EXISTS forum_reports', 'idx_forum_posts_board_created']) {
  if (!read('migrations/0004_forum_persistence.sql').includes(text)) hard.push(`forum persistence migration missing ${text}`);
}
for (const text of ['main = "src/worker-production.js"', 'binding = "FORUM_POSTS"', 'binding = "MEMBERS_DB"', 'directory = "./_site"', 'run_worker_first = true']) {
  if (!read('wrangler.toml').includes(text)) hard.push(`wrangler.toml missing ${text}`);
}
for (const text of ['"main": "src/worker-production.js"', '"binding": "FORUM_POSTS"', '"binding": "MEMBERS_DB"']) {
  if (!read('wrangler.jsonc').includes(text)) hard.push(`wrangler.jsonc missing ${text}`);
}
if (siteExists('_redirects')) hard.push('_site/_redirects must not be deployed for Worker assets');

const report = {
  ok: hard.length === 0,
  generatedAt: new Date().toISOString(),
  expectedSha,
  manifestSha: manifest?.commitSha || null,
  builtManifestSha: builtManifest?.commitSha || null,
  healthSha: health?.buildSha || null,
  builtHealthSha: builtHealth?.buildSha || null,
  hardIssues: hard,
  softIssues: soft,
  forumPersistence: 'Cloudflare D1 is authoritative behind a strict fail-closed production Worker.',
  paymentStatus: 'Deferred; membership checkout remains disabled and no payment is taken.',
  boundary: 'Deployment is blocked on missing critical routes, stale intelligence, duplicate IDs, absent confidence cards, invalid manifests, health/SHA drift, legacy forum fallback or activated payments.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-deploy-guard-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'production-deploy-guard-report.md'), `# Production Deploy Guard\n\nGenerated: ${report.generatedAt}\nResult: ${report.ok ? 'PASS' : 'FAIL'}\nExpected SHA: ${expectedSha}\nManifest SHA: ${report.manifestSha}\nHealth SHA: ${report.healthSha}\nForum storage: ${report.forumPersistence}\nPayments: ${report.paymentStatus}\n\n## Hard Issues\n${hard.map(issue => `- ${issue}`).join('\n') || '- None'}\n`);
if (hard.length) {
  console.error('PRODUCTION DEPLOY GUARD FAILED');
  hard.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`PRODUCTION DEPLOY GUARD PASSED for ${String(expectedSha).slice(0, 12)} with strict D1 forums and payments deferred.`);
