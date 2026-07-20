const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(message) { problems.push(message); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function forbidIncludes(file, text, label = text) { if (exists(file) && read(file).includes(text)) fail(`${file}: leaked ${label}`); }
function validTime(value) { const time = Date.parse(String(value || '')); return Number.isFinite(time) ? time : NaN; }

for (const file of [
  'data/live-intel-sources.json',
  'data/content-routes.json',
  'data/live-intel.json',
  'scripts/update-live-intel.js',
  'scripts/update-seven-day-intel.js',
  'scripts/build-live-intel-machine.js',
  'live-intel.html',
  'downloads/live-intel-latest.json',
  'downloads/live-intel-latest.md',
  '.github/workflows/live-intel-update.yml',
  '.github/workflows/auto-update-orchestrator.yml',
  'package.json',
  'netlify.toml'
]) requireFile(file);

let sources = {};
if (exists('data/live-intel-sources.json')) {
  sources = JSON.parse(read('data/live-intel-sources.json'));
  if (!Array.isArray(sources.lanes) || sources.lanes.length < 5) fail('live intel sources expected at least 5 source lanes');
  if (!Array.isArray(sources.rssFeeds) || sources.rssFeeds.length < 5) fail('live intel sources expected at least 5 discovery feeds');
  for (const lane of sources.lanes || []) {
    for (const field of ['id', 'title', 'description', 'route', 'evidenceRoute', 'videoRoute', 'bookRoute', 'offerRoute']) {
      if (!lane[field]) fail(`live intel lane ${lane.id || 'unknown'} missing ${field}`);
    }
    if (lane.offerRoute === 'offer-intelligence-entry.html' || lane.offerRoute === 'offer-crime-dossier-entry.html') fail(`live intel lane ${lane.id} uses obsolete offerRoute ${lane.offerRoute}`);
  }
}

if (exists('data/content-routes.json')) {
  const routes = JSON.parse(read('data/content-routes.json'));
  if (!Array.isArray(routes.sourceFeeds) || routes.sourceFeeds.length < 6) fail('official/public-record source feed configuration is incomplete');
  for (const feed of routes.sourceFeeds || []) if (!feed.name || !feed.url) fail('content-routes source feed missing name or url');
}

if (exists('data/live-intel.json')) {
  const intel = JSON.parse(read('data/live-intel.json'));
  const items = Array.isArray(intel.items) ? intel.items : [];
  const metrics = intel.collectionMetrics || {};
  const completed = validTime(intel.collectionCompletedAt || intel.updated);
  const cutoff = validTime(intel.sourceCollectionCutoff);
  const latest = validTime(intel.latestPublishedAt);
  const now = Date.now();
  if (!Number.isFinite(completed)) fail('live intel collection completion time is missing or invalid');
  else if (Math.abs(now - completed) > 24 * 60 * 60 * 1000) fail(`live intel collection is older than 24 hours: ${intel.collectionCompletedAt || intel.updated}`);
  if (!Number.isFinite(cutoff)) fail('live intel source collection cutoff is missing or invalid');
  if (!intel.freshnessTruth) fail('live intel freshnessTruth is required');
  if (!intel.status) fail('live intel collection status is required');
  if (Number(metrics.configuredFeedCount || 0) < 10) fail('live intel must combine discovery and official/public-record feeds');
  if (Number(metrics.successfulFeedCount || 0) < 1) fail('live intel collection completed without one successful feed');
  if (Number(metrics.currentItemCount || 0) !== items.length) fail('live intel currentItemCount does not match items length');
  if (items.length === 0 && intel.status !== 'no-fresh-source-items') fail('zero current items must use the truthful no-fresh-source-items status');
  let previous = Infinity;
  let maximum = -Infinity;
  for (const item of items) {
    for (const field of ['title', 'url', 'published', 'sourceLabel', 'sourceTier', 'evidenceLevel', 'evidenceBoundary', 'whyItMatters', 'nextAction', 'videoHook', 'rumbleShortTitle', 'rumbleLongTitle', 'socialThread', 'optinRoute', 'offerRoute', 'bookRoute', 'storeRoute']) {
      if (!item[field]) fail(`live intel item ${item.id || item.title || 'unknown'} missing ${field}`);
    }
    const published = validTime(item.published);
    if (!Number.isFinite(published)) fail(`live intel item ${item.id || item.title} has invalid publication time`);
    else {
      maximum = Math.max(maximum, published);
      if (published > previous) fail('live intel current items are not sorted newest-first');
      previous = published;
      if (Number.isFinite(cutoff) && published < cutoff) fail(`expired item remains current: ${item.title}`);
      if (published > now + 6 * 60 * 60 * 1000) fail(`future-dated item remains current: ${item.title}`);
    }
    if (/fallback public-record watch item|fallback archive post/i.test(item.title || item.summary || '')) fail(`synthetic freshness item is forbidden: ${item.title}`);
    if (!['primary-or-official', 'reputable-secondary', 'discovery'].includes(item.sourceTier)) fail(`unknown sourceTier ${item.sourceTier} on ${item.title}`);
  }
  if (items.length && (!Number.isFinite(latest) || latest !== maximum)) fail('latestPublishedAt does not equal the newest current source publication time');
}

for (const marker of ['LIVE INTEL.', 'LIVE INTEL STATUS', 'Collection completed:', 'Latest source publication:', 'Freshness truth', 'Source Lanes', 'Latest Actionable Updates', 'Evidence Level', 'Why It Matters', 'Next Action', 'VIDEO HOOK', 'Free Brief', 'Books / Store', 'HTML sanitizer: active', 'Route normalizer: active']) requireIncludes('live-intel.html', marker, marker);
for (const phrase of ['The collection timestamp is not an evidence date', 'No current source item is available']) requireIncludes('scripts/build-live-intel-machine.js', phrase, phrase);

for (const file of ['live-intel.html', 'downloads/live-intel-latest.md']) {
  for (const forbidden of ['&lt;a href=', '&lt;font ', '&lt;/a&gt;', '&lt;/font&gt;', '&nbsp;', 'offer-intelligence-entry.html', 'offer-crime-dossier-entry.html']) forbidIncludes(file, forbidden, forbidden);
}
for (const file of ['downloads/live-intel-latest.json']) {
  for (const forbidden of ['<a href=', '<font ', '&lt;a href=', '&lt;font ', 'target="_blank"', '&nbsp;', '&lt;/a&gt;', '&lt;/font&gt;', 'offer-intelligence-entry.html', 'offer-crime-dossier-entry.html']) forbidIncludes(file, forbidden, forbidden);
}
for (const file of ['scripts/update-live-intel.js', 'scripts/update-seven-day-intel.js', 'scripts/build-live-intel-machine.js']) {
  requireIncludes(file, 'decodeEntities', `${file} decodeEntities sanitizer`);
  requireIncludes(file, '<[^>]+>', `${file} tag stripper`);
  requireIncludes(file, '&lt;', `${file} encoded less-than handling`);
  requireIncludes(file, '&nbsp;', `${file} nbsp handling`);
}
requireIncludes('scripts/update-seven-day-intel.js', '<entry\\b', 'Atom feed support');
requireIncludes('scripts/update-seven-day-intel.js', 'primary-or-official', 'official source classification');
requireIncludes('scripts/update-seven-day-intel.js', 'Synthetic current-date fallback stories are forbidden', 'synthetic freshness prohibition');
requireIncludes('scripts/build-live-intel-machine.js', 'routeAliases', 'Live Intel route normalizer');
requireIncludes('scripts/build-live-intel-machine.js', 'truthfulFreshnessMetadata', 'truthful freshness export');
requireIncludes('scripts/build-live-intel-machine.js', 'offer-intelligence-dossiers.html', 'valid intelligence offer route');
requireIncludes('scripts/build-live-intel-machine.js', 'offer-crime-dossiers.html', 'valid crime offer route');
for (const file of ['index.html', 'news.html', 'evidence-vault.html', 'epstein-files.html', 'videos.html', 'books.html']) requireIncludes(file, 'live-intel-machine-route', 'Live Intel route patch');
requireIncludes('downloads/live-intel-latest.json', 'latestPublishedAt', 'latest source publication metadata');
requireIncludes('downloads/live-intel-latest.json', 'collectionCompletedAt', 'collection completion metadata');
requireIncludes('downloads/live-intel-latest.json', 'rumbleShortTitle', 'latest intel video hook data');
requireIncludes('downloads/live-intel-latest.json', 'optinRoute', 'latest intel opt-in route');
requireIncludes('downloads/live-intel-latest.json', 'htmlSanitized', 'latest intel sanitizer marker');
requireIncludes('downloads/live-intel-latest.md', '# Live Intel Machine', 'latest intel markdown brief');
requireIncludes('search-index.json', 'live-intel.html', 'search index route');
requireIncludes('sitemap.xml', 'live-intel.html', 'sitemap route');
requireIncludes('llms.txt', '/live-intel.html', 'llms route');
requireIncludes('.github/workflows/live-intel-update.yml', "cron: '17 */6 * * *'", 'six-hour scheduled collection');
requireIncludes('.github/workflows/live-intel-update.yml', 'update-seven-day-intel.js', 'current seven-day collector');
requireIncludes('.github/workflows/live-intel-update.yml', 'live-intel.html', 'generated Live Intel page commit');
requireIncludes('.github/workflows/live-intel-update.yml', 'downloads/live-intel-latest.json', 'generated Live Intel JSON commit');
requireIncludes('.github/workflows/live-intel-update.yml', 'contents: write', 'workflow write permission');
requireIncludes('.github/workflows/auto-update-orchestrator.yml', 'live-intel-pressure-test.js', 'daily orchestrator freshness gate');
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
console.log('Checked current-window truthfulness, collection/source date separation, newest-first sorting, official feeds, RSS/Atom parsing, no synthetic freshness, source classifications, HTML sanitation, route normalization, six-hour scheduling, generated outputs, and commit wiring.');
