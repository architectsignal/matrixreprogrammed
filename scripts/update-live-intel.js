const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcesPath = path.join(root, 'data', 'live-intel-sources.json');
const outPath = path.join(root, 'data', 'live-intel.json');
if (!fs.existsSync(sourcesPath)) {
  console.error('Missing data/live-intel-sources.json');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
const lanes = new Map((config.lanes || []).map(lane => [lane.id, lane]));
function clean(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? clean(match[1]) : '';
}
function compact(value = '', max = 210) {
  const s = clean(value);
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
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
  return `What This Public-Record Update Reveals About ${lane.title || 'the Control System'}: ${base}`.slice(0, 140);
}
function socialThread(title, lane, url) {
  const base = clean(title).replace(/\s+-\s+[^-]+$/, '');
  return [
    `1/ New ${lane.title || 'Live Intel'} update: ${base}`,
    '2/ Treat the source as the starting point, not the conclusion.',
    '3/ Check the evidence route, then follow the video, free brief, and book path for context.',
    `4/ Source: ${url}`
  ];
}
function enrich(item, lane) {
  return {
    ...item,
    evidenceLevel: item.evidenceLevel || 'News/source-watch item',
    evidenceBoundary: item.evidenceBoundary || 'A news item is a lead, not proof. Verify against source documents, court records, official releases, and archived material before making claims.',
    whyItMatters: item.whyItMatters || `This belongs in the ${lane.title || item.lane} lane because it may connect to a wider public-record structure worth tracking over time.`,
    nextAction: item.nextAction || 'Open the source, follow the evidence route, turn it into a video hook, then route readers to the free brief, offer, book, or Amazon store.',
    videoHook: item.videoHook || hookFor(item.title, lane),
    rumbleShortTitle: item.rumbleShortTitle || shortTitle(item.title, lane),
    rumbleLongTitle: item.rumbleLongTitle || longTitle(item.title, lane),
    socialThread: item.socialThread || socialThread(item.title, lane, item.url),
    optinRoute: item.optinRoute || 'optin-center.html',
    storeRoute: item.storeRoute || 'amazon-store-books.html'
  };
}
function parseItems(xml, feed) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  return blocks.slice(0, 8).map(block => {
    const title = tag(block, 'title');
    const link = tag(block, 'link');
    const pubDate = tag(block, 'pubDate') || tag(block, 'updated') || new Date().toISOString();
    const lane = lanes.get(feed.lane) || {};
    const date = new Date(pubDate);
    return enrich({
      id: `${feed.lane}-${Buffer.from(title || link || Math.random().toString()).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 18).toLowerCase()}`,
      lane: feed.lane,
      laneTitle: lane.title || feed.lane,
      sourceLabel: feed.label,
      title,
      url: link,
      published: Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(),
      summary: compact(tag(block, 'description') || lane.description || 'Dated public-source update.'),
      evidenceRoute: lane.evidenceRoute || 'evidence-vault.html',
      videoRoute: lane.videoRoute || 'videos.html',
      bookRoute: lane.bookRoute || 'books.html',
      offerRoute: lane.offerRoute || 'offer-center.html',
      status: 'fetched'
    }, lane);
  }).filter(item => item.title && item.url);
}
async function fetchFeed(feed) {
  const result = { feed, status: 'unverified during run', items: [], error: '' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(feed.url, { signal: controller.signal, headers: { 'user-agent': 'MatrixReprogrammedLiveIntel/1.0' } });
    clearTimeout(timer);
    result.statusCode = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    result.items = parseItems(xml, feed);
    result.status = 'fetched';
  } catch (error) {
    result.error = error.message || String(error);
  }
  return result;
}
(async () => {
  const checkedAt = new Date().toISOString();
  const results = [];
  for (const feed of config.rssFeeds || []) results.push(await fetchFeed(feed));
  const seen = new Set();
  const items = results.flatMap(r => r.items).filter(item => {
    const key = `${item.title}|${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 60);
  let previous = null;
  if (fs.existsSync(outPath)) {
    try { previous = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (_) {}
  }
  const previousItems = previous && Array.isArray(previous.items) ? previous.items.map(item => enrich(item, lanes.get(item.lane) || {})) : [];
  const output = {
    updated: checkedAt,
    sourceConfigUpdated: config.updated,
    status: items.length ? 'updated' : 'no new items fetched',
    rules: config.rules || [],
    lanes: config.lanes || [],
    feedResults: results.map(r => ({ lane: r.feed.lane, label: r.feed.label, url: r.feed.url, status: r.status, statusCode: r.statusCode || null, error: r.error || '' })),
    items: items.length ? items : previousItems
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Live Intel update complete: ${output.items.length} items available from ${results.length} feeds.`);
})();
