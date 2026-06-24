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

requireFile('data/offer-stack.json');
requireFile('scripts/build-phase18-offer-stack.js');
requireFile('offer-center.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/offer-stack.json') ? json('data/offer-stack.json') : { offers: [], rules: [] };
const offers = data.offers || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/offer-stack.json expected at least 6 offer rules');
if (offers.length < 6) fail(`data/offer-stack.json expected at least 6 offers, found ${offers.length}`);

requireIncludes('offer-center.html', 'OFFER CENTER', 'Offer Center hero');
requireIncludes('offer-center.html', 'OFFER STACK STATUS', 'Offer Stack status terminal');
requireIncludes('offer-center.html', 'Offer Routes', 'Offer Routes section');
requireIncludes('offer-center.html', 'Offer Rules', 'Offer Rules section');
requireIncludes('offer-center.html', 'Signal Board', 'Signal Board nav');
requireIncludes('offer-center.html', 'Amazon Store', 'Amazon Store nav');
for (const file of ['index.html','books.html','amazon-store-books.html','sales-ladder.html','book-universe.html','launch-room.html','share-center.html']) {
  requireIncludes(file, 'id="phase-eighteen-offer-stack-engine"', `Phase 18 patch on ${file}`);
}

for (const offer of offers) {
  const htmlFile = `offer-${offer.slug}.html`;
  const jsonFile = `downloads/offer-${offer.slug}.json`;
  const mdFile = `downloads/offer-${offer.slug}.md`;
  requireFile(htmlFile);
  requireFile(jsonFile);
  requireFile(mdFile);
  requireIncludes(htmlFile, offer.title, `offer title ${offer.title}`);
  requireIncludes(htmlFile, 'OFFER ROOM', 'Offer room terminal');
  requireIncludes(htmlFile, 'Offer Boundary', 'Offer Boundary section');
  requireIncludes(htmlFile, 'Offer Routes', 'Offer Routes section');
  requireIncludes(htmlFile, 'Offer Steps', 'Offer Steps section');
  requireIncludes(htmlFile, jsonFile, 'JSON offer link');
  requireIncludes(htmlFile, mdFile, 'Markdown offer link');
  if (!Array.isArray(offer.steps) || offer.steps.length < 5) fail(`${offer.slug}: expected at least 5 offer steps`);
  const offerData = json(jsonFile);
  if (!offerData.boundary || !offerData.buyRoute || !offerData.trustRoute || !offerData.evidenceRoute || !offerData.readerPath) fail(`${jsonFile}: missing boundary/buy/trust/evidence/reader route`);
  requireIncludes(mdFile, '## Boundary', `${mdFile} boundary section`);
  requireIncludes(mdFile, '## Offer Steps', `${mdFile} offer steps section`);
  if (!search.some(item => item.url === htmlFile)) fail(`search-index.json missing ${htmlFile}`);
  requireIncludes('sitemap.xml', `/${htmlFile}`, `${htmlFile} sitemap entry`);
  requireIncludes('llms.txt', `/${jsonFile}`, `${jsonFile} llms.txt entry`);
}

requireIncludes('sitemap.xml', '/offer-center.html', 'offer-center sitemap entry');
requireIncludes('llms.txt', '/offer-center.html', 'offer-center llms.txt entry');
if (!search.some(item => item.url === 'offer-center.html')) fail('search-index.json missing offer-center.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase18-offer-stack.js')) fail('package.json build missing build-phase18-offer-stack.js');
if (!build.includes('phase18-pressure-test.js')) fail('package.json build missing phase18-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase18-offer-stack.js')) fail('netlify.toml missing Phase 18 build command');
if (!netlify.includes('phase18-pressure-test.js')) fail('netlify.toml missing Phase 18 pressure test command');
for (const route of ['from = "/offer-center"', 'from = "/offers"', 'from = "/book-offers"', 'from = "/revenue-ladder"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}
const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('offer-center.html')) fail('cleanup script missing Offer Center self-heal/nav target');
if (!cleanup.includes('build-phase18-offer-stack.js')) fail('cleanup script missing Phase 18 builder fallback');
if (!cleanup.includes('safeSearchJs')) fail('cleanup script missing safe search.js overwrite');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 18 OFFER STACK PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 18 OFFER STACK PRESSURE TEST PASSED');
console.log(`Checked ${offers.length} offers, HTML offer pages, JSON/Markdown offer plans, page patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
