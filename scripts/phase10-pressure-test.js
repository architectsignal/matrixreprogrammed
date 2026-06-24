const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }

requireFile('data/sales-ladder.json');
requireFile('scripts/build-phase10-sales-ladder.js');
requireFile('sales-ladder.html');
requireFile('books.html');
requireFile('start-here.html');
requireFile('conversion-funnel.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/sales-ladder.json') ? json('data/sales-ladder.json') : { paths: [], rules: [] };
const paths = data.paths || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/sales-ladder.json expected at least 6 ladder rules');
if (paths.length < 7) fail(`data/sales-ladder.json expected at least 7 reader paths, found ${paths.length}`);

requireIncludes('sales-ladder.html', 'READER PATHS', 'Reader Paths hero');
requireIncludes('sales-ladder.html', 'SALES LADDER STATUS', 'Sales Ladder status terminal');
requireIncludes('sales-ladder.html', 'Reader Paths', 'Reader Paths section');
requireIncludes('sales-ladder.html', 'Sales Ladder Rules', 'Sales Ladder Rules section');
requireIncludes('sales-ladder.html', 'Signal Board', 'Signal Board nav');
requireIncludes('sales-ladder.html', 'Reader Paths', 'Reader Paths nav');
requireIncludes('books.html', 'id="phase-ten-sales-ladder-engine"', 'Phase 10 patch on books');
requireIncludes('start-here.html', 'id="phase-ten-sales-ladder-engine"', 'Phase 10 patch on start-here');
requireIncludes('conversion-funnel.html', 'id="phase-ten-sales-ladder-engine"', 'Phase 10 patch on conversion-funnel');

for (const p of paths) {
  const file = `path-${p.slug}.html`;
  requireFile(file);
  requireIncludes(file, p.title, `path title ${p.title}`);
  requireIncludes(file, 'READER PATH STATUS', 'Reader path status terminal');
  requireIncludes(file, 'Start Here', 'Start Here section');
  requireIncludes(file, 'Reading Ladder', 'Reading Ladder section');
  requireIncludes(file, 'Book Route', 'Book Route section');
  requireIncludes(file, p.freeGateway, 'free gateway route');
  requireIncludes(file, p.trustRoute, 'trust route');
  requireIncludes(file, p.mapRoute, 'map route');
  requireIncludes(file, p.funnelRoute, 'funnel route');
  requireIncludes(file, p.distributionRoute, 'distribution route');
  if (!Array.isArray(p.ladder) || p.ladder.length < 4) fail(`${p.slug}: expected at least 4 ladder steps`);
  if (!Array.isArray(p.bookKeys) || p.bookKeys.length < 3) fail(`${p.slug}: expected at least 3 book keys`);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

requireIncludes('sitemap.xml', '/sales-ladder.html', 'sales-ladder sitemap entry');
requireIncludes('llms.txt', '/sales-ladder.html', 'sales-ladder llms.txt entry');
if (!search.some(item => item.url === 'sales-ladder.html')) fail('search-index.json missing sales-ladder.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase10-sales-ladder.js')) fail('package.json build missing build-phase10-sales-ladder.js');
if (!build.includes('phase10-pressure-test.js')) fail('package.json build missing phase10-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase10-sales-ladder.js')) fail('netlify.toml missing build-phase10-sales-ladder.js');
if (!netlify.includes('phase10-pressure-test.js')) fail('netlify.toml missing phase10-pressure-test.js');
for (const route of ['from = "/reader-paths"', 'from = "/sales-ladder"', 'from = "/start-reading"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('sales-ladder.html')) fail('cleanup script missing Sales Ladder self-heal/nav target');
if (!cleanup.includes('build-phase10-sales-ladder.js')) fail('cleanup script missing Phase 10 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 10 SALES LADDER PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 10 SALES LADDER PRESSURE TEST PASSED');
console.log(`Checked ${paths.length} reader paths, Sales Ladder hub, books/start/funnel patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
