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

requireFile('data/update-monitor.json');
requireFile('scripts/build-phase11-update-monitor.js');
requireFile('update-monitor.html');
requireFile('news.html');
requireFile('trust-center.html');
requireFile('evidence-vault.html');
requireFile('sales-ladder.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/update-monitor.json') ? json('data/update-monitor.json') : { lanes: [], rules: [] };
const lanes = data.lanes || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/update-monitor.json expected at least 6 freshness rules');
if (lanes.length < 7) fail(`data/update-monitor.json expected at least 7 update lanes, found ${lanes.length}`);

requireIncludes('update-monitor.html', 'UPDATE MONITOR', 'Update Monitor hero');
requireIncludes('update-monitor.html', 'UPDATE MONITOR STATUS', 'Update Monitor status terminal');
requireIncludes('update-monitor.html', 'Update Lanes', 'Update Lanes section');
requireIncludes('update-monitor.html', 'Freshness Rules', 'Freshness Rules section');
requireIncludes('update-monitor.html', 'Signal Board', 'Signal Board nav');
requireIncludes('update-monitor.html', 'Update Monitor', 'Update Monitor nav');
requireIncludes('news.html', 'id="phase-eleven-update-monitor"', 'Phase 11 patch on news');
requireIncludes('trust-center.html', 'id="phase-eleven-update-monitor"', 'Phase 11 patch on trust-center');
requireIncludes('evidence-vault.html', 'id="phase-eleven-update-monitor"', 'Phase 11 patch on evidence-vault');
requireIncludes('sales-ladder.html', 'id="phase-eleven-update-monitor"', 'Phase 11 patch on sales-ladder');

for (const lane of lanes) {
  const file = `update-lane-${lane.slug}.html`;
  requireFile(file);
  requireIncludes(file, lane.title, `lane title ${lane.title}`);
  requireIncludes(file, 'FRESHNESS LANE', 'Freshness lane terminal');
  requireIncludes(file, 'Source Data', 'Source Data section');
  requireIncludes(file, 'Output Pages', 'Output Pages section');
  requireIncludes(file, 'Update Checks', 'Update Checks section');
  requireIncludes(file, lane.cadence, 'cadence label');
  requireIncludes(file, lane.risk, 'risk label');
  if (!Array.isArray(lane.dataFiles) || lane.dataFiles.length < 1) fail(`${lane.slug}: expected at least 1 data file`);
  if (!Array.isArray(lane.outputPages) || lane.outputPages.length < 3) fail(`${lane.slug}: expected at least 3 output pages`);
  if (!Array.isArray(lane.checks) || lane.checks.length < 4) fail(`${lane.slug}: expected at least 4 update checks`);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

requireIncludes('sitemap.xml', '/update-monitor.html', 'update-monitor sitemap entry');
requireIncludes('llms.txt', '/update-monitor.html', 'update-monitor llms.txt entry');
if (!search.some(item => item.url === 'update-monitor.html')) fail('search-index.json missing update-monitor.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase11-update-monitor.js')) fail('package.json build missing build-phase11-update-monitor.js');
if (!build.includes('phase11-pressure-test.js')) fail('package.json build missing phase11-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase11-update-monitor.js')) fail('netlify.toml missing build-phase11-update-monitor.js');
if (!netlify.includes('phase11-pressure-test.js')) fail('netlify.toml missing phase11-pressure-test.js');
for (const route of ['from = "/update-monitor"', 'from = "/freshness"', 'from = "/site-updates"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('update-monitor.html')) fail('cleanup script missing Update Monitor self-heal/nav target');
if (!cleanup.includes('build-phase11-update-monitor.js')) fail('cleanup script missing Phase 11 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 11 FRESHNESS MONITOR PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 11 FRESHNESS MONITOR PRESSURE TEST PASSED');
console.log(`Checked ${lanes.length} freshness lanes, Update Monitor hub, news/trust/evidence/sales patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
