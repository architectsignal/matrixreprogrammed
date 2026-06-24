const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }

for (const file of [
  'data/live-intel-sources.json',
  'data/live-intel.json',
  'scripts/update-live-intel.js',
  'scripts/build-live-intel-machine.js',
  'live-intel.html',
  'downloads/live-intel-latest.json',
  'downloads/live-intel-latest.md',
  '.github/workflows/live-intel-update.yml'
]) requireFile(file);

if (exists('data/live-intel-sources.json')) {
  const sources = JSON.parse(read('data/live-intel-sources.json'));
  if (!Array.isArray(sources.lanes) || sources.lanes.length < 5) fail('live intel sources expected at least 5 source lanes');
  if (!Array.isArray(sources.rssFeeds) || sources.rssFeeds.length < 5) fail('live intel sources expected at least 5 RSS feeds');
  for (const lane of sources.lanes || []) {
    for (const field of ['id', 'title', 'description', 'route', 'evidenceRoute', 'videoRoute', 'bookRoute', 'offerRoute']) {
      if (!lane[field]) fail(`live intel lane ${lane.id || 'unknown'} missing ${field}`);
    }
  }
}

if (exists('data/live-intel.json')) {
  const intel = JSON.parse(read('data/live-intel.json'));
  if (!Array.isArray(intel.items) || intel.items.length < 1) fail('data/live-intel.json expected at least one item or seed item');
  for (const item of intel.items || []) {
    for (const field of ['evidenceLevel', 'evidenceBoundary', 'whyItMatters', 'nextAction', 'videoHook', 'rumbleShortTitle', 'rumbleLongTitle', 'socialThread', 'optinRoute', 'offerRoute', 'bookRoute', 'storeRoute']) {
      if (!item[field]) fail(`live intel item ${item.id || item.title || 'unknown'} missing ${field}`);
    }
  }
}

for (const marker of ['LIVE INTEL.', 'LIVE INTEL STATUS', 'Source Lanes', 'Latest Actionable Updates', 'Evidence Level', 'Why It Matters', 'Next Action', 'VIDEO HOOK', 'Free Brief', 'Books / Store', 'Rumble Channels']) {
  requireIncludes('live-intel.html', marker, marker);
}
for (const file of ['index.html', 'news.html', 'evidence-vault.html', 'epstein-files.html', 'videos.html', 'books.html']) {
  requireIncludes(file, 'live-intel-machine-route', 'Live Intel route patch');
}
requireIncludes('downloads/live-intel-latest.json', 'rumbleShortTitle', 'latest intel video hook data');
requireIncludes('downloads/live-intel-latest.json', 'optinRoute', 'latest intel opt-in route');
requireIncludes('downloads/live-intel-latest.md', '# Live Intel Machine', 'latest intel markdown brief');
requireIncludes('downloads/live-intel-latest.md', 'Video hook:', 'markdown video hook');
requireIncludes('search-index.json', 'live-intel.html', 'search index route');
requireIncludes('sitemap.xml', 'live-intel.html', 'sitemap route');
requireIncludes('llms.txt', '/live-intel.html', 'llms route');
requireIncludes('.github/workflows/live-intel-update.yml', 'cron', 'scheduled workflow');
requireIncludes('.github/workflows/live-intel-update.yml', 'update-live-intel.js', 'scheduled updater script');
requireIncludes('.github/workflows/live-intel-update.yml', 'contents: write', 'workflow write permission');

if (problems.length) {
  console.error('\nLIVE INTEL PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('LIVE INTEL PRESSURE TEST PASSED');
console.log('Checked source lanes, updater enrichment, static hub, downloads, page patches, search/sitemap/llms, scheduled workflow, video hooks, opt-ins, offers, and book/store routes.');
