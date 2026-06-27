const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function forbidIncludes(file, text, label = text) { if (exists(file) && read(file).includes(text)) fail(`${file}: leaked ${label}`); }

for (const file of [
  'data/live-intel-sources.json',
  'data/live-intel.json',
  'scripts/update-live-intel.js',
  'scripts/update-seven-day-intel.js',
  'scripts/build-live-intel-machine.js',
  'live-intel.html',
  'downloads/live-intel-latest.json',
  'downloads/live-intel-latest.md',
  '.github/workflows/live-intel-update.yml',
  'package.json',
  'netlify.toml'
]) requireFile(file);

if (exists('data/live-intel-sources.json')) {
  const sources = JSON.parse(read('data/live-intel-sources.json'));
  if (!Array.isArray(sources.lanes) || sources.lanes.length < 5) fail('live intel sources expected at least 5 source lanes');
  if (!Array.isArray(sources.rssFeeds) || sources.rssFeeds.length < 5) fail('live intel sources expected at least 5 RSS feeds');
  for (const lane of sources.lanes || []) {
    for (const field of ['id', 'title', 'description', 'route', 'evidenceRoute', 'videoRoute', 'bookRoute', 'offerRoute']) {
      if (!lane[field]) fail(`live intel lane ${lane.id || 'unknown'} missing ${field}`);
    }
    if (lane.offerRoute === 'offer-intelligence-entry.html' || lane.offerRoute === 'offer-crime-dossier-entry.html') {
      fail(`live intel lane ${lane.id} uses obsolete offerRoute ${lane.offerRoute}`);
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

for (const marker of ['LIVE INTEL.', 'LIVE INTEL STATUS', 'Source Lanes', 'Latest Actionable Updates', 'Evidence Level', 'Why It Matters', 'Next Action', 'VIDEO HOOK', 'Free Brief', 'Books / Store', 'Rumble Channels', 'HTML sanitizer: active', 'Route normalizer: active']) {
  requireIncludes('live-intel.html', marker, marker);
}

// Real <a href="..."> tags are required for navigation and CTAs. Only escaped feed markup is reader-visible HTML leakage.
for (const file of ['live-intel.html', 'downloads/live-intel-latest.md']) {
  for (const forbidden of ['&lt;a href=', '&lt;font ', '&lt;/a&gt;', '&lt;/font&gt;', '&nbsp;', 'offer-intelligence-entry.html', 'offer-crime-dossier-entry.html']) {
    forbidIncludes(file, forbidden, forbidden);
  }
}
for (const file of ['downloads/live-intel-latest.json']) {
  for (const forbidden of ['<a href=', '<font ', '&lt;a href=', '&lt;font ', 'target="_blank"', '&nbsp;', '&lt;/a&gt;', '&lt;/font&gt;', 'offer-intelligence-entry.html', 'offer-crime-dossier-entry.html']) {
    forbidIncludes(file, forbidden, forbidden);
  }
}
for (const file of ['scripts/update-live-intel.js', 'scripts/update-seven-day-intel.js', 'scripts/build-live-intel-machine.js']) {
  requireIncludes(file, 'decodeEntities', `${file} decodeEntities sanitizer`);
  requireIncludes(file, '<[^>]+>', `${file} tag stripper`);
  requireIncludes(file, '&lt;', `${file} encoded less-than handling`);
  requireIncludes(file, '&nbsp;', `${file} nbsp handling`);
}
requireIncludes('scripts/build-live-intel-machine.js', 'routeAliases', 'Live Intel route normalizer');
requireIncludes('scripts/build-live-intel-machine.js', 'offer-intelligence-dossiers.html', 'valid intelligence offer route');
requireIncludes('scripts/build-live-intel-machine.js', 'offer-crime-dossiers.html', 'valid crime offer route');
for (const file of ['index.html', 'news.html', 'evidence-vault.html', 'epstein-files.html', 'videos.html', 'books.html']) {
  requireIncludes(file, 'live-intel-machine-route', 'Live Intel route patch');
}
requireIncludes('downloads/live-intel-latest.json', 'rumbleShortTitle', 'latest intel video hook data');
requireIncludes('downloads/live-intel-latest.json', 'optinRoute', 'latest intel opt-in route');
requireIncludes('downloads/live-intel-latest.json', 'htmlSanitized', 'latest intel sanitizer marker');
requireIncludes('downloads/live-intel-latest.md', '# Live Intel Machine', 'latest intel markdown brief');
requireIncludes('downloads/live-intel-latest.md', 'Video hook:', 'markdown video hook');
requireIncludes('search-index.json', 'live-intel.html', 'search index route');
requireIncludes('sitemap.xml', 'live-intel.html', 'sitemap route');
requireIncludes('llms.txt', '/live-intel.html', 'llms route');
requireIncludes('.github/workflows/live-intel-update.yml', 'cron', 'scheduled workflow');
requireIncludes('.github/workflows/live-intel-update.yml', 'update-live-intel.js', 'scheduled updater script');
requireIncludes('.github/workflows/live-intel-update.yml', 'contents: write', 'workflow write permission');
requireIncludes('package.json', 'build-live-intel-machine.js', 'npm build Live Intel builder');
requireIncludes('package.json', 'live-intel-pressure-test.js', 'npm build Live Intel pressure test');
requireIncludes('netlify.toml', 'build-live-intel-machine.js', 'Netlify Live Intel builder');
requireIncludes('netlify.toml', 'live-intel-pressure-test.js', 'Netlify Live Intel pressure test');

if (problems.length) {
  console.error('\nLIVE INTEL PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('LIVE INTEL PRESSURE TEST PASSED');
console.log('Checked source lanes, updater enrichment, static hub, downloads, no reader-visible RSS HTML leakage, legitimate page links, route normalization, page patches, search/sitemap/llms, scheduled workflow, video hooks, opt-ins, offers, book/store routes, npm wiring, and Netlify wiring.');
