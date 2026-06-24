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

requireFile('data/campaign-calendar.json');
requireFile('scripts/build-phase17-campaign-calendar.js');
requireFile('launch-room.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/campaign-calendar.json') ? json('data/campaign-calendar.json') : { campaigns: [], rules: [] };
const campaigns = data.campaigns || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/campaign-calendar.json expected at least 6 campaign rules');
if (campaigns.length < 6) fail(`data/campaign-calendar.json expected at least 6 campaigns, found ${campaigns.length}`);

requireIncludes('launch-room.html', 'LAUNCH ROOM', 'Launch Room hero');
requireIncludes('launch-room.html', 'LAUNCH ROOM STATUS', 'Launch Room status terminal');
requireIncludes('launch-room.html', 'Campaign Rooms', 'Campaign Rooms section');
requireIncludes('launch-room.html', 'Campaign Rules', 'Campaign Rules section');
requireIncludes('launch-room.html', 'Signal Board', 'Signal Board nav');
requireIncludes('launch-room.html', 'Launch Room', 'Launch Room nav');
for (const file of ['index.html','share-center.html','feed-center.html','download-center.html','sales-ladder.html','distribution-center.html']) {
  requireIncludes(file, 'id="phase-seventeen-campaign-calendar-engine"', `Phase 17 patch on ${file}`);
}

for (const campaign of campaigns) {
  const htmlFile = `campaign-${campaign.slug}.html`;
  const jsonFile = `downloads/campaign-${campaign.slug}.json`;
  const mdFile = `downloads/campaign-${campaign.slug}.md`;
  requireFile(htmlFile);
  requireFile(jsonFile);
  requireFile(mdFile);
  requireIncludes(htmlFile, campaign.title, `campaign title ${campaign.title}`);
  requireIncludes(htmlFile, 'CAMPAIGN ROOM', 'Campaign room terminal');
  requireIncludes(htmlFile, 'Campaign Boundary', 'Campaign Boundary section');
  requireIncludes(htmlFile, 'Campaign Routes', 'Campaign Routes section');
  requireIncludes(htmlFile, '7-Day Push Plan', '7-Day Push Plan section');
  requireIncludes(htmlFile, jsonFile, 'JSON campaign link');
  requireIncludes(htmlFile, mdFile, 'Markdown campaign link');
  if (!Array.isArray(campaign.dailyPushes) || campaign.dailyPushes.length < 7) fail(`${campaign.slug}: expected at least 7 daily pushes`);
  const campaignData = json(jsonFile);
  if (!campaignData.boundary || !campaignData.trustRoute || !campaignData.evidenceRoute || !campaignData.shareRoute || !campaignData.feedRoute) fail(`${jsonFile}: missing boundary/trust/evidence/share/feed route`);
  requireIncludes(mdFile, '## Boundary', `${mdFile} boundary section`);
  requireIncludes(mdFile, '## 7-Day Campaign', `${mdFile} 7-day campaign section`);
  if (!search.some(item => item.url === htmlFile)) fail(`search-index.json missing ${htmlFile}`);
  requireIncludes('sitemap.xml', `/${htmlFile}`, `${htmlFile} sitemap entry`);
  requireIncludes('llms.txt', `/${jsonFile}`, `${jsonFile} llms.txt entry`);
}

requireIncludes('sitemap.xml', '/launch-room.html', 'launch-room sitemap entry');
requireIncludes('llms.txt', '/launch-room.html', 'launch-room llms.txt entry');
if (!search.some(item => item.url === 'launch-room.html')) fail('search-index.json missing launch-room.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase17-campaign-calendar.js')) fail('package.json build missing build-phase17-campaign-calendar.js');
if (!build.includes('phase17-pressure-test.js')) fail('package.json build missing phase17-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('npm run build')) fail('netlify.toml should run npm run build');
for (const route of ['from = "/launch-room"', 'from = "/campaigns"', 'from = "/campaign-calendar"', 'from = "/launch-calendar"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}
const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('launch-room.html')) fail('cleanup script missing Launch Room self-heal/nav target');
if (!cleanup.includes('build-phase17-campaign-calendar.js')) fail('cleanup script missing Phase 17 builder fallback');
if (!cleanup.includes('safeSearchJs')) fail('cleanup script missing safe search.js overwrite');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 17 CAMPAIGN CALENDAR PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 17 CAMPAIGN CALENDAR PRESSURE TEST PASSED');
console.log(`Checked ${campaigns.length} campaigns, HTML campaign pages, JSON/Markdown plans, page patches, sitemap, llms.txt, search index, redirects, Signal Board nav, and cleanup fallback.`);
