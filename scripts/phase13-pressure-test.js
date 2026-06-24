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

requireFile('data/schema-engine.json');
requireFile('scripts/build-phase13-schema-engine.js');
requireFile('schema-index.html');
requireFile('schema-site-graph.html');
requireFile('schema-claim-taxonomy.html');
requireFile('schema-crawler-map.html');
requireFile('site-graph.json');
requireFile('claim-taxonomy.json');
requireFile('crawler-map.json');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/schema-engine.json') ? json('data/schema-engine.json') : { routeTypes: [], machinePages: [], claimLabels: [], crawlerGuidance: [] };
const graph = exists('site-graph.json') ? json('site-graph.json') : {};
const claimTaxonomy = exists('claim-taxonomy.json') ? json('claim-taxonomy.json') : {};
const crawlerMap = exists('crawler-map.json') ? json('crawler-map.json') : {};
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.routeTypes) || data.routeTypes.length < 9) fail('data/schema-engine.json expected at least 9 route types');
if (!Array.isArray(data.claimLabels) || data.claimLabels.length < 10) fail('data/schema-engine.json expected at least 10 claim labels');
if (!Array.isArray(data.machinePages) || data.machinePages.length < 3) fail('data/schema-engine.json expected at least 3 machine pages');
if (!Array.isArray(data.crawlerGuidance) || data.crawlerGuidance.length < 6) fail('data/schema-engine.json expected at least 6 crawler guidance items');

requireIncludes('schema-index.html', 'SCHEMA INDEX', 'Schema Index hero');
requireIncludes('schema-index.html', 'SCHEMA ENGINE STATUS', 'Schema Engine status terminal');
requireIncludes('schema-index.html', 'Route Types', 'Route Types section');
requireIncludes('schema-index.html', 'Claim Labels', 'Claim Labels section');
requireIncludes('schema-index.html', 'Machine Pages', 'Machine Pages section');
requireIncludes('schema-index.html', 'Crawler Guidance', 'Crawler Guidance section');
requireIncludes('schema-index.html', 'Signal Board', 'Signal Board nav');
requireIncludes('schema-index.html', 'Schema Index', 'Schema Index nav');
for (const file of ['index.html','authority-hub.html','trust-center.html','evidence-vault.html','answer-engine.html','sales-ladder.html','update-monitor.html']) {
  requireIncludes(file, 'id="phase-thirteen-schema-engine"', `Phase 13 patch on ${file}`);
}
for (const page of data.machinePages || []) {
  const file = `schema-${page.slug}.html`;
  requireFile(file);
  requireIncludes(file, page.title, `machine page title ${page.title}`);
  requireIncludes(file, 'MACHINE PAGE', 'Machine page terminal');
  requireIncludes(file, 'Crawler Guidance', 'Crawler Guidance section');
  requireIncludes(file, 'application/ld+json', 'JSON-LD structured data');
  if (!Array.isArray(page.outputs) || page.outputs.length < 1) fail(`${page.slug}: expected at least 1 output`);
  for (const output of page.outputs) requireFile(output);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

if (!Array.isArray(graph.routeTypes) || graph.routeTypes.length < 9) fail('site-graph.json missing routeTypes');
if (!Array.isArray(graph.coreRoutes) || graph.coreRoutes.length < 10) fail('site-graph.json missing coreRoutes');
if (!Array.isArray(claimTaxonomy.labels) || claimTaxonomy.labels.length < 10) fail('claim-taxonomy.json missing labels');
if (!crawlerMap.trust || !crawlerMap.evidence || !crawlerMap.authority) fail('crawler-map.json missing trust/evidence/authority pointers');
requireIncludes('sitemap.xml', '/schema-index.html', 'schema-index sitemap entry');
requireIncludes('llms.txt', '/schema-index.html', 'schema-index llms.txt entry');
requireIncludes('llms.txt', '/site-graph.json', 'site-graph llms.txt entry');
if (!search.some(item => item.url === 'schema-index.html')) fail('search-index.json missing schema-index.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase13-schema-engine.js')) fail('package.json build missing build-phase13-schema-engine.js');
if (!build.includes('phase13-pressure-test.js')) fail('package.json build missing phase13-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase13-schema-engine.js')) fail('netlify.toml missing build-phase13-schema-engine.js');
if (!netlify.includes('phase13-pressure-test.js')) fail('netlify.toml missing phase13-pressure-test.js');
for (const route of ['from = "/schema"', 'from = "/schema-index"', 'from = "/site-graph"', 'from = "/claim-taxonomy"', 'from = "/crawler-map"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}
const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('schema-index.html')) fail('cleanup script missing Schema Index self-heal/nav target');
if (!cleanup.includes('build-phase13-schema-engine.js')) fail('cleanup script missing Phase 13 builder fallback');
if (!cleanup.includes('safeSearchJs')) fail('cleanup script missing safe search.js overwrite');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 13 SCHEMA ENGINE PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 13 SCHEMA ENGINE PRESSURE TEST PASSED');
console.log(`Checked ${data.routeTypes.length} route types, ${data.claimLabels.length} claim labels, schema pages, JSON outputs, page patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
