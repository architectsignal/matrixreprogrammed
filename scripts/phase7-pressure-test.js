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

requireFile('data/conversion-funnel.json');
requireFile('scripts/build-phase7-conversion-funnel.js');
requireFile('conversion-funnel.html');
requireFile('black-file.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/conversion-funnel.json') ? json('data/conversion-funnel.json') : { funnels: [], rules: [] };
const funnels = data.funnels || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/conversion-funnel.json expected at least 6 conversion rules');
if (funnels.length < 5) fail(`data/conversion-funnel.json expected at least 5 funnels, found ${funnels.length}`);

requireIncludes('conversion-funnel.html', 'CONVERSION FUNNEL', 'Conversion Funnel hero');
requireIncludes('conversion-funnel.html', 'CONVERSION ENGINE STATUS', 'Conversion Engine status terminal');
requireIncludes('conversion-funnel.html', 'Lead Magnet Doors', 'Lead Magnet Doors section');
requireIncludes('conversion-funnel.html', 'Signal Board', 'Signal Board nav');
requireIncludes('conversion-funnel.html', 'Funnels', 'Funnels nav');
requireIncludes('black-file.html', 'id="phase-seven-funnel-engine"', 'Phase 7 section on Black File');

for (const funnel of funnels) {
  const funnelFile = `funnel-${funnel.slug}.html`;
  const thanksFile = funnel.thankYouPage;
  requireFile(funnelFile);
  requireFile(thanksFile);
  requireIncludes(funnelFile, funnel.title, `funnel title ${funnel.title}`);
  requireIncludes(funnelFile, funnel.formName, `Netlify form ${funnel.formName}`);
  requireIncludes(funnelFile, 'data-netlify="true"', 'Netlify form attribute');
  requireIncludes(funnelFile, 'netlify-honeypot="bot-field"', 'Netlify honeypot');
  requireIncludes(funnelFile, `action="/${thanksFile}"`, 'thank-you action');
  requireIncludes(funnelFile, 'reader-path', 'reader-path segmentation field');
  requireIncludes(funnelFile, 'After You Enter', 'post opt-in route section');
  requireIncludes(funnelFile, 'Book Path', 'book path section');
  requireIncludes(thanksFile, funnel.title, `thank-you title ${funnel.title}`);
  requireIncludes(thanksFile, 'Recommended Route', 'recommended route section');
  requireIncludes(thanksFile, 'Books To Open Next', 'books next section');
  if (!Array.isArray(funnel.routes) || funnel.routes.length < 4) fail(`${funnel.slug}: expected at least 4 routes`);
  if (!Array.isArray(funnel.books) || funnel.books.length < 3) fail(`${funnel.slug}: expected at least 3 book routes`);
  if (!search.some(item => item.url === funnelFile)) fail(`search-index.json missing ${funnelFile}`);
  requireIncludes('sitemap.xml', `/${funnelFile}`, `${funnelFile} sitemap entry`);
  requireIncludes('sitemap.xml', `/${thanksFile}`, `${thanksFile} sitemap entry`);
}

requireIncludes('sitemap.xml', '/conversion-funnel.html', 'conversion-funnel sitemap entry');
requireIncludes('llms.txt', '/conversion-funnel.html', 'conversion-funnel llms.txt entry');
if (!search.some(item => item.url === 'conversion-funnel.html')) fail('search-index.json missing conversion-funnel.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase7-conversion-funnel.js')) fail('package.json build missing build-phase7-conversion-funnel.js');
if (!build.includes('phase7-pressure-test.js')) fail('package.json build missing phase7-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase7-conversion-funnel.js')) fail('netlify.toml missing build-phase7-conversion-funnel.js');
if (!netlify.includes('phase7-pressure-test.js')) fail('netlify.toml missing phase7-pressure-test.js');
for (const route of ['from = "/conversion-funnel"', 'from = "/funnels"', 'from = "/black-file-funnel"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('conversion-funnel.html')) fail('cleanup script master nav missing Funnels link');
if (!cleanup.includes('build-phase7-conversion-funnel.js')) fail('cleanup script missing Phase 7 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');

if (problems.length) {
  console.error('\nPHASE 7 CONVERSION FUNNEL PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 7 CONVERSION FUNNEL PRESSURE TEST PASSED');
console.log(`Checked ${funnels.length} funnels, Netlify forms, thank-you pages, Black File patch, search index, sitemap, llms.txt, redirects, Signal Board nav, and cleanup fallback.`);
