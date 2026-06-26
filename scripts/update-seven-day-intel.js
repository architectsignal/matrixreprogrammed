const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcesPath = path.join(root, 'data', 'live-intel-sources.json');
const livePath = path.join(root, 'data', 'live-intel.json');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function clean(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
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
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? clean(m[1]) : '';
}
function sevenDaysAgo(now) { return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); }
function evidenceBoundaryForLane(lane) {
  if (lane === 'epstein-files') return 'A fresh news or archive item is a lead, not a verdict. Open the source, classify the record, and separate court findings from claims, contact records, settlements, and commentary.';
  if (lane === 'crime-state-overlap') return 'A report, charge, sanction, or investigation is not the same as a conviction. Keep allegation, indictment, conviction, and association separate.';
  if (lane === 'declassified-files') return 'A released file is a source fragment. It needs date, origin, context, and corroboration before it becomes a conclusion.';
  return 'Treat this as a public-record lead. Open the source, preserve the evidence class, and do not share a claim stronger than the record supports.';
}
function routeForLane(lane) {
  if (lane === 'epstein-files') return 'epstein-files.html#epstein-evidence-ladder';
  if (lane === 'declassified-files') return 'evidence-vault.html';
  if (lane === 'control-system') return 'power-atlas.html';
  if (lane === 'war-machine') return 'dashboard-conflict.html';
  if (lane === 'crime-state-overlap') return 'network-maps.html';
  return 'live-intel.html';
}
function itemFromRss(entry, feed, now) {
  const title = tag(entry, 'title');
  const rawLink = tag(entry, 'link') || tag(entry, 'guid');
  const link = rawLink.replace(/&amp;/g, '&');
  const publishedText = tag(entry, 'pubDate') || tag(entry, 'updated') || tag(entry, 'published') || now.toISOString();
  const published = new Date(publishedText);
  const safeDate = Number.isNaN(published.getTime()) ? now : published;
  const summary = tag(entry, 'description') || tag(entry, 'summary') || title;
  const lane = feed.lane || 'general';
  return {
    id: `${lane}-${safeDate.toISOString().slice(0,10)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,70)}`,
    lane,
    laneTitle: feed.label || lane,
    sourceLabel: feed.label || 'RSS source',
    title,
    url: link,
    published: safeDate.toISOString(),
    summary,
    evidenceLevel: lane === 'epstein-files' ? 'Seven-day public-record/news lead' : 'Seven-day public-record lead',
    evidenceBoundary: evidenceBoundaryForLane(lane),
    whyItMatters: 'This item is fresh enough to appear in the seven-day intelligence window and can route readers to source, evidence, free brief, book, video, or offer paths.',
    nextAction: 'Open the source first, then follow the evidence route and only share the claim at the strength the record supports.',
    evidenceRoute: routeForLane(lane),
    videoRoute: 'videos.html',
    bookRoute: lane === 'epstein-files' ? 'book-black-file.html' : 'books.html',
    offerRoute: lane === 'epstein-files' ? 'offer-starter-library.html' : 'offer-center.html',
    optinRoute: lane === 'epstein-files' ? 'optin-black-file-brief.html' : 'optin-center.html',
    storeRoute: 'amazon-store-books.html',
    status: 'rss-seven-day'
  };
}
async function fetchFeed(feed, now) {
  if (!feed.url || typeof fetch !== 'function') return [];
  const res = await fetch(feed.url, { headers: { 'User-Agent': 'MatrixReprogrammedBot/1.0' } });
  if (!res.ok) throw new Error(`${feed.label || feed.lane} RSS returned ${res.status}`);
  const xml = await res.text();
  const entries = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  const altEntries = entries.length ? entries : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]);
  const cutoff = sevenDaysAgo(now);
  return altEntries.map(entry => itemFromRss(entry, feed, now)).filter(item => {
    if (!item.title || !/^https?:\/\//i.test(item.url)) return false;
    const d = new Date(item.published);
    return d >= cutoff && d <= new Date(now.getTime() + 24 * 60 * 60 * 1000);
  });
}
async function main() {
  const now = new Date();
  const sources = readJson(sourcesPath, { rssFeeds: [], lanes: [], rules: [] });
  const existing = readJson(livePath, { updated: now.toISOString(), items: [], rules: [] });
  const fetched = [];
  const errors = [];
  for (const feed of (sources.rssFeeds || [])) {
    try {
      const items = await fetchFeed(feed, now);
      fetched.push(...items);
    } catch (err) {
      errors.push({ feed: feed.label || feed.url, error: err.message });
    }
  }
  const byId = new Map();
  for (const item of [...fetched, ...(existing.items || [])]) {
    if (!item || !item.title) continue;
    const key = item.id || `${item.lane}-${item.title}-${item.published}`;
    if (!byId.has(key)) byId.set(key, item);
  }
  const items = [...byId.values()]
    .sort((a,b) => new Date(b.published || 0) - new Date(a.published || 0))
    .slice(0, 80);
  const updated = {
    ...existing,
    updated: now.toISOString(),
    sourceConfigUpdated: sources.updated || existing.sourceConfigUpdated,
    status: fetched.length ? 'rss-seven-day-updated' : 'seeded-seven-day-window',
    rules: Array.from(new Set([...(existing.rules || []), ...(sources.rules || []), 'Seven-day updater is fail-soft: feed errors preserve existing items rather than breaking deployment.'])),
    lanes: sources.lanes || existing.lanes || [],
    feedResults: fetched.map(item => ({ lane: item.lane, title: item.title, url: item.url, published: item.published })),
    feedErrors: errors,
    items
  };
  writeJson(livePath, updated);
  writeJson(path.join(downloadsDir, 'seven-day-intel.json'), updated);
  console.log(`Seven-day intel updater complete: ${fetched.length} fetched, ${items.length} retained, ${errors.length} feed error(s).`);
}
main().catch(err => {
  console.warn(`Seven-day intel updater failed safely: ${err.message}`);
  const existing = readJson(livePath, { updated: new Date().toISOString(), items: [] });
  writeJson(path.join(downloadsDir, 'seven-day-intel.json'), existing);
});
