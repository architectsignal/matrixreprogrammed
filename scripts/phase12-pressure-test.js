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

requireFile('data/authority-clusters.json');
requireFile('scripts/build-phase12-authority-clusters.js');
requireFile('authority-hub.html');
requireFile('index.html');
requireFile('start-here.html');
requireFile('search.html');
requireFile('answer-engine.html');
requireFile('power-atlas.html');
requireFile('evidence-vault.html');
requireFile('sales-ladder.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/authority-clusters.json') ? json('data/authority-clusters.json') : { clusters: [], rules: [] };
const clusters = data.clusters || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/authority-clusters.json expected at least 6 authority rules');
if (clusters.length < 7) fail(`data/authority-clusters.json expected at least 7 clusters, found ${clusters.length}`);

requireIncludes('authority-hub.html', 'AUTHORITY HUB', 'Authority Hub hero');
requireIncludes('authority-hub.html', 'AUTHORITY ENGINE STATUS', 'Authority Engine status terminal');
requireIncludes('authority-hub.html', 'Authority Clusters', 'Authority Clusters section');
requireIncludes('authority-hub.html', 'Internal Link Rules', 'Internal Link Rules section');
requireIncludes('authority-hub.html', 'Signal Board', 'Signal Board nav');
requireIncludes('authority-hub.html', 'Authority Hub', 'Authority Hub nav');
for (const file of ['index.html', 'start-here.html', 'search.html', 'answer-engine.html', 'power-atlas.html', 'evidence-vault.html', 'sales-ladder.html']) {
  requireIncludes(file, 'id="phase-twelve-authority-engine"', `Phase 12 patch on ${file}`);
}

for (const cluster of clusters) {
  const file = `authority-${cluster.slug}.html`;
  requireFile(file);
  requireIncludes(file, cluster.title, `cluster title ${cluster.title}`);
  requireIncludes(file, 'AUTHORITY CLUSTER', 'Authority cluster terminal');
  requireIncludes(file, 'Pillar And Trust Route', 'Pillar and Trust section');
  requireIncludes(file, 'Spoke Routes', 'Spoke Routes section');
  requireIncludes(file, 'Questions This Cluster Answers', 'Questions section');
  requireIncludes(file, cluster.pillar, 'pillar route');
  requireIncludes(file, cluster.trustRoute, 'trust route');
  if (!Array.isArray(cluster.spokes) || cluster.spokes.length < 5) fail(`${cluster.slug}: expected at least 5 spoke routes`);
  if (!Array.isArray(cluster.questions) || cluster.questions.length < 4) fail(`${cluster.slug}: expected at least 4 questions`);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

requireIncludes('sitemap.xml', '/authority-hub.html', 'authority-hub sitemap entry');
requireIncludes('llms.txt', '/authority-hub.html', 'authority-hub llms.txt entry');
if (!search.some(item => item.url === 'authority-hub.html')) fail('search-index.json missing authority-hub.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase12-authority-clusters.js')) fail('package.json build missing build-phase12-authority-clusters.js');
if (!build.includes('phase12-pressure-test.js')) fail('package.json build missing phase12-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase12-authority-clusters.js')) fail('netlify.toml missing build-phase12-authority-clusters.js');
if (!netlify.includes('phase12-pressure-test.js')) fail('netlify.toml missing phase12-pressure-test.js');
for (const route of ['from = "/authority"', 'from = "/authority-hub"', 'from = "/topic-clusters"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('authority-hub.html')) fail('cleanup script missing Authority Hub self-heal/nav target');
if (!cleanup.includes('build-phase12-authority-clusters.js')) fail('cleanup script missing Phase 12 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 12 AUTHORITY CLUSTER PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 12 AUTHORITY CLUSTER PRESSURE TEST PASSED');
console.log(`Checked ${clusters.length} authority clusters, Authority Hub, page patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
