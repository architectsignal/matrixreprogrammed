const fs = require('fs');
const path = require('path');

const root = process.cwd();
const livePath = path.join(root, 'data', 'live-intel.json');
const sourcesPath = path.join(root, 'data', 'live-intel-sources.json');
const contentRoutesPath = path.join(root, 'data', 'content-routes.json');
const vaultPath = path.join(root, 'data', 'intel-vault.json');
const downloadsDir = path.join(root, 'downloads');
const sevenDayIntelDownloadRoute = 'downloads/seven-day-intel.json';
const sevenDayIntelDownloadPath = path.join(root, sevenDayIntelDownloadRoute);
const vaultDownloadPath = path.join(root, 'downloads', 'intel-vault.json');
const vaultMarkdownPath = path.join(root, 'downloads', 'intel-vault.md');
const recoveryReceiptPath = path.join(root, 'downloads', 'seven-day-intel-recovery.json');
const ACTIVE_WINDOW_DAYS = 7;
const MAX_CURRENT_ITEMS = 120;
const MAX_VAULT_ITEMS = 2000;
const FUTURE_TOLERANCE_MS = 6 * 60 * 60 * 1000;

if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); }
function decodeEntities(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
function clean(value = '', maximum = 5000) {
  return decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}
function tag(xml, name) {
  const match = String(xml || '').match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? clean(match[1]) : '';
}
function linkFromBlock(block) {
  const href = String(block || '').match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return clean(href?.[1] || tag(block, 'link') || tag(block, 'guid'), 1200);
}
function validDate(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}
function stableId(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function normalizedTitle(value = '') {
  return clean(value, 500).toLowerCase().replace(/\s+-\s+[^-]{2,60}$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function itemKey(item = {}) {
  const url = clean(item.url || '', 1200).replace(/[?#](utm_[^#]+|oc=5).*$/i, '');
  return url || `${normalizedTitle(item.title)}|${String(item.published || '').slice(0, 10)}`;
}
function sourceTier(feed = {}, url = '') {
  if (feed.sourceTier) return feed.sourceTier;
  const haystack = `${feed.label || ''} ${feed.name || ''} ${url}`.toLowerCase();
  if (/cia\.gov|fbi\.gov|justice\.gov|treasury\.gov|europol\.europa\.eu|news\.un\.org|official|court|regulator/.test(haystack)) return 'primary-or-official';
  if (/google news/.test(haystack)) return 'discovery';
  return 'reputable-secondary';
}
function laneFromOfficialFeed(feed = {}) {
  const haystack = `${feed.name || ''} ${feed.label || ''} ${feed.url || ''}`.toLowerCase();
  if (/europol|cartel|mafia|crime|justice|court/.test(haystack)) return 'crime-state-overlap';
  if (/un news|war|nato|military|conflict/.test(haystack)) return 'war-machine';
  if (/cia|fbi vault|declass|archive|wikileaks/.test(haystack)) return 'declassified-files';
  if (/treasury|sanction|surveillance|digital id|cbdc/.test(haystack)) return 'control-system';
  return 'control-system';
}
function mergedFeeds(sources, contentRoutes) {
  const configured = Array.isArray(sources.rssFeeds) ? sources.rssFeeds : [];
  const official = (Array.isArray(contentRoutes.sourceFeeds) ? contentRoutes.sourceFeeds : []).map(feed => ({
    lane: laneFromOfficialFeed(feed),
    label: feed.name || feed.label || 'Official public record feed',
    url: feed.url,
    sourceTier: sourceTier(feed, feed.url),
    sourceWeight: Number(feed.weight || 1),
    origin: 'content-routes'
  }));
  const byUrl = new Map();
  for (const feed of [...official, ...configured]) {
    if (!feed?.url) continue;
    const normalized = { ...feed, lane: feed.lane || laneFromOfficialFeed(feed), sourceTier: sourceTier(feed, feed.url), sourceWeight: Number(feed.sourceWeight || feed.weight || 1) };
    if (!byUrl.has(feed.url) || normalized.sourceTier === 'primary-or-official') byUrl.set(feed.url, normalized);
  }
  return [...byUrl.values()];
}
async function fetchText(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'MatrixReprogrammedIntelBot/2.0 (+https://matrixreprogrammed.com/evidence-policy.html)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5',
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (!body.trim()) throw new Error('empty-response');
    return body.slice(0, 2500000);
  } finally {
    clearTimeout(timeout);
  }
}
function parseFeed(xml, feed) {
  const blocks = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi)
    || String(xml || '').match(/<entry\b[\s\S]*?<\/entry>/gi)
    || [];
  const results = [];
  for (const block of blocks.slice(0, 30)) {
    const title = tag(block, 'title');
    const url = linkFromBlock(block);
    const published = validDate(tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date'));
    const summary = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded') || title;
    if (!title || !url || !published) continue;
    results.push({
      lane: feed.lane || 'control-system',
      title,
      url,
      published,
      sourceLabel: feed.label || feed.name || 'Public record feed',
      sourceTier: feed.sourceTier || sourceTier(feed, url),
      sourceWeight: Number(feed.sourceWeight || 1),
      summary,
      status: 'rss-fetched'
    });
  }
  return results;
}
async function fetchFeeds(feeds) {
  const settled = await Promise.all(feeds.map(async feed => {
    try {
      const xml = await fetchText(feed.url);
      const parsed = parseFeed(xml, feed);
      if (!parsed.length) throw new Error('no-current-items-parsed');
      return { ok: true, feed, results: parsed };
    } catch (error) {
      return { ok: false, feed, error: clean(error?.message || error, 300) };
    }
  }));
  return {
    results: settled.flatMap(entry => entry.ok ? entry.results : []),
    successes: settled.filter(entry => entry.ok).map(entry => ({ label: entry.feed.label || entry.feed.url, url: entry.feed.url, itemCount: entry.results.length, sourceTier: entry.feed.sourceTier })),
    errors: settled.filter(entry => !entry.ok).map(entry => ({ label: entry.feed.label || entry.feed.url, url: entry.feed.url, error: entry.error }))
  };
}
function laneFor(id, lanes) {
  return (lanes || []).find(lane => lane.id === id)
    || (lanes || [])[0]
    || { id: 'control-system', title: 'Elite Control Structure', route: 'power-atlas.html', evidenceRoute: 'evidence-vault.html', videoRoute: 'videos.html', offerRoute: 'offer-center.html', bookRoute: 'books.html' };
}
function evidenceBoundaryForLane(lane) {
  if (lane === 'epstein-files') return 'A fresh news or archive item is a lead, not a verdict. Open the source, classify the record, and separate court findings from claims, contact records, settlements, and commentary.';
  if (lane === 'crime-state-overlap') return 'A report, charge, sanction, or investigation is not the same as a conviction. Keep allegation, indictment, conviction, and association separate.';
  if (lane === 'declassified-files') return 'A released file is a source fragment. It needs date, origin, context, and corroboration before it becomes a conclusion.';
  return 'Treat this as a public-record lead. Open the source, preserve the evidence class, and do not share a claim stronger than the record supports.';
}
function bookForLane(lane) {
  if (lane === 'epstein-files') return 'book-black-file.html';
  if (lane === 'declassified-files' || lane === 'war-machine') return 'book-intelligence-dossiers.html';
  if (lane === 'crime-state-overlap') return 'book-crime-dossiers.html';
  return 'books.html';
}
function offerForLane(lane) {
  if (lane === 'epstein-files') return 'offer-starter-library.html';
  if (lane === 'crime-state-overlap') return 'offer-crime-dossiers.html';
  if (lane === 'war-machine' || lane === 'declassified-files') return 'offer-intelligence-dossiers.html';
  return 'offer-center.html';
}
function optinForLane(lane) {
  if (lane === 'epstein-files') return 'optin-black-file-brief.html';
  if (lane === 'declassified-files' || lane === 'war-machine') return 'optin-intelligence-files-brief.html';
  if (lane === 'crime-state-overlap') return 'optin-crime-network-brief.html';
  if (lane === 'control-system') return 'optin-full-archive-map.html';
  return 'optin-center.html';
}
function makeSocialThread(title, lane) {
  return [`1/ Fresh ${lane || 'public-record'} lead: ${title}`, '2/ Do not treat a headline as proof. First classify the source type and evidence level.', '3/ Open the source, then use the evidence route, source card, free brief, and book path.'];
}
function itemFromLead(raw, lanes, index, fetchedAt) {
  const laneId = clean(raw.lane || 'control-system', 100);
  const lane = laneFor(laneId, lanes);
  const title = clean(raw.title || '', 500);
  const published = validDate(raw.published || raw.date || raw.updated || '');
  const sourceLabel = clean(raw.sourceLabel || raw.sourceName || title.split(' - ').pop() || 'Public source', 300);
  const url = clean(raw.url || raw.route || '', 1200);
  if (!title || !published || !url) return null;
  const key = itemKey({ title, published, url });
  return {
    id: clean(raw.id || `${laneId}-${published.slice(0, 10)}-${stableId(key)}`, 180),
    lane: laneId,
    laneTitle: clean(raw.laneTitle || lane.title || laneId, 300),
    sourceLabel,
    sourceTier: clean(raw.sourceTier || sourceTier({ label: sourceLabel }, url), 80),
    sourceWeight: Number(raw.sourceWeight || 1),
    title,
    url,
    published,
    fetchedAt,
    summary: clean(raw.summary || title, 1200),
    evidenceLevel: clean(raw.evidenceLevel || (raw.sourceTier === 'primary-or-official' ? 'Primary or official public-record lead' : 'Seven-day public-record lead'), 180),
    evidenceBoundary: clean(raw.evidenceBoundary || evidenceBoundaryForLane(laneId), 1000),
    whyItMatters: clean(raw.whyItMatters || 'This current source item can be tested against the underlying record and connected to the relevant evidence lane.', 800),
    nextAction: clean(raw.nextAction || 'Open the underlying source, verify its date and source class, then follow the evidence route before drawing a conclusion.', 800),
    videoHook: clean(raw.videoHook || `New public-record signal: ${title}`, 500),
    rumbleShortTitle: clean(raw.rumbleShortTitle || title.slice(0, 72), 100),
    rumbleLongTitle: clean(raw.rumbleLongTitle || `${lane.title || 'Seven-Day Intel'} — ${title}`.slice(0, 140), 160),
    socialThread: Array.isArray(raw.socialThread) && raw.socialThread.length ? raw.socialThread.map(value => clean(value, 500)) : makeSocialThread(title, laneId),
    evidenceRoute: clean(raw.evidenceRoute || lane.evidenceRoute || 'evidence-vault.html', 500),
    videoRoute: clean(raw.videoRoute || lane.videoRoute || 'videos.html', 500),
    bookRoute: clean(raw.bookRoute || lane.bookRoute || bookForLane(laneId), 500),
    offerRoute: clean(raw.offerRoute || lane.offerRoute || offerForLane(laneId), 500),
    optinRoute: clean(raw.optinRoute || optinForLane(laneId), 500),
    storeRoute: clean(raw.storeRoute || 'amazon-store-books.html', 500),
    status: clean(raw.status || 'current-window', 80)
  };
}
function chooseBetter(existing, candidate) {
  if (!existing) return candidate;
  const rank = { 'primary-or-official': 3, 'reputable-secondary': 2, discovery: 1 };
  const candidateRank = rank[candidate.sourceTier] || 0;
  const existingRank = rank[existing.sourceTier] || 0;
  if (candidateRank !== existingRank) return candidateRank > existingRank ? candidate : existing;
  if (Date.parse(candidate.published) !== Date.parse(existing.published)) return Date.parse(candidate.published) > Date.parse(existing.published) ? candidate : existing;
  return candidate.summary.length > existing.summary.length ? candidate : existing;
}
function buildCurrentItems(existing, fetched, lanes, cutoff, nowTime, fetchedAt) {
  const previous = Array.isArray(existing.items) ? existing.items : [];
  const candidates = [...fetched, ...previous].map((raw, index) => itemFromLead(raw, lanes, index, fetchedAt)).filter(Boolean);
  const byUrl = new Map();
  const byTitle = new Map();
  for (const item of candidates) {
    const time = Date.parse(item.published);
    if (!Number.isFinite(time) || time < cutoff || time > nowTime + FUTURE_TOLERANCE_MS) continue;
    const urlKey = itemKey(item);
    const titleKey = `${normalizedTitle(item.title)}|${item.published.slice(0, 10)}`;
    const winner = chooseBetter(byUrl.get(urlKey), item);
    byUrl.set(urlKey, winner);
    byTitle.set(titleKey, chooseBetter(byTitle.get(titleKey), winner));
  }
  const unique = [...new Set([...byTitle.values()])];
  return unique.sort((a, b) => Date.parse(b.published) - Date.parse(a.published) || Number(b.sourceWeight || 0) - Number(a.sourceWeight || 0) || a.title.localeCompare(b.title)).slice(0, MAX_CURRENT_ITEMS);
}
function writeVaultMarkdown(vault) {
  const lines = ['# Intel Vault', '', `Updated: ${vault.updated}`, '', '## Boundary', vault.boundary, '', '## Archived Items', ''];
  for (const item of vault.items || []) {
    lines.push(`### ${item.title}`);
    lines.push(`- Published: ${item.published || 'unknown'}`);
    lines.push(`- Source: ${item.url || 'missing'}`);
    lines.push(`- Source class: ${item.sourceTier || 'unknown'}`);
    lines.push('');
  }
  fs.writeFileSync(vaultMarkdownPath, `${lines.join('\n')}\n`);
}

async function main() {
  const collectionStartedAt = new Date().toISOString();
  const nowTime = Date.now();
  const cutoff = nowTime - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const sources = readJson(sourcesPath, { rssFeeds: [], lanes: [], rules: [] });
  const contentRoutes = readJson(contentRoutesPath, { sourceFeeds: [] });
  const existing = readJson(livePath, { updated: collectionStartedAt, items: [], rules: [], feedResults: [] });
  const feeds = mergedFeeds(sources, contentRoutes);
  const previousKeys = new Set((existing.items || []).map(itemKey));
  const feedFetch = await fetchFeeds(feeds);
  const lanes = sources.lanes || existing.lanes || [];
  const collectionCompletedAt = new Date().toISOString();
  const items = buildCurrentItems(existing, feedFetch.results, lanes, cutoff, nowTime, collectionCompletedAt);
  const newItems = items.filter(item => !previousKeys.has(itemKey(item)));
  const latestPublishedAt = items.length ? items[0].published : null;
  const expiredExisting = (existing.items || []).filter(item => {
    const time = Date.parse(item.published || '');
    return Number.isFinite(time) && time < cutoff;
  });
  const priorVault = readJson(vaultPath, { updated: collectionCompletedAt, title: 'Intel Vault', boundary: 'Vault items are historical public-source leads. Re-check the source before treating them as current.', items: [] });
  const vaultMap = new Map();
  for (const raw of [...expiredExisting, ...(priorVault.items || [])]) {
    const item = itemFromLead(raw, lanes, 0, collectionCompletedAt);
    if (item) vaultMap.set(itemKey(item), item);
  }
  const vaultItems = [...vaultMap.values()].sort((a, b) => Date.parse(b.published) - Date.parse(a.published)).slice(0, MAX_VAULT_ITEMS);
  const status = newItems.length
    ? 'fresh-items-added'
    : feedFetch.successes.length
      ? 'current-window-refreshed-no-new-items'
      : items.length
        ? 'degraded-preserved-current-window'
        : 'no-fresh-source-items';
  const freshnessTruth = newItems.length
    ? `${newItems.length} new source item(s) entered the seven-day window during this collection.`
    : feedFetch.successes.length
      ? 'The collector completed successfully, but no newly published source item entered the current evidence window.'
      : 'Source collection was degraded. Current in-window records were preserved without pretending they were newly published.';
  const updated = {
    ...existing,
    updated: collectionCompletedAt,
    collectionStartedAt,
    collectionCompletedAt,
    sourceCollectionCutoff: new Date(cutoff).toISOString(),
    latestPublishedAt,
    sourceConfigUpdated: sources.updated || existing.sourceConfigUpdated,
    status,
    freshnessTruth,
    activeWindowDays: ACTIVE_WINDOW_DAYS,
    stalePolicy: 'Current cards must have a valid publication date inside the active seven-day window. Expired cards move to the Intel Vault and synthetic current-date fallback stories are forbidden.',
    rules: Array.from(new Set([...(existing.rules || []), ...(sources.rules || []), 'RSS and Atom feeds are both supported.', 'Official and primary-source feeds are collected alongside discovery feeds.', 'Current cards are sorted by actual source publication time, not collection time.', 'A collection timestamp must never be presented as a new evidence date.', 'Synthetic current-date fallback stories are forbidden.', 'Expired daily cards move to data/intel-vault.json and downloads/intel-vault.json.'])),
    lanes,
    feedResults: items.map(item => ({ lane: item.lane, title: item.title, url: item.url, published: item.published, sourceLabel: item.sourceLabel, sourceTier: item.sourceTier, status: item.status })),
    feedSuccesses: feedFetch.successes,
    feedErrors: feedFetch.errors,
    collectionMetrics: {
      configuredFeedCount: feeds.length,
      successfulFeedCount: feedFetch.successes.length,
      failedFeedCount: feedFetch.errors.length,
      fetchedRecordCount: feedFetch.results.length,
      currentItemCount: items.length,
      newItemCount: newItems.length,
      primaryOrOfficialItemCount: items.filter(item => item.sourceTier === 'primary-or-official').length,
      archivedThisRun: expiredExisting.length,
      vaultItemCount: vaultItems.length
    },
    items,
    vaultRoute: 'intel-vault.html',
    vaultJson: 'downloads/intel-vault.json',
    vaultMarkdown: 'downloads/intel-vault.md'
  };
  const vault = { ...priorVault, updated: collectionCompletedAt, items: vaultItems };
  writeJson(livePath, updated);
  writeJson(sevenDayIntelDownloadPath, updated);
  writeJson(vaultPath, vault);
  writeJson(vaultDownloadPath, vault);
  writeVaultMarkdown(vault);
  console.log(`Seven-day intel updater complete: ${items.length} current items, ${newItems.length} new item(s), ${feedFetch.results.length} fetched records, ${feedFetch.successes.length}/${feeds.length} feeds successful, ${feedFetch.errors.length} feed error(s).`);
  if (!feedFetch.successes.length && !items.length) process.exitCode = 2;
}

main().catch(error => {
  const recoveredAt = new Date().toISOString();
  const errorMessage = clean(error?.stack || error, 2000);
  let preservedItems = 0;
  let recoveryWriteOk = false;
  try {
    const existing = readJson(livePath, { items: [] });
    const vault = readJson(vaultPath, { updated: recoveredAt, title: 'Intel Vault', boundary: 'Vault items are historical public-source leads. Re-check the source before treating them as current.', items: [] });
    preservedItems = Array.isArray(existing.items) ? existing.items.length : 0;
    const recovered = {
      ...existing,
      updated: recoveredAt,
      collectionCompletedAt: recoveredAt,
      status: preservedItems ? 'collector-failed-safely-preserved-current-window' : 'collector-failed-safely-no-current-items',
      freshnessTruth: preservedItems
        ? 'The collection attempt failed safely. Existing dated records were preserved and were not relabelled as new.'
        : 'The collection attempt failed safely and no dated current records were available to preserve.',
      lastCollectionError: errorMessage,
      feedErrors: [...(Array.isArray(existing.feedErrors) ? existing.feedErrors : []), { label: 'collector-runtime', url: '', error: errorMessage, failedAt: recoveredAt }].slice(-100)
    };
    writeJson(livePath, recovered);
    writeJson(sevenDayIntelDownloadPath, recovered);
    writeJson(vaultPath, vault);
    writeJson(vaultDownloadPath, vault);
    writeVaultMarkdown(vault);
    writeJson(recoveryReceiptPath, { ok: true, failedSafely: true, recoveredAt, preservedItems, error: errorMessage, note: 'Existing source dates were preserved. The freshness hard gate remains responsible for blocking genuinely stale output.' });
    recoveryWriteOk = true;
  } catch (recoveryError) {
    try { writeJson(recoveryReceiptPath, { ok: false, failedSafely: false, recoveredAt, preservedItems, originalError: errorMessage, recoveryError: clean(recoveryError?.stack || recoveryError, 2000) }); } catch {}
  }
  console.error(`Seven-day intel updater failed safely: ${errorMessage}. Preserved ${preservedItems} existing item(s); recovery write ${recoveryWriteOk ? 'completed' : 'failed'}.`);
  process.exitCode = recoveryWriteOk ? 0 : 1;
});
