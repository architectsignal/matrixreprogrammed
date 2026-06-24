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

requireFile('data/feed-engine.json');
requireFile('scripts/build-phase15-feed-engine.js');
requireFile('feed-center.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');

const data = exists('data/feed-engine.json') ? json('data/feed-engine.json') : { feeds: [], rules: [] };
const feeds = data.feeds || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 6) fail('data/feed-engine.json expected at least 6 feed rules');
if (feeds.length < 4) fail(`data/feed-engine.json expected at least 4 feeds, found ${feeds.length}`);

requireIncludes('feed-center.html', 'FEED CENTER', 'Feed Center hero');
requireIncludes('feed-center.html', 'FEED ENGINE STATUS', 'Feed Engine status terminal');
requireIncludes('feed-center.html', 'RSS', 'RSS link label');
requireIncludes('feed-center.html', 'Atom', 'Atom link label');
requireIncludes('feed-center.html', 'JSON Feed', 'JSON Feed link label');
requireIncludes('feed-center.html', 'Signal Board', 'Signal Board nav');
requireIncludes('feed-center.html', 'Feed Center', 'Feed Center nav');
for (const file of ['index.html','news.html','download-center.html','schema-index.html','update-monitor.html','authority-hub.html']) {
  requireIncludes(file, 'id="phase-fifteen-feed-engine"', `Phase 15 patch on ${file}`);
}

for (const feed of feeds) {
  const atomOutput = feed.atomOutput || feed.rssOutput.replace('.xml','-atom.xml');
  requireFile(feed.htmlRoute);
  requireFile(feed.rssOutput);
  requireFile(atomOutput);
  requireFile(feed.jsonOutput);
  requireIncludes(feed.htmlRoute, feed.title, `feed title ${feed.title}`);
  requireIncludes(feed.htmlRoute, 'FEED STATUS', 'Feed status terminal');
  requireIncludes(feed.htmlRoute, 'Feed Boundary', 'Feed Boundary section');
  requireIncludes(feed.htmlRoute, feed.rssOutput, 'RSS output link');
  requireIncludes(feed.htmlRoute, atomOutput, 'Atom output link');
  requireIncludes(feed.htmlRoute, feed.jsonOutput, 'JSON output link');
  requireIncludes(feed.rssOutput, '<rss version="2.0">', `${feed.rssOutput} RSS tag`);
  requireIncludes(atomOutput, '<feed xmlns="http://www.w3.org/2005/Atom">', `${atomOutput} Atom tag`);
  const feedJson = json(feed.jsonOutput);
  if (!feedJson.version || !Array.isArray(feedJson.items) || feedJson.items.length < 1) fail(`${feed.jsonOutput}: invalid JSON Feed output`);
  if (!Array.isArray(feed.routes) || feed.routes.length < 6) fail(`${feed.slug}: expected at least 6 feed routes`);
  if (!search.some(item => item.url === feed.htmlRoute)) fail(`search-index.json missing ${feed.htmlRoute}`);
  requireIncludes('sitemap.xml', `/${feed.htmlRoute}`, `${feed.htmlRoute} sitemap entry`);
  requireIncludes('llms.txt', `/${feed.rssOutput}`, `${feed.rssOutput} llms.txt entry`);
  requireIncludes('llms.txt', `/${feed.jsonOutput}`, `${feed.jsonOutput} llms.txt entry`);
}

requireIncludes('sitemap.xml', '/feed-center.html', 'feed-center sitemap entry');
requireIncludes('llms.txt', '/feed-center.html', 'feed-center llms.txt entry');
if (!search.some(item => item.url === 'feed-center.html')) fail('search-index.json missing feed-center.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase15-feed-engine.js')) fail('package.json build missing build-phase15-feed-engine.js');
if (!build.includes('phase15-pressure-test.js')) fail('package.json build missing phase15-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase15-feed-engine.js')) fail('netlify.toml missing build-phase15-feed-engine.js');
if (!netlify.includes('phase15-pressure-test.js')) fail('netlify.toml missing phase15-pressure-test.js');
for (const route of ['from = "/feed-center"', 'from = "/feeds"', 'from = "/rss"', 'from = "/atom"', 'from = "/json-feed"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing ${route} redirect`);
}
if (!netlify.includes('for = "/feeds/*.xml"')) fail('netlify.toml missing XML feed headers');
if (!netlify.includes('for = "/feeds/*.json"')) fail('netlify.toml missing JSON feed headers');

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseChecks')) fail('cleanup script missing phaseChecks self-heal structure');
if (!cleanup.includes('feed-center.html')) fail('cleanup script missing Feed Center self-heal/nav target');
if (!cleanup.includes('build-phase15-feed-engine.js')) fail('cleanup script missing Phase 15 builder fallback');
if (!cleanup.includes('safeSearchJs')) fail('cleanup script missing safe search.js overwrite');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 15 FEED DISCOVERY PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 15 FEED DISCOVERY PRESSURE TEST PASSED');
console.log(`Checked ${feeds.length} feeds, RSS/Atom/JSON outputs, feed pages, page patches, sitemap, llms.txt, search index, redirects, headers, Signal Board nav, and cleanup fallback.`);
