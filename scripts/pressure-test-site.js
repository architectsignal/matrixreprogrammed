const fs = require('fs');
const path = require('path');

const root = process.cwd();
const hard = [];
const soft = [];
function p(file) { return path.join(root, file); }
function exists(file) { return fs.existsSync(p(file)); }
function read(file) { return fs.readFileSync(p(file), 'utf8'); }
function parseJson(file, required = true) {
  try { return JSON.parse(read(file)); }
  catch (error) { (required ? hard : soft).push(`${file}: invalid JSON: ${error.message}`); return null; }
}
function count(html, pattern) { return (html.match(pattern) || []).length; }
function requireFile(file) { if (!exists(file)) hard.push(`missing required file: ${file}`); }
function requireSoftFile(file) { if (!exists(file)) soft.push(`missing optional/legacy file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) hard.push(`${file}: missing ${label}`); }
function requireSoftIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) soft.push(`${file}: missing ${label}`); }

const corePages = ['index.html', 'books.html', 'search.html', 'live-intel.html', 'epstein-files.html', 'download-center.html', 'deploy-status.html', 'deploy-health.html', 'sitemap.xml', 'robots.txt', 'llms.txt'];
const coreData = ['data/books.json', 'search-index.json', 'deploy-status.json', 'deploy-health.json'];
[...corePages, ...coreData, 'styles.css', 'fixes.css', 'matrix.js', 'src/worker.js', 'wrangler.toml'].forEach(requireFile);

// Core deploy-critical page and search checks.
requireIncludes('search.html', 'id="archive-search"', 'Search input');
requireIncludes('search.html', 'id="search-results"', 'Search results container');
requireIncludes('search.html', '<script src="search.js"></script>', 'search script include');
requireFile('search.js');
requireIncludes('search.js', '/search-index.json', 'search index fetch');
requireIncludes('search.js', "cache:'no-store'", 'no-store search fetch');
requireIncludes('search.js', 'fallbackIndex', 'search fallback index');

// Core Worker / Cloudflare / forum checks.
for (const [file, text, label] of [
  ['src/worker.js','env.ASSETS.fetch','Cloudflare ASSETS fetch'],
  ['src/worker.js','/forum-health','forum health route'],
  ['src/worker.js','/forum-feed-main','main board route'],
  ['src/worker.js','/forum-feed-speculation','speculation board route'],
  ['src/worker.js','/forum-feed-epstein-alive','epstein alive board route'],
  ['src/worker.js','/submit-main-post','main submit route'],
  ['src/worker.js','/submit-speculation-post','speculation submit route'],
  ['src/worker.js','/submit-epstein-alive-post','epstein alive submit route'],
  ['src/worker.js','persistent: true','persistent forum save marker'],
  ['forum.html','forum.js','forum frontend script'],
  ['forum.js','/forum-feed-main','frontend main feed'],
  ['forum.js','/submit-main-post','frontend main submit'],
  ['wrangler.toml','directory = "./_site"','Cloudflare asset directory'],
  ['wrangler.toml','run_worker_first = true','Worker-first routing']
]) requireIncludes(file, text, label);

// JSON sanity.
const booksData = exists('data/books.json') ? parseJson('data/books.json') : null;
const searchIndex = exists('search-index.json') ? parseJson('search-index.json') : null;
const deployStatus = exists('deploy-status.json') ? parseJson('deploy-status.json') : null;
const deployHealth = exists('deploy-health.json') ? parseJson('deploy-health.json') : null;
if (booksData && !Array.isArray(booksData.books)) hard.push('data/books.json missing books array');
if (searchIndex) {
  if (!Array.isArray(searchIndex) || searchIndex.length < 20) hard.push(`search-index.json expected at least 20 entries, found ${Array.isArray(searchIndex) ? searchIndex.length : 'non-array'}`);
  for (const route of ['search.html','books.html','live-intel.html','epstein-files.html','download-center.html']) if (!searchIndex.some(item => item && item.url === route)) hard.push(`search-index.json missing ${route}`);
  for (const item of searchIndex) {
    if (!item || !item.title || !item.url) hard.push('search-index.json contains item without title/url');
    if (item && /^https?:\/\//i.test(item.url || '')) hard.push(`search-index.json has external URL: ${item.url}`);
  }
}
if (deployStatus) {
  if (!deployStatus.buildSha) hard.push('deploy-status.json missing buildSha');
  if (!deployStatus.workerScript) hard.push('deploy-status.json missing workerScript');
  if (!deployStatus.assetOutput) hard.push('deploy-status.json missing assetOutput');
}
if (deployHealth) {
  if (!deployHealth.ok) hard.push('deploy-health.json ok should be true');
  const legacyRoutes = Array.isArray(deployHealth.routes) ? deployHealth.routes : [];
  const checkedRoutes = Array.isArray(deployHealth.checks) ? deployHealth.checks.filter(item => item && item.exists !== false && item.markerPresent !== false).map(item => item.route) : [];
  const verifiedRoutes = new Set([...legacyRoutes, ...checkedRoutes]);
  if (!verifiedRoutes.has('/forum-health')) hard.push('deploy-health.json missing verified /forum-health route');
}

// Generated book pages must exist for published books, but older atlas/evidence copy expectations are soft.
if (booksData && Array.isArray(booksData.books)) {
  const visibleBooks = booksData.books.filter(b => b && b.status !== 'planned' && b.status !== 'unpublished');
  for (const book of visibleBooks) if (book.generatedUrl && !exists(book.generatedUrl)) hard.push(`book generated page missing: ${book.generatedUrl}`);
}

// Legacy phase/template health is useful but should not block daily deploys if core routes are healthy.
const phaseOnePages = ['power-atlas.html', 'evidence-vault.html', 'evidence-policy.html', 'network-maps.html'];
const phaseTwoCorePages = ['atlas-index.html'];
const phaseThreeCorePages = ['evidence-vault-index.html'];
[...phaseOnePages, ...phaseTwoCorePages, ...phaseThreeCorePages, 'news.html', 'intel-archive.html', 'timers.html', 'data/power-atlas.json', 'data/evidence-vault.json', 'data/bulletins.json', 'data/human-cost.json'].forEach(requireSoftFile);
for (const file of phaseOnePages) {
  requireSoftIncludes(file, 'Evidence', 'evidence language');
  requireSoftIncludes(file, 'Power', 'power structure language');
}
requireSoftIncludes('power-atlas.html', 'THE PUBLIC-RECORD MAP OF HIDDEN POWER', 'Power Atlas hero');
requireSoftIncludes('evidence-vault.html', 'SOURCES BEFORE SIGNALS', 'Evidence Vault hero');
requireSoftIncludes('index.html', 'id="phase-one-structure"', 'homepage Phase 1 structure section');

let atlasNodes = [];
let evidenceLanes = [];
let sourceCards = [];
if (exists('data/power-atlas.json')) {
  const atlas = parseJson('data/power-atlas.json', false);
  if (atlas) {
    atlasNodes = atlas.nodes || [];
    if (atlasNodes.length < 10) soft.push(`data/power-atlas.json expected at least 10 atlas nodes, found ${atlasNodes.length}`);
  }
}
if (exists('data/evidence-vault.json')) {
  const vault = parseJson('data/evidence-vault.json', false);
  if (vault) {
    evidenceLanes = vault.sourceLanes || [];
    sourceCards = vault.sourceCards || [];
    if (evidenceLanes.length < 6) soft.push(`data/evidence-vault.json expected at least 6 source lanes, found ${evidenceLanes.length}`);
    if (sourceCards.length < 10) soft.push(`data/evidence-vault.json expected at least 10 source cards, found ${sourceCards.length}`);
  }
}
if (exists('sitemap.xml')) {
  for (const file of [...phaseOnePages, ...phaseTwoCorePages, ...phaseThreeCorePages]) requireSoftIncludes('sitemap.xml', `/${file}`, `${file} in sitemap`);
}
if (exists('llms.txt')) {
  for (const file of [...phaseOnePages, 'atlas-index.html', 'evidence-vault-index.html']) requireSoftIncludes('llms.txt', `/${file}`, `${file} in llms.txt`);
}
if (exists('package.json')) {
  const pkg = parseJson('package.json', false);
  const build = pkg && pkg.scripts && pkg.scripts.build || '';
  for (const step of ['build-book-system.js', 'build-homepage.js', 'build-seo-system.js', 'audit-site.js', 'pressure-test-site.js']) {
    if (!build.includes(step)) soft.push(`package.json build script missing ${step}`);
  }
}
if (exists('news.html') && exists('data/bulletins.json')) {
  const bulletinsJson = parseJson('data/bulletins.json', false);
  const bulletins = bulletinsJson && bulletinsJson.bulletins || [];
  const visibleNews = count(read('news.html'), /class=["'][^"']*news-item/g);
  if (bulletins.length < 3) soft.push('data/bulletins.json expected at least 3 bulletins');
  if (visibleNews < Math.min(7, bulletins.length)) soft.push(`news.html visible bulletins ${visibleNews} below expected ${Math.min(7, bulletins.length)}`);
}
if (exists('timers.html')) {
  const timers = read('timers.html');
  const riskRepeats = count(timers, /SIGNALS INCREASING RISK/g);
  const timerCards = count(timers, /Speculative pressure score/g);
  if (riskRepeats > 1) soft.push(`timers.html repeated risk terminal ${riskRepeats} times`);
  if (timerCards < 10) soft.push(`timers.html expected at least 10 timer cards, found ${timerCards}`);
}
if (exists('books.html') && /<p>(?:<span class="pill">[^<]+<\/span>\s*){2,}<\/p>/.test(read('books.html'))) soft.push('books.html still contains visible keyword-pill stuffing blocks');
if (exists('search.js') && read('search.js').includes('(b.keywords||[]).slice')) soft.push('search.js still renders visible keyword pills');
if (exists('videos.html')) {
  const videos = read('videos.html');
  if (/Rumble Channel Routes/.test(videos)) soft.push('videos.html still duplicates Rumble Channel Routes');
  requireSoftIncludes('videos.html', 'Video Production Map', 'deduplicated video production map');
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
const report = { ok: hard.length === 0, generatedAt: new Date().toISOString(), hardIssues: hard, softIssues: soft, boundary: 'Pressure test blocks only deploy-critical breaks. Historical phase copy/template expectations are soft so daily automation can ship while reporting drift.' };
fs.writeFileSync(path.join(root, 'downloads', 'pressure-test-site-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'pressure-test-site-report.md'), '# Site Pressure Test Report\n\nGenerated: '+report.generatedAt+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n## Hard Issues\n'+(hard.map(x=>'- '+x).join('\n')||'- None')+'\n\n## Soft Review\n'+(soft.map(x=>'- '+x).join('\n')||'- None')+'\n');

if (hard.length) {
  console.error('\nSITE PRESSURE TEST FAILED\n');
  for (const problem of hard) console.error(`- ${problem}`);
  console.error(`\n${hard.length} hard issue(s) found. Soft drift recorded in downloads/pressure-test-site-report.json.\n`);
  process.exit(1);
}
console.log('SITE PRESSURE TEST PASSED');
console.log(`Core routes, books, search, Worker, forum, JSON feeds and deployment files passed. Soft review items: ${soft.length}.`);
