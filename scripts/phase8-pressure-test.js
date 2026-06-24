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

requireFile('data/trust-center.json');
requireFile('scripts/build-phase8-trust-center.js');
requireFile('trust-center.html');
requireFile('conversion-funnel.html');
requireFile('black-file.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/trust-center.json') ? json('data/trust-center.json') : { pages: [], principles: [] };
const pages = data.pages || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.principles) || data.principles.length < 7) fail('data/trust-center.json expected at least 7 principles');
if (pages.length < 6) fail(`data/trust-center.json expected at least 6 trust pages, found ${pages.length}`);

requireIncludes('trust-center.html', 'TRUST CENTER', 'Trust Center hero');
requireIncludes('trust-center.html', 'TRUST ENGINE STATUS', 'Trust Engine status terminal');
requireIncludes('trust-center.html', 'Operating Principles', 'Operating Principles section');
requireIncludes('trust-center.html', 'Signal Board', 'Signal Board nav');
requireIncludes('trust-center.html', 'Trust Center', 'Trust Center nav');
requireIncludes('conversion-funnel.html', 'id="phase-eight-trust-engine"', 'Phase 8 Trust patch on conversion funnel');
requireIncludes('black-file.html', 'id="phase-eight-trust-engine"', 'Phase 8 Trust patch on Black File');

for (const page of pages) {
  const file = `trust-${page.slug}.html`;
  requireFile(file);
  requireIncludes(file, page.title, `trust page title ${page.title}`);
  requireIncludes(file, 'TRUST DISCIPLINE', 'Trust discipline terminal');
  requireIncludes(file, 'Standards', 'Standards section');
  requireIncludes(file, 'Trust Center', 'Trust Center route');
  requireIncludes(file, 'Evidence Vault', 'Evidence Vault route');
  if (!Array.isArray(page.sections) || page.sections.length < 3) fail(`${page.slug}: expected at least 3 standards`);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

requireIncludes('sitemap.xml', '/trust-center.html', 'trust-center sitemap entry');
requireIncludes('llms.txt', '/trust-center.html', 'trust-center llms.txt entry');
if (!search.some(item => item.url === 'trust-center.html')) fail('search-index.json missing trust-center.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase8-trust-center.js')) fail('package.json build missing build-phase8-trust-center.js');
if (!build.includes('phase8-pressure-test.js')) fail('package.json build missing phase8-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase8-trust-center.js')) fail('netlify.toml missing build-phase8-trust-center.js');
if (!netlify.includes('phase8-pressure-test.js')) fail('netlify.toml missing phase8-pressure-test.js');
for (const route of ['from = "/trust"', 'from = "/trust-center"', 'from = "/privacy"', 'from = "/corrections"', 'from = "/source-methodology"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('trust-center.html')) fail('cleanup script missing Trust Center self-heal/nav target');
if (!cleanup.includes('build-phase8-trust-center.js')) fail('cleanup script missing Phase 8 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 8 TRUST CENTER PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 8 TRUST CENTER PRESSURE TEST PASSED');
console.log(`Checked ${pages.length} trust pages, Trust Center hub, Black File/funnel patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
