'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const contentRoutesPath = path.join(root, 'data', 'content-routes.json');
const liveIntelPath = path.join(root, 'data', 'live-intel.json');
const statePath = path.join(root, 'data', 'feed-reliability-state.json');
const reportPath = path.join(root, 'downloads', 'feed-reliability-report.json');
const markdownPath = path.join(root, 'downloads', 'feed-reliability-report.md');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function normalizedUrl(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function buildState(config, live, previous, checkedAt = new Date().toISOString()) {
  const feeds = Array.isArray(config?.sourceFeeds) ? config.sourceFeeds : [];
  const successes = new Map((Array.isArray(live?.feedSuccesses) ? live.feedSuccesses : []).map(item => [normalizedUrl(item.url), item]));
  const errors = new Map((Array.isArray(live?.feedErrors) ? live.feedErrors : []).map(item => [normalizedUrl(item.url), item]));
  const priorFeeds = new Map((Array.isArray(previous?.feeds) ? previous.feeds : []).map(item => [normalizedUrl(item.configuredUrl), item]));
  const collectionAt = String(live?.collectionCompletedAt || live?.lastCheckedAt || checkedAt);

  const results = feeds.map(feed => {
    const url = normalizedUrl(feed.url);
    const prior = priorFeeds.get(url) || {};
    const success = successes.get(url);
    const error = errors.get(url);
    const observed = Boolean(success || error);
    const succeeded = Boolean(success);
    const consecutiveFailures = succeeded ? 0 : observed ? Number(prior.consecutiveFailures || 0) + 1 : Number(prior.consecutiveFailures || 0);
    const lastSuccessfulAt = succeeded ? collectionAt : prior.lastSuccessfulAt || null;
    const status = succeeded
      ? 'healthy'
      : error
        ? lastSuccessfulAt ? 'degraded-last-good-preserved' : 'failed-no-last-good'
        : 'not-observed-this-run';
    return {
      name: String(feed.name || feed.label || url),
      label: String(feed.label || ''),
      configuredUrl: url,
      canonicalSource: String(feed.canonicalSource || ''),
      feedMode: String(feed.feedMode || 'unspecified'),
      sourceTier: String(feed.sourceTier || ''),
      replacementFor: String(feed.replacementFor || ''),
      status,
      observedThisRun: observed,
      succeededThisRun: succeeded,
      itemCount: Number(success?.itemCount || 0),
      lastCheckedAt: observed ? collectionAt : prior.lastCheckedAt || null,
      lastSuccessfulAt,
      consecutiveFailures,
      lastError: error ? String(error.error || 'unknown feed error') : null
    };
  });

  const misclassifiedDiscovery = results.filter(item => item.feedMode === 'official-domain-discovery' && item.sourceTier !== 'discovery');
  const incompleteConfiguration = results.filter(item => !item.configuredUrl || !item.canonicalSource || !item.feedMode || !item.sourceTier);
  const currentSuccesses = results.filter(item => item.succeededThisRun).length;
  const observedFailures = results.filter(item => item.observedThisRun && !item.succeededThisRun).length;
  const directOfficial = results.filter(item => item.feedMode === 'direct-official-rss');
  const discovery = results.filter(item => item.feedMode === 'official-domain-discovery');

  return {
    ok: feeds.length > 0 && incompleteConfiguration.length === 0 && misclassifiedDiscovery.length === 0,
    generatedAt: checkedAt,
    collectionAt,
    configuredFeedCount: results.length,
    currentSuccessfulFeedCount: currentSuccesses,
    currentFailedFeedCount: observedFailures,
    currentUnobservedFeedCount: results.filter(item => !item.observedThisRun).length,
    directOfficialFeedCount: directOfficial.length,
    officialDomainDiscoveryFeedCount: discovery.length,
    directOfficialSuccessCount: directOfficial.filter(item => item.succeededThisRun).length,
    discoverySuccessCount: discovery.filter(item => item.succeededThisRun).length,
    misclassifiedDiscovery,
    incompleteConfiguration,
    feeds: results,
    boundary: 'Direct agency RSS is classified as primary or official. Google News official-domain monitoring is explicitly classified as discovery and must be opened at the underlying agency source before supporting a conclusion. Failed feeds preserve the last successful timestamp without pretending a collection check is a publication date.'
  };
}

function renderMarkdown(state) {
  const lines = [
    '# Live Intelligence Feed Reliability',
    '',
    `Generated: ${state.generatedAt}`,
    `Collection: ${state.collectionAt}`,
    '',
    '## Summary',
    '',
    `- Configured feeds: ${state.configuredFeedCount}`,
    `- Successful this run: ${state.currentSuccessfulFeedCount}`,
    `- Failed this run: ${state.currentFailedFeedCount}`,
    `- Not observed this run: ${state.currentUnobservedFeedCount}`,
    `- Direct official RSS: ${state.directOfficialSuccessCount}/${state.directOfficialFeedCount}`,
    `- Official-domain discovery: ${state.discoverySuccessCount}/${state.officialDomainDiscoveryFeedCount}`,
    '',
    '## Evidence boundary',
    '',
    state.boundary,
    '',
    '## Feeds',
    ''
  ];
  for (const feed of state.feeds) {
    lines.push(`### ${feed.name}`);
    lines.push(`- Status: ${feed.status}`);
    lines.push(`- Mode: ${feed.feedMode}`);
    lines.push(`- Evidence class: ${feed.sourceTier}`);
    lines.push(`- Canonical source: ${feed.canonicalSource}`);
    lines.push(`- Items this run: ${feed.itemCount}`);
    lines.push(`- Last successful collection: ${feed.lastSuccessfulAt || 'not yet recorded'}`);
    lines.push(`- Consecutive failures: ${feed.consecutiveFailures}`);
    if (feed.lastError) lines.push(`- Last error: ${feed.lastError}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const config = readJson(contentRoutesPath, { sourceFeeds: [] });
  const live = readJson(liveIntelPath, { feedSuccesses: [], feedErrors: [] });
  const previous = readJson(statePath, { feeds: [] });
  const state = buildState(config, live, previous);
  writeJson(statePath, state);
  writeJson(reportPath, state);
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, renderMarkdown(state));
  if (!state.ok) {
    console.error('FEED RELIABILITY REPORT FAILED');
    for (const item of [...state.incompleteConfiguration, ...state.misclassifiedDiscovery]) console.error(`- ${JSON.stringify(item)}`);
    process.exit(1);
  }
  console.log(`Feed reliability report built: ${state.currentSuccessfulFeedCount}/${state.configuredFeedCount} configured feeds succeeded in the latest collection; last-good timestamps preserved.`);
}

if (require.main === module) main();
module.exports = { buildState, renderMarkdown };
