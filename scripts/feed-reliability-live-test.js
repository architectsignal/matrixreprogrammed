'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const statePath = path.join(root, 'data', 'feed-reliability-state.json');
const livePath = path.join(root, 'data', 'live-intel.json');
const reportPath = path.join(root, 'downloads', 'feed-reliability-live-test.json');
const failures = [];
const need = (condition, message) => { if (!condition) failures.push(message); };
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));
const retired = [
  'www.cia.gov/readingroom/rss.xml',
  'vault.fbi.gov/recently-added/RSS',
  'www.justice.gov/news/rss.xml',
  'home.treasury.gov/news/press-releases/rss',
  'europol.europa.eu/media-press/newsroom/rss.xml',
  'wikileaks.org/feed.xml'
];

need(state.ok === true, 'Feed reliability state is not structurally healthy');
need(state.configuredFeedCount === 7, `Expected seven monitored feeds; found ${state.configuredFeedCount}`);
need(state.currentSuccessfulFeedCount >= 6, `Only ${state.currentSuccessfulFeedCount}/7 replacement feeds succeeded; require at least 6`);
need(state.directOfficialSuccessCount === state.directOfficialFeedCount, `Direct official RSS failed: ${state.directOfficialSuccessCount}/${state.directOfficialFeedCount}`);
need(state.currentUnobservedFeedCount === 0, `${state.currentUnobservedFeedCount} configured feed(s) were not observed in the collection result`);
need(state.misclassifiedDiscovery.length === 0, 'A discovery fallback was misclassified as an official record');
need(state.incompleteConfiguration.length === 0, 'A maintained feed lacks canonical source or evidence-class metadata');
need((state.feeds || []).every(feed => feed.status === 'healthy' || Boolean(feed.lastSuccessfulAt)), 'A failed feed has no last-good timestamp to preserve');

const serializedLiveErrors = JSON.stringify(live.feedErrors || []);
for (const endpoint of retired) need(!serializedLiveErrors.includes(endpoint), `The collector still attempted retired endpoint ${endpoint}`);
need(Array.isArray(live.items) && live.items.length > 0, 'The live intelligence window is empty');
need(Number(live.collectionMetrics?.successfulFeedCount || 0) >= 10, `Combined collector reached only ${live.collectionMetrics?.successfulFeedCount || 0}/${live.collectionMetrics?.configuredFeedCount || 0} feeds; require at least 10`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  configuredFeeds: state.configuredFeedCount,
  successfulReplacementFeeds: state.currentSuccessfulFeedCount,
  directOfficialSuccess: `${state.directOfficialSuccessCount}/${state.directOfficialFeedCount}`,
  combinedCollectorSuccess: `${live.collectionMetrics?.successfulFeedCount || 0}/${live.collectionMetrics?.configuredFeedCount || 0}`,
  currentItems: Array.isArray(live.items) ? live.items.length : 0,
  failedFeeds: (state.feeds || []).filter(feed => !feed.succeededThisRun).map(feed => ({ name: feed.name, status: feed.status, lastSuccessfulAt: feed.lastSuccessfulAt, lastError: feed.lastError })),
  boundary: state.boundary,
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('FEED RELIABILITY LIVE TEST FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`FEED RELIABILITY LIVE TEST PASSED: ${state.currentSuccessfulFeedCount}/7 replacement feeds and ${report.combinedCollectorSuccess} combined feeds succeeded without retired endpoint use.`);
