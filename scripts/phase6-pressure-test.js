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

requireFile('data/network-maps.json');
requireFile('data/power-atlas.json');
requireFile('scripts/build-phase6-network-maps.js');
requireFile('network-map-index.html');
requireFile('network-maps.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/network-maps.json') ? json('data/network-maps.json') : { maps: [], lineRules: [] };
const atlas = exists('data/power-atlas.json') ? json('data/power-atlas.json') : { evidenceClasses: [], relationshipTypes: [] };
const relationshipSet = new Set(atlas.relationshipTypes || []);
const evidenceSet = new Set(atlas.evidenceClasses || []);
const maps = data.maps || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.lineRules) || data.lineRules.length < 6) fail('data/network-maps.json expected at least 6 line rules');
if (maps.length < 6) fail(`data/network-maps.json expected at least 6 maps, found ${maps.length}`);
if (relationshipSet.size < 10) fail('data/power-atlas.json relationship registry too small for map validation');
if (evidenceSet.size < 8) fail('data/power-atlas.json evidence class registry too small for map validation');

requireIncludes('network-map-index.html', 'NETWORK MAP INDEX', 'Network Map Index hero');
requireIncludes('network-map-index.html', 'NETWORK MAP ENGINE STATUS', 'Network Map status terminal');
requireIncludes('network-map-index.html', 'Relationship Rules', 'Relationship Rules section');
requireIncludes('network-map-index.html', 'Signal Board', 'Signal Board nav');
requireIncludes('network-map-index.html', 'Power Atlas', 'Power Atlas route');
requireIncludes('network-map-index.html', 'Evidence Vault', 'Evidence Vault route');
requireIncludes('network-maps.html', 'id="phase-six-network-engine"', 'Phase 6 Network Map section');

for (const map of maps) {
  const file = `map-${map.slug}.html`;
  requireFile(file);
  requireIncludes(file, map.title, `map title ${map.title}`);
  requireIncludes(file, 'Relationship Lines', 'Relationship Lines section');
  requireIncludes(file, 'Connected Power Atlas Nodes', 'Connected Power Atlas Nodes section');
  requireIncludes(file, 'Connected Evidence Vault Lanes', 'Connected Evidence Vault Lanes section');
  requireIncludes(file, 'Book Routes', 'Book Routes section');
  requireIncludes(file, 'AI Answer Routes', 'AI Answer Routes section');
  requireIncludes(file, 'Risk Boundary', 'Risk Boundary card');
  if (!Array.isArray(map.relationships) || map.relationships.length < 3) fail(`${map.slug}: expected at least 3 relationship lines`);
  for (const rel of map.relationships || []) {
    if (!relationshipSet.has(rel.type)) fail(`${map.slug}: relationship type is not declared: ${rel.type}`);
    if (!evidenceSet.has(rel.evidenceClass)) fail(`${map.slug}: evidence class is not declared: ${rel.evidenceClass}`);
    for (const field of ['from', 'to', 'type', 'evidenceClass', 'meaning']) if (!rel[field]) fail(`${map.slug}: relationship line missing ${field}`);
  }
  if (!Array.isArray(map.atlasNodes) || !map.atlasNodes.length) fail(`${map.slug}: missing atlasNodes`);
  if (!Array.isArray(map.evidenceLanes) || !map.evidenceLanes.length) fail(`${map.slug}: missing evidenceLanes`);
  if (!Array.isArray(map.books) || !map.books.length) fail(`${map.slug}: missing books`);
  if (!Array.isArray(map.answers) || !map.answers.length) fail(`${map.slug}: missing answers`);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

requireIncludes('sitemap.xml', '/network-map-index.html', 'network-map-index sitemap entry');
requireIncludes('llms.txt', '/network-map-index.html', 'network-map-index llms.txt entry');
if (!search.some(item => item.url === 'network-map-index.html')) fail('search-index.json missing network-map-index.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase6-network-maps.js')) fail('package.json build missing build-phase6-network-maps.js');
if (!build.includes('phase6-pressure-test.js')) fail('package.json build missing phase6-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase6-network-maps.js')) fail('netlify.toml missing build-phase6-network-maps.js');
if (!netlify.includes('phase6-pressure-test.js')) fail('netlify.toml missing phase6-pressure-test.js');
if (!netlify.includes('from = "/maps"')) fail('netlify.toml missing /maps redirect');
if (!netlify.includes('from = "/network-map-index"')) fail('netlify.toml missing /network-map-index redirect');

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing unified phaseChecks self-heal structure');
if (!cleanup.includes('network-map-index.html')) fail('cleanup script missing Phase 6 self-heal target');
if (!cleanup.includes('build-phase6-network-maps.js')) fail('cleanup script missing Phase 6 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 6 NETWORK MAP PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 6 NETWORK MAP PRESSURE TEST PASSED');
console.log(`Checked ${maps.length} network maps, relationship taxonomy, relationship lines, map hub, search index, sitemap, llms.txt, redirects, Signal Board nav, and cleanup fallback.`);
