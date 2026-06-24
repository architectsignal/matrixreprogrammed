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

requireFile('data/share-kits.json');
requireFile('scripts/build-phase16-share-kits.js');
requireFile('share-center.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/share-kits.json') ? json('data/share-kits.json') : { kits: [], rules: [] };
const kits = data.kits || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/share-kits.json expected at least 6 share rules');
if (kits.length < 6) fail(`data/share-kits.json expected at least 6 kits, found ${kits.length}`);

requireIncludes('share-center.html', 'SHARE CENTER', 'Share Center hero');
requireIncludes('share-center.html', 'SHARE KIT ENGINE STATUS', 'Share Kit status terminal');
requireIncludes('share-center.html', 'Share Kits', 'Share Kits section');
requireIncludes('share-center.html', 'Share Rules', 'Share Rules section');
requireIncludes('share-center.html', 'Signal Board', 'Signal Board nav');
requireIncludes('share-center.html', 'Share Center', 'Share Center nav');
for (const file of ['index.html','feed-center.html','download-center.html','distribution-center.html','black-file.html','trust-center.html']) {
  requireIncludes(file, 'id="phase-sixteen-share-kit-engine"', `Phase 16 patch on ${file}`);
}

for (const kit of kits) {
  const htmlFile = `share-kit-${kit.slug}.html`;
  const jsonFile = `downloads/share-kit-${kit.slug}.json`;
  const mdFile = `downloads/share-kit-${kit.slug}.md`;
  const txtFile = `downloads/share-kit-${kit.slug}.txt`;
  requireFile(htmlFile);
  requireFile(jsonFile);
  requireFile(mdFile);
  requireFile(txtFile);
  requireIncludes(htmlFile, kit.title, `kit title ${kit.title}`);
  requireIncludes(htmlFile, 'SHARE KIT', 'Share kit terminal');
  requireIncludes(htmlFile, 'Share Boundary', 'Share Boundary section');
  requireIncludes(htmlFile, 'Core Routes', 'Core Routes section');
  requireIncludes(htmlFile, 'Hooks', 'Hooks section');
  requireIncludes(htmlFile, 'Short Posts', 'Short Posts section');
  requireIncludes(htmlFile, 'Thread Outline', 'Thread Outline section');
  requireIncludes(htmlFile, 'Video Caption', 'Video Caption section');
  requireIncludes(htmlFile, jsonFile, 'JSON download link');
  requireIncludes(htmlFile, mdFile, 'Markdown download link');
  requireIncludes(htmlFile, txtFile, 'TXT download link');
  if (!Array.isArray(kit.hooks) || kit.hooks.length < 3) fail(`${kit.slug}: expected at least 3 hooks`);
  if (!Array.isArray(kit.shortPosts) || kit.shortPosts.length < 2) fail(`${kit.slug}: expected at least 2 short posts`);
  if (!Array.isArray(kit.threadOutline) || kit.threadOutline.length < 4) fail(`${kit.slug}: expected at least 4 thread steps`);
  const kitData = json(jsonFile);
  if (!kitData.boundary || !kitData.trustRoute || !kitData.evidenceRoute) fail(`${jsonFile}: missing boundary/trust/evidence route`);
  requireIncludes(mdFile, '## Boundary', `${mdFile} boundary section`);
  requireIncludes(txtFile, 'HOOKS', `${txtFile} hooks section`);
  if (!search.some(item => item.url === htmlFile)) fail(`search-index.json missing ${htmlFile}`);
  requireIncludes('sitemap.xml', `/${htmlFile}`, `${htmlFile} sitemap entry`);
  requireIncludes('llms.txt', `/${jsonFile}`, `${jsonFile} llms.txt entry`);
  requireIncludes('llms.txt', `/${txtFile}`, `${txtFile} llms.txt entry`);
}

requireIncludes('sitemap.xml', '/share-center.html', 'share-center sitemap entry');
requireIncludes('llms.txt', '/share-center.html', 'share-center llms.txt entry');
if (!search.some(item => item.url === 'share-center.html')) fail('search-index.json missing share-center.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase16-share-kits.js')) fail('package.json build missing build-phase16-share-kits.js');
if (!build.includes('phase16-pressure-test.js')) fail('package.json build missing phase16-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase16-share-kits.js')) fail('netlify.toml missing build-phase16-share-kits.js');
if (!netlify.includes('phase16-pressure-test.js')) fail('netlify.toml missing phase16-pressure-test.js');
for (const route of ['from = "/share-center"', 'from = "/share-kits"', 'from = "/social-kits"', 'from = "/copy-kits"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}
if (!netlify.includes('for = "/downloads/*.txt"')) fail('netlify.toml missing TXT download headers');

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('share-center.html')) fail('cleanup script missing Share Center self-heal/nav target');
if (!cleanup.includes('build-phase16-share-kits.js')) fail('cleanup script missing Phase 16 builder fallback');
if (!cleanup.includes('safeSearchJs')) fail('cleanup script missing safe search.js overwrite');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 16 SHARE KIT PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 16 SHARE KIT PRESSURE TEST PASSED');
console.log(`Checked ${kits.length} share kits, HTML kit pages, JSON/Markdown/TXT downloads, page patches, sitemap, llms.txt, search index, redirects, headers, Signal Board nav, and cleanup fallback.`);
