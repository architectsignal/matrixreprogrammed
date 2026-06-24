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

requireFile('data/dossier-packs.json');
requireFile('scripts/build-phase14-dossier-packs.js');
requireFile('download-center.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/dossier-packs.json') ? json('data/dossier-packs.json') : { packs: [], rules: [] };
const packs = data.packs || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/dossier-packs.json expected at least 6 pack rules');
if (packs.length < 6) fail(`data/dossier-packs.json expected at least 6 packs, found ${packs.length}`);

requireIncludes('download-center.html', 'DOWNLOAD CENTER', 'Download Center hero');
requireIncludes('download-center.html', 'DOSSIER PACK ENGINE STATUS', 'Dossier Pack status terminal');
requireIncludes('download-center.html', 'Dossier Packs', 'Dossier Packs section');
requireIncludes('download-center.html', 'Pack Rules', 'Pack Rules section');
requireIncludes('download-center.html', 'Signal Board', 'Signal Board nav');
requireIncludes('download-center.html', 'Download Center', 'Download Center nav');
for (const file of ['index.html','black-file.html','trust-center.html','evidence-vault.html','sales-ladder.html','schema-index.html']) {
  requireIncludes(file, 'id="phase-fourteen-dossier-pack-engine"', `Phase 14 patch on ${file}`);
}

for (const pack of packs) {
  const htmlFile = `dossier-pack-${pack.slug}.html`;
  const jsonFile = `downloads/dossier-pack-${pack.slug}.json`;
  const mdFile = `downloads/dossier-pack-${pack.slug}.md`;
  requireFile(htmlFile);
  requireFile(jsonFile);
  requireFile(mdFile);
  requireIncludes(htmlFile, pack.title, `pack title ${pack.title}`);
  requireIncludes(htmlFile, 'DOSSIER PACK', 'Dossier pack terminal');
  requireIncludes(htmlFile, 'Pack Boundary', 'Pack Boundary section');
  requireIncludes(htmlFile, 'Core Routes', 'Core Routes section');
  requireIncludes(htmlFile, 'Archive Routes', 'Archive Routes section');
  requireIncludes(htmlFile, 'Downloads', 'Downloads section');
  requireIncludes(htmlFile, jsonFile, 'JSON download link');
  requireIncludes(htmlFile, mdFile, 'Markdown download link');
  if (!Array.isArray(pack.routes) || pack.routes.length < 6) fail(`${pack.slug}: expected at least 6 archive routes`);
  if (!Array.isArray(pack.takeaways) || pack.takeaways.length < 4) fail(`${pack.slug}: expected at least 4 takeaways`);
  const packData = json(jsonFile);
  if (!packData.boundary || !packData.trustRoute || !packData.evidenceRoute) fail(`${jsonFile}: missing boundary/trust/evidence route`);
  requireIncludes(mdFile, '## Boundary', `${mdFile} boundary section`);
  if (!search.some(item => item.url === htmlFile)) fail(`search-index.json missing ${htmlFile}`);
  requireIncludes('sitemap.xml', `/${htmlFile}`, `${htmlFile} sitemap entry`);
  requireIncludes('llms.txt', `/${jsonFile}`, `${jsonFile} llms.txt entry`);
}

requireIncludes('sitemap.xml', '/download-center.html', 'download-center sitemap entry');
requireIncludes('llms.txt', '/download-center.html', 'download-center llms.txt entry');
if (!search.some(item => item.url === 'download-center.html')) fail('search-index.json missing download-center.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase14-dossier-packs.js')) fail('package.json build missing build-phase14-dossier-packs.js');
if (!build.includes('phase14-pressure-test.js')) fail('package.json build missing phase14-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase14-dossier-packs.js')) fail('netlify.toml missing build-phase14-dossier-packs.js');
if (!netlify.includes('phase14-pressure-test.js')) fail('netlify.toml missing phase14-pressure-test.js');
for (const route of ['from = "/download-center"', 'from = "/dossiers"', 'from = "/dossier-packs"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}
if (!netlify.includes('for = "/downloads/*.json"')) fail('netlify.toml missing JSON download headers');
if (!netlify.includes('for = "/downloads/*.md"')) fail('netlify.toml missing Markdown download headers');

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('download-center.html')) fail('cleanup script missing Download Center self-heal/nav target');
if (!cleanup.includes('build-phase14-dossier-packs.js')) fail('cleanup script missing Phase 14 builder fallback');
if (!cleanup.includes('safeSearchJs')) fail('cleanup script missing safe search.js overwrite');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 14 DOSSIER PACK PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 14 DOSSIER PACK PRESSURE TEST PASSED');
console.log(`Checked ${packs.length} packs, HTML pack pages, JSON/Markdown downloads, page patches, sitemap, llms.txt, search index, redirects, headers, Signal Board nav, and cleanup fallback.`);
