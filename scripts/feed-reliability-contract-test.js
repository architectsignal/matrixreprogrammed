'use strict';

const fs = require('fs');
const path = require('path');
const { buildState } = require('./build-feed-reliability-report.js');

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'data', 'content-routes.json'), 'utf8'));
const reportPath = path.join(root, 'downloads', 'feed-reliability-contract-test.json');
const failures = [];
const need = (condition, message) => { if (!condition) failures.push(message); };
const feeds = Array.isArray(config.sourceFeeds) ? config.sourceFeeds : [];
const deadUrls = [
  'https://www.cia.gov/readingroom/rss.xml',
  'https://vault.fbi.gov/recently-added/RSS',
  'https://www.justice.gov/news/rss.xml',
  'https://home.treasury.gov/news/press-releases/rss',
  'https://www.europol.europa.eu/media-press/newsroom/rss.xml',
  'https://wikileaks.org/feed.xml'
];

need(feeds.length === 7, `Expected seven maintained public-record feeds; found ${feeds.length}`);
const configuredUrls = feeds.map(feed => String(feed.url || '').trim());
for (const dead of deadUrls) need(!configuredUrls.includes(dead), `Retired failing feed remains configured: ${dead}`);

const replacementHistory = feeds.map(feed => String(feed.replacementFor || '').trim()).filter(Boolean);
need(replacementHistory.length === 6, 'The six retired feed replacements are not explicitly documented');
need(new Set(replacementHistory).size === 6, 'Replacement history contains duplicate retired endpoints');
for (const dead of deadUrls) need(replacementHistory.includes(dead), `Retired endpoint is missing from replacement history: ${dead}`);

const direct = feeds.filter(feed => feed.feedMode === 'direct-official-rss');
const discovery = feeds.filter(feed => feed.feedMode === 'official-domain-discovery');
need(direct.length === 2, `Expected two direct official RSS feeds; found ${direct.length}`);
need(discovery.length === 5, `Expected five official-domain discovery feeds; found ${discovery.length}`);
need(direct.every(feed => feed.sourceTier === 'primary-or-official'), 'Direct official RSS is not classified as primary-or-official');
need(discovery.every(feed => feed.sourceTier === 'discovery'), 'Official-domain discovery is being misrepresented as an official record');
need(discovery.every(feed => /news\.google\.com\/rss\/search/i.test(feed.url)), 'A discovery fallback does not use the bounded RSS discovery endpoint');
need(feeds.every(feed => /^https:\/\//.test(feed.canonicalSource || '')), 'A maintained feed is missing its canonical source page');
need(feeds.every(feed => /^https:\/\//.test(feed.url || '')), 'A maintained feed is missing its HTTPS collection endpoint');
need(feeds.every(feed => !feed.replacementFor || feed.replacementFor !== feed.url), 'A replacement feed still points at the endpoint it claims to supersede');

const fixtureConfig = { sourceFeeds: [
  { name: 'Direct', url: 'https://example.test/direct.xml', canonicalSource: 'https://example.test/', feedMode: 'direct-official-rss', sourceTier: 'primary-or-official' },
  { name: 'Discovery', url: 'https://example.test/discovery.xml', canonicalSource: 'https://agency.example/', feedMode: 'official-domain-discovery', sourceTier: 'discovery' }
] };
const previous = { feeds: [
  { configuredUrl: 'https://example.test/direct.xml', lastSuccessfulAt: '2026-08-01T12:00:00.000Z', consecutiveFailures: 0 },
  { configuredUrl: 'https://example.test/discovery.xml', lastSuccessfulAt: '2026-08-02T12:00:00.000Z', consecutiveFailures: 1 }
] };
const first = buildState(fixtureConfig, {
  collectionCompletedAt: '2026-08-04T12:00:00.000Z',
  feedSuccesses: [{ url: 'https://example.test/direct.xml', itemCount: 4 }],
  feedErrors: [{ url: 'https://example.test/discovery.xml', error: 'HTTP 503' }]
}, previous, '2026-08-04T12:01:00.000Z');
const directFixture = first.feeds.find(feed => feed.name === 'Direct');
const discoveryFixture = first.feeds.find(feed => feed.name === 'Discovery');
need(first.ok === true, 'A valid feed state was rejected');
need(directFixture.status === 'healthy' && directFixture.consecutiveFailures === 0, 'Successful feeds do not reset their failure counter');
need(directFixture.lastSuccessfulAt === '2026-08-04T12:00:00.000Z', 'Successful feeds do not receive the collection completion timestamp');
need(discoveryFixture.status === 'degraded-last-good-preserved', 'Failed feed does not enter the explicit degraded state');
need(discoveryFixture.lastSuccessfulAt === '2026-08-02T12:00:00.000Z', 'Failed feed lost its last-good timestamp');
need(discoveryFixture.consecutiveFailures === 2, 'Failed feed did not increment its consecutive-failure counter');
need(discoveryFixture.lastError === 'HTTP 503', 'Failed feed error was not preserved');

const misclassified = buildState({ sourceFeeds: [{
  name: 'Bad discovery',
  url: 'https://news.google.com/rss/search?q=test',
  canonicalSource: 'https://agency.example/',
  feedMode: 'official-domain-discovery',
  sourceTier: 'primary-or-official'
}] }, { feedSuccesses: [], feedErrors: [] }, { feeds: [] }, '2026-08-04T12:01:00.000Z');
need(misclassified.ok === false && misclassified.misclassifiedDiscovery.length === 1, 'Misclassified discovery feeds do not fail closed');

const output = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  configuredFeeds: feeds.length,
  directOfficialFeeds: direct.length,
  officialDomainDiscoveryFeeds: discovery.length,
  retiredFeedsReplaced: deadUrls.length,
  replacementHistoryPreserved: replacementHistory.length,
  boundary: 'Agency-owned RSS may be classified as primary or official. Google News domain monitoring remains discovery until the reader opens and verifies the underlying agency page. Retired URLs remain only as explicit replacement history, never as active collection endpoints. Failed collection attempts preserve the last-good timestamp and never create synthetic freshness.',
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
if (failures.length) {
  console.error('FEED RELIABILITY CONTRACT TEST FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`FEED RELIABILITY CONTRACT TEST PASSED: six retired endpoints replaced, ${direct.length} direct official feeds, ${discovery.length} honestly labelled discovery fallbacks and last-good preservation verified.`);
