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
function parseItems(xml, feed) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  return blocks.slice(0, 8).map(block => {
    const title = tag(block, 'title');
    const link = tag(block, 'link');
    const pubDate = tag(block, 'pubDate') || tag(block, 'updated') || new Date().toISOString();
    const lane = lanes.get(feed.lane) || {};
    const date = new Date(pubDate);
    return {
      id: `${feed.lane}-${Buffer.from(title || link || Math.random().toString()).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 18).toLowerCase()}`,
      lane: feed.lane,
      laneTitle: lane.title || feed.lane,
      sourceLabel: feed.label,
      title,
      url: link,
      published: Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(),
      summary: tag(block, 'description') || lane.description || 'Dated public-source update.',
      evidenceRoute: lane.evidenceRoute || 'evidence-vault.html',
      videoRoute: lane.videoRoute || 'videos.html',
      bookRoute: lane.bookRoute || 'books.html',
      offerRoute: lane.offerRoute || 'offer-center.html',
      status: 'fetched'
    };
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
  const output = {
    updated: checkedAt,
    sourceConfigUpdated: config.updated,
    status: items.length ? 'updated' : 'no new items fetched',
    rules: config.rules || [],
    lanes: config.lanes || [],
    feedResults: results.map(r => ({ lane: r.feed.lane, label: r.feed.label, url: r.feed.url, status: r.status, statusCode: r.statusCode || null, error: r.error || '' })),
    items: items.length ? items : (previous && previous.items ? previous.items : [])
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Live Intel update complete: ${output.items.length} items available from ${results.length} feeds.`);
})();
