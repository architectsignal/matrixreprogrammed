const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcesPath = path.join(root, 'data', 'live-intel-sources.json');
const outPath = path.join(root, 'data', 'live-intel.json');
const ACTIVE_WINDOW_DAYS = 7;
if (!fs.existsSync(sourcesPath)) {
  console.error('Missing data/live-intel-sources.json');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
const lanes = new Map((config.lanes || []).map(lane => [lane.id, lane]));
function decodeEntities(value = '') {
  return String(value || '')
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
function clean(value = '') {
  return decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\btarget\s*=\s*"?_blank"?/gi, ' ')
    .replace(/\bfont\s+color\s*=\s*"?#[a-f0-9]+"?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\/${name}>`, 'i'));
  return match ? clean(match[1]) : '';
}
function compact(value = '', max = 240) {
  const s = clean(value);
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
}
function ageDays(value, now = new Date()) {
  const d = new Date(value || 0);
  if (!Number.isFinite(d.getTime())) return Infinity;
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}
function isFreshItem(item, now = new Date()) {
  const age = ageDays(item.published || item.fetchedAt || item.updated, now);
  return age >= 0 && age <= ACTIVE_WINDOW_DAYS;
}
function hookFor(title, lane) {
  const subject = clean(title).replace(/\s+-\s+[^-]+$/, '');
  return `This update matters only if it is tied to source type, evidence level, and the power structure around it: ${subject}`;
}
function shortTitle(title, lane) {
  const base = clean(title).replace(/\s+-\s+[^-]+$/, '');
  if (/epstein/i.test(lane.id || lane.title || '')) return `Epstein Files Update: ${base}`.slice(0, 92);
  if (/declassified/i.test(lane.id || lane.title || '')) return `New Declassified File Route: ${base}`.slice(0, 92);
  if (/control/i.test(lane.id || lane.title || '')) return `Elite Control Update: ${base}`.slice(0, 92);
  if (/war/i.test(lane.id || lane.title || '')) return `War Machine Update: ${base}`.slice(0, 92);
  if (/crime/i.test(lane.id || lane.title || '')) return `Crime-State Overlap Update: ${base}`.slice(0, 92);
  return `Live Intel Update: ${base}`.slice(0, 92);
}
function longTitle(title, lane) {
  const base = clean(title).replace(/\s+-\s+[^-]+$/, '');
  return `What This Public-Record Update Reveals About ${clean(lane.title || 'the Control System')}: ${base}`.slice(0, 140);
}
function socialThread(title, lane, url) {
  const base = clean(title).replace(/\s+-\s+[^-]+$/, '');
  return [
    `1/ New ${clean(lane.title || 'Live Intel')} update: ${base}`,
    '2/ Treat the source as the starting point, not the conclusion.',
    '3/ Check the evidence route, then follow the video, free brief, and book path for context.',
    `4/ Source: ${clean(url)}`
  ];
}
function routeFor(item, lane, field, fallback) {
  return item[field] || lane[field] || fallback;
}
function enrich(item, lane) {
  return {
    ...item,
    lane: clean(item.lane || lane.id || ''),
    laneTitle: clean(item.laneTitle || lane.title || item.lane || ''),
    sourceLabel: clean(item.sourceLabel || ''),
    title: clean(item.title || ''),
    url: clean(item.url || ''),
    summary: compact(item.summary || item.title || ''),
    evidenceLevel: clean(item.evidenceLevel || 'News/source-watch item'),
    evidenceBoundary: clean(item.evidenceBoundary || 'A news item is a lead, not proof. Verify against source documents, court records, official releases, and archived material before making claims.'),
    whyItMatters: clean(item.whyItMatters || `This belongs in the ${lane.title || item.lane} lane because it may connect to a wider public-record structure worth tracking over time.`),
    nextAction: clean(item.nextAction || 'Open the source, follow the evidence route, turn it into a video hook, then route readers to the free brief, offer, book, or Amazon store.'),
    videoHook: clean(item.videoHook || hookFor(item.title, lane)),
    rumbleShortTitle: clean(item.rumbleShortTitle || shortTitle(item.title, lane)),
    rumbleLongTitle: clean(item.rumbleLongTitle || longTitle(item.title, lane)),
    socialThread: Array.isArray(item.socialThread) ? item.socialThread.map(clean) : socialThread(item.title, lane, item.url),
    evidenceRoute: routeFor(item, lane, 'evidenceRoute', 'evidence-vault.html'),
    videoRoute: routeFor(item, lane, 'videoRoute', 'videos.html'),
    bookRoute: routeFor(item, lane, 'bookRoute', 'books.html'),
    offerRoute: routeFor(item, lane, 'offerRoute', 'offer-center.html'),
    optinRoute: item.optinRoute || lane.optinRoute || 'optin-center.html',
    storeRoute: item.storeRoute || lane.storeRoute || 'amazon-store-books.html'
  };
}
function parseItems(xml, feed, checkedAt) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  const atomBlocks = blocks.length ? blocks : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]);
  return atomBlocks.slice(0, 12).map(block => {
    const title = tag(block, 'title');
    const link = tag(block, 'link') || tag(block, 'guid');
    const pubDate = tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'published') || checkedAt;
    const lane = lanes.get(feed.lane) || {};
    const date = new Date(pubDate);
    return enrich({
      id: `${feed.lane}-${Buffer.from(title || link || Math.random().toString()).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 18).toLowerCase()}`,
      lane: feed.lane,
      laneTitle: lane.title || feed.lane,
      sourceLabel: feed.label,
      title,
      url: link.replace(/&amp;/g, '&'),
      published: Number.isFinite(date.getTime()) ? date.toISOString() : checkedAt,
      fetchedAt: checkedAt,
      summary: compact(tag(block, 'description') || tag(block, 'summary') || lane.description || 'Dated public-source update.'),
      evidenceRoute: lane.evidenceRoute || 'evidence-vault.html',
      videoRoute: lane.videoRoute || 'videos.html',
      bookRoute: lane.bookRoute || 'books.html',
      offerRoute: lane.offerRoute || 'offer-center.html',
      optinRoute: lane.optinRoute || 'optin-center.html',
      storeRoute: lane.storeRoute || 'amazon-store-books.html',
      status: 'fetched'
    }, lane);
  }).filter(item => item.title && /^https?:\/\//i.test(item.url));
}
async function fetchFeed(feed, checkedAt) {
  const result = { feed, status: 'unverified during run', items: [], error: '' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(feed.url, { signal: controller.signal, headers: { 'user-agent': 'MatrixReprogrammedLiveIntel/2.0' } });
    clearTimeout(timer);
    result.statusCode = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    result.items = parseItems(xml, feed, checkedAt);
    result.status = 'fetched';
  } catch (error) {
    result.error = error.message || String(error);
  }
  return result;
}
function stableSignature(output) {
  return JSON.stringify({
    sourceConfigUpdated: output.sourceConfigUpdated,
    activeWindowDays: output.activeWindowDays,
    lanes: (output.lanes || []).map(l => l.id),
    feedResults: (output.feedResults || []).map(r => ({ lane: r.lane, label: r.label, status: r.status, statusCode: r.statusCode || null, error: r.error || '', itemCount: r.itemCount || 0, freshItemCount: r.freshItemCount || 0 })),
    items: (output.items || []).map(item => ({ id: item.id, title: item.title, url: item.url, published: item.published, lane: item.lane }))
  });
}
(async () => {
  const checkedAt = new Date().toISOString();
  const now = new Date(checkedAt);
  const results = [];
  for (const feed of config.rssFeeds || []) results.push(await fetchFeed(feed, checkedAt));
  const seen = new Set();
  const allFetched = results.flatMap(r => r.items || []);
  const items = allFetched.filter(item => {
    const key = `${item.title}|${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return isFreshItem(item, now);
  }).sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 80);
  let previous = null;
  if (fs.existsSync(outPath)) {
    try { previous = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (_) {}
  }
  const previousArchive = previous && Array.isArray(previous.items) ? previous.items.map(item => enrich(item, lanes.get(item.lane) || {})).slice(0, 40) : [];
  const output = {
    updated: checkedAt,
    sourceConfigUpdated: config.updated,
    status: items.length ? 'updated-with-fresh-items' : 'checked-no-fresh-items',
    activeWindowDays: ACTIVE_WINDOW_DAYS,
    stalePolicy: 'Active Live Intel cards only show items published inside the active window. Older items are archived and must not be displayed as current.',
    rules: [...(config.rules || []), 'RSS descriptions are decoded, stripped of HTML, and rendered as plain text only.', 'Active update cards expire after seven days unless refreshed by a new source item.'],
    lanes: config.lanes || [],
    feedResults: results.map(r => ({ lane: r.feed.lane, label: r.feed.label, url: r.feed.url, status: r.status, statusCode: r.statusCode || null, error: r.error || '', itemCount: (r.items || []).length, freshItemCount: (r.items || []).filter(item => isFreshItem(item, now)).length })),
    items,
    archivedPreviousItems: previousArchive,
    staleItemCount: previousArchive.filter(item => !isFreshItem(item, now)).length
  };
  if (previous && stableSignature(previous) === stableSignature(output)) {
    console.log(`Live Intel update checked: no meaningful fresh changes across ${results.length} feeds.`);
    process.exit(0);
  }
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Live Intel update complete: ${output.items.length} fresh items, ${output.archivedPreviousItems.length} archived previous items, ${results.length} feeds checked. HTML stripped.`);
})();
