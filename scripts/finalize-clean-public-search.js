'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const indexPath = path.join(root, 'search-index.json');
const semanticPath = path.join(root, 'search-semantic-index.json');
const reportPath = path.join(root, 'downloads', 'clean-public-search-report.json');
const retiredUrls = new Set([
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  '/downloads/forum-posts.json',
  '/downloads/forum-posts.md'
]);
const forbiddenTokens = [
  'compatibility-marker-vault',
  'compatibility-routes-preserved-with-clean-public-copy',
  'preservedaftervisiblede-duplication',
  'downloads/forum-posts.json',
  'downloads/forum-posts.md'
];

function slash(value) {
  return String(value || '').split(path.sep).join('/');
}

function copyToSite(relative) {
  if (!fs.existsSync(site)) return;
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Search source missing: ${relative}`);
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function runRequired(script) {
  const file = path.join(root, script);
  if (!fs.existsSync(file)) throw new Error(`Required search builder missing: ${script}`);
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 1024 * 1024 * 50
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${script} failed with status ${result.status}`);
}

if (!fs.existsSync(indexPath)) throw new Error('search-index.json is missing before final public-search cleanup');
const before = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
if (!Array.isArray(before)) throw new Error('search-index.json must remain a public route array');

const removed = [];
const seen = new Set();
const cleaned = [];
for (const item of before) {
  if (!item || typeof item !== 'object') continue;
  const url = String(item.url || '').trim();
  const serialized = JSON.stringify(item);
  const reason = retiredUrls.has(url)
    ? 'retired-local-forum-export'
    : forbiddenTokens.find(token => serialized.includes(token)) || '';
  if (reason) {
    removed.push({ url, reason });
    continue;
  }
  if (!url || seen.has(url)) continue;
  seen.add(url);
  cleaned.push(item);
}

if (!seen.has('forum.html')) {
  cleaned.push({
    searchVersion: 3,
    title: 'Signal Board',
    url: 'forum.html',
    sourceType: 'html',
    resultKind: 'route',
    statusClass: 'current',
    category: 'Community Evidence',
    layer: 'information-narrative',
    description: 'Public Signal Board reading with verified free-member posting and authoritative Cloudflare D1 persistence.',
    exactTerms: ['forum', 'signal board', 'community evidence', 'member posting'],
    priority: 86
  });
}

fs.writeFileSync(indexPath, JSON.stringify(cleaned));
runRequired('scripts/build-search-semantic-index.js');
copyToSite('search-index.json');
copyToSite('search-semantic-index.json');
for (const relative of ['search.js', 'search.html', 'search-query-handoff.js', 'data/search-index.json', 'data/search-facets.json', 'data/search-health.json']) {
  const source = path.join(root, relative);
  if (fs.existsSync(source) && fs.statSync(source).isFile()) copyToSite(relative);
}

const checkedFiles = [
  'search-index.json',
  'search-semantic-index.json',
  'search.js',
  'search.html',
  'data/search-index.json',
  'data/search-facets.json',
  'data/search-health.json'
];
if (fs.existsSync(site)) {
  checkedFiles.push(
    '_site/search-index.json',
    '_site/search-semantic-index.json',
    '_site/search.js',
    '_site/search.html',
    '_site/data/search-index.json',
    '_site/data/search-facets.json',
    '_site/data/search-health.json'
  );
}

const leaks = [];
for (const relative of checkedFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const token of forbiddenTokens) {
    if (text.includes(token)) leaks.push({ file: slash(relative), token });
  }
}

const finalIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const forumRoutes = finalIndex.filter(item => item?.url === 'forum.html').length;
const semantic = JSON.parse(fs.readFileSync(semanticPath, 'utf8'));
const report = {
  ok: leaks.length === 0
    && forumRoutes === 1
    && Array.isArray(finalIndex)
    && finalIndex.length > 0
    && Number(semantic.count) === finalIndex.length,
  generatedAt: new Date().toISOString(),
  beforeRecords: before.length,
  finalRecords: finalIndex.length,
  semanticRecords: Number(semantic.count) || 0,
  removed,
  forumRoutes,
  checkedFiles,
  leaks,
  boundary: 'The final public search corpus is rebuilt from cleaned reader-facing routes. Retired local forum exports and compatibility payloads are excluded; the authoritative public Signal Board remains searchable.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('CLEAN PUBLIC SEARCH FINALIZATION FAILED');
  leaks.slice(0, 100).forEach(item => console.error(`- ${item.file}: ${item.token}`));
  if (forumRoutes !== 1) console.error(`- forum.html route count is ${forumRoutes}`);
  if (Number(semantic.count) !== finalIndex.length) console.error(`- semantic/index count mismatch ${semantic.count}/${finalIndex.length}`);
  process.exit(1);
}
console.log(`Clean public search finalized: ${finalIndex.length} routes, ${removed.length} retired/residue record(s) removed, semantic index synchronized.`);
module.exports = report;
