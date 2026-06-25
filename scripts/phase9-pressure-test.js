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
function requireOneOf(file, texts, label) { if (!exists(file)) return; const body = read(file); if (!texts.some(text => body.includes(text))) fail(`${file}: missing ${label}`); }

requireFile('data/content-distribution.json');
requireFile('scripts/build-phase9-content-distribution.js');
requireFile('distribution-center.html');
requireFile('videos.html');
requireFile('podcast.html');
requireFile('news.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/content-distribution.json') ? json('data/content-distribution.json') : { formats: [], rules: [] };
const formats = data.formats || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/content-distribution.json expected at least 6 distribution rules');
if (formats.length < 6) fail(`data/content-distribution.json expected at least 6 formats, found ${formats.length}`);

requireIncludes('distribution-center.html', 'DISTRIBUTION CENTER', 'Distribution Center hero');
requireIncludes('distribution-center.html', 'DISTRIBUTION ENGINE STATUS', 'Distribution Engine status terminal');
requireIncludes('distribution-center.html', 'Distribution Formats', 'Distribution Formats section');
requireIncludes('distribution-center.html', 'Signal Board', 'Signal Board nav');
requireIncludes('distribution-center.html', 'Trust Center', 'Trust Center nav');
requireIncludes('videos.html', 'id="phase-nine-distribution-engine"', 'Phase 9 patch on videos');
requireIncludes('podcast.html', 'id="phase-nine-distribution-engine"', 'Phase 9 patch on podcast');
requireIncludes('news.html', 'id="phase-nine-distribution-engine"', 'Phase 9 patch on news');

for (const format of formats) {
  const file = `distribution-${format.slug}.html`;
  requireFile(file);
  requireIncludes(file, format.title, `distribution title ${format.title}`);
  requireIncludes(file, 'DISTRIBUTION FORMAT', 'Distribution format terminal');
  requireIncludes(file, 'Template', 'Template section');
  requireIncludes(file, 'Sample Briefs', 'Sample Briefs section');
  requireOneOf(file, ['Source Trails', 'Source Pathways'], 'reader-facing source trail section');
  requireIncludes(file, 'Trust Center', 'Trust pathway');
  if (!Array.isArray(format.template) || format.template.length < 5) fail(`${format.slug}: expected at least 5 template steps`);
  if (!Array.isArray(format.sampleBriefs) || format.sampleBriefs.length < 3) fail(`${format.slug}: expected at least 3 sample briefs`);
  if (!Array.isArray(format.routes) || format.routes.length < 4) fail(`${format.slug}: expected at least 4 source trail entries`);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

requireIncludes('sitemap.xml', '/distribution-center.html', 'distribution-center sitemap entry');
requireIncludes('llms.txt', '/distribution-center.html', 'distribution-center llms.txt entry');
if (!search.some(item => item.url === 'distribution-center.html')) fail('search-index.json missing distribution-center.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase9-content-distribution.js')) fail('package.json build missing build-phase9-content-distribution.js');
if (!build.includes('phase9-pressure-test.js')) fail('package.json build missing phase9-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase9-content-distribution.js')) fail('netlify.toml missing build-phase9-content-distribution.js');
if (!netlify.includes('phase9-pressure-test.js')) fail('netlify.toml missing phase9-pressure-test.js');
for (const route of ['from = "/distribution"', 'from = "/distribution-center"', 'from = "/content-engine"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('distribution-center.html')) fail('cleanup script missing Distribution self-heal/nav target');
if (!cleanup.includes('build-phase9-content-distribution.js')) fail('cleanup script missing Phase 9 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 9 CONTENT DISTRIBUTION PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 9 CONTENT DISTRIBUTION PRESSURE TEST PASSED');
console.log(`Checked ${formats.length} distribution formats, source trail sections, format pages, video/podcast/news patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
