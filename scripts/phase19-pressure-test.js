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

requireFile('data/lead-magnets.json');
requireFile('data/live-intel.json');
requireFile('scripts/build-phase19-lead-magnets.js');
requireFile('optin-center.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/lead-magnets.json') ? json('data/lead-magnets.json') : { magnets: [], rules: [] };
const liveIntel = exists('data/live-intel.json') ? json('data/live-intel.json') : { items: [] };
const magnets = data.magnets || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 8) fail('data/lead-magnets.json expected at least 8 useful capture rules');
if (magnets.length < 6) fail(`data/lead-magnets.json expected at least 6 lead magnets, found ${magnets.length}`);
if (!Array.isArray(liveIntel.items) || liveIntel.items.length < 4) fail('data/live-intel.json expected at least 4 live-intel items for seven-day briefs');

requireIncludes('optin-center.html', 'OPT-IN CENTER', 'Opt-in Center hero');
requireIncludes('optin-center.html', 'LEAD MAGNET ENGINE STATUS', 'Lead Magnet status terminal');
requireIncludes('optin-center.html', 'Useful Free Briefs', 'Useful Free Briefs section');
requireIncludes('optin-center.html', 'Seven-day windows: active', 'seven-day windows status');
requireIncludes('optin-center.html', 'Capture Rules', 'Capture Rules section');
requireIncludes('optin-center.html', 'Signal Board', 'Signal Board nav');
requireIncludes('optin-center.html', 'Opt-in Center', 'Opt-in Center nav');
requireIncludes('optin-center.html', 'Amazon Store', 'Amazon Store nav');
for (const file of ['index.html','offer-center.html','launch-room.html','share-center.html','download-center.html','trust-center.html','black-file.html']) {
  requireIncludes(file, 'id="phase-nineteen-lead-magnet-engine"', `Phase 19 patch on ${file}`);
  requireIncludes(file, 'Useful Free Briefs', `${file} useful free briefs language`);
}

for (const magnet of magnets) {
  const htmlFile = `optin-${magnet.slug}.html`;
  const jsonFile = `downloads/lead-magnet-${magnet.slug}.json`;
  const mdFile = `downloads/lead-magnet-${magnet.slug}.md`;
  requireFile(htmlFile);
  requireFile(jsonFile);
  requireFile(mdFile);
  requireIncludes(htmlFile, magnet.title, `lead magnet title ${magnet.title}`);
  requireIncludes(htmlFile, 'FREE BRIEF STATUS', 'Free brief status terminal');
  requireIncludes(htmlFile, 'Last 7 Days Intelligence Window', 'seven-day intelligence window');
  requireIncludes(htmlFile, 'Reader Outcome', 'reader outcome section');
  requireIncludes(htmlFile, 'What You Will Learn', 'learning section');
  requireIncludes(htmlFile, 'Practical Checklist', 'practical checklist section');
  requireIncludes(htmlFile, 'Action Steps', 'action steps section');
  requireIncludes(htmlFile, 'data-netlify="true"', 'Netlify form marker');
  requireIncludes(htmlFile, `name="${magnet.formName}"`, `form name ${magnet.formName}`);
  requireIncludes(htmlFile, `value="${magnet.formName}"`, `hidden form-name ${magnet.formName}`);
  requireIncludes(htmlFile, 'type="email"', 'email input');
  requireIncludes(htmlFile, 'Opt-in Routes', 'Opt-in routes section');
  requireIncludes(htmlFile, 'What This Brief Includes', 'deliverables section');
  requireIncludes(htmlFile, jsonFile, 'JSON brief link');
  requireIncludes(htmlFile, mdFile, 'Markdown brief link');
  if (!Array.isArray(magnet.deliverables) || magnet.deliverables.length < 6) fail(`${magnet.slug}: expected at least 6 useful deliverables`);
  for (const key of ['readerOutcome','whatYouLearn','checklist','actionSteps','evidenceRoutes','nextBestStep']) {
    if (!magnet[key]) fail(`${magnet.slug}: missing ${key}`);
  }
  if (!Array.isArray(magnet.whatYouLearn) || magnet.whatYouLearn.length < 4) fail(`${magnet.slug}: expected at least 4 whatYouLearn items`);
  if (!Array.isArray(magnet.checklist) || magnet.checklist.length < 5) fail(`${magnet.slug}: expected at least 5 checklist items`);
  if (!Array.isArray(magnet.actionSteps) || magnet.actionSteps.length < 4) fail(`${magnet.slug}: expected at least 4 action steps`);
  if (!Array.isArray(magnet.evidenceRoutes) || magnet.evidenceRoutes.length < 4) fail(`${magnet.slug}: expected at least 4 evidence routes`);
  const magnetData = json(jsonFile);
  if (!magnetData.boundary || !magnetData.formName || !magnetData.trustRoute || !magnetData.privacyRoute || !magnetData.evidenceRoute || !magnetData.offerRoute) fail(`${jsonFile}: missing boundary/form/trust/privacy/evidence/offer route`);
  if (!magnetData.readerOutcome || !Array.isArray(magnetData.whatYouLearn) || !Array.isArray(magnetData.checklist) || !Array.isArray(magnetData.actionSteps)) fail(`${jsonFile}: missing useful brief reader outcome/learning/checklist/action steps`);
  if (!magnetData.sevenDayWindow || typeof magnetData.sevenDayWindow.itemCount !== 'number') fail(`${jsonFile}: missing sevenDayWindow metadata`);
  requireIncludes(mdFile, '## Boundary', `${mdFile} boundary section`);
  requireIncludes(mdFile, '## Last 7 Days Intelligence Window', `${mdFile} seven-day window section`);
  requireIncludes(mdFile, '## Reader Outcome', `${mdFile} reader outcome section`);
  requireIncludes(mdFile, '## What You Will Learn', `${mdFile} learning section`);
  requireIncludes(mdFile, '## Checklist', `${mdFile} checklist section`);
  requireIncludes(mdFile, '## Action Steps', `${mdFile} action steps section`);
  requireIncludes(mdFile, '## Deliverables', `${mdFile} deliverables section`);
  if (!search.some(item => item.url === htmlFile)) fail(`search-index.json missing ${htmlFile}`);
  requireIncludes('sitemap.xml', `/${htmlFile}`, `${htmlFile} sitemap entry`);
  requireIncludes('llms.txt', `/${jsonFile}`, `${jsonFile} llms.txt entry`);
}

requireIncludes('sitemap.xml', '/optin-center.html', 'optin-center sitemap entry');
requireIncludes('llms.txt', '/optin-center.html', 'optin-center llms.txt entry');
if (!search.some(item => item.url === 'optin-center.html')) fail('search-index.json missing optin-center.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase19-lead-magnets.js')) fail('package.json build missing build-phase19-lead-magnets.js');
if (!build.includes('phase19-pressure-test.js')) fail('package.json build missing phase19-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase19-lead-magnets.js')) fail('netlify.toml missing Phase 19 build command');
if (!netlify.includes('phase19-pressure-test.js')) fail('netlify.toml missing Phase 19 pressure test command');
for (const route of ['from = "/optin-center"', 'from = "/opt-in"', 'from = "/lead-magnets"', 'from = "/newsletter"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}
const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('optin-center.html')) fail('cleanup script missing Opt-in Center self-heal/nav target');
if (!cleanup.includes('build-phase19-lead-magnets.js')) fail('cleanup script missing Phase 19 builder fallback');
if (!cleanup.includes('safeSearchJs')) fail('cleanup script missing safe search.js overwrite');
if (!cleanup.includes('amazon-store-books.html')) fail('cleanup script master nav missing Amazon Store link');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 19 LEAD MAGNET PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 19 LEAD MAGNET PRESSURE TEST PASSED');
console.log(`Checked ${magnets.length} useful free briefs, seven-day intelligence windows, reader outcomes, checklists, action steps, evidence routes, opt-in pages, Netlify forms, JSON/Markdown briefs, page patches, sitemap, llms.txt, search index, redirects, Signal Board nav, Amazon Store nav, and cleanup fallback.`);
