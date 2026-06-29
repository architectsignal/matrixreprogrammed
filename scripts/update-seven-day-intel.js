const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcesPath = path.join(root, 'data', 'live-intel-sources.json');
const livePath = path.join(root, 'data', 'live-intel.json');
const vaultPath = path.join(root, 'data', 'intel-vault.json');
const downloadsDir = path.join(root, 'downloads');
const sevenDayIntelDownloadRoute = 'downloads/seven-day-intel.json';
const sevenDayIntelDownloadPath = path.join(root, sevenDayIntelDownloadRoute);
const vaultDownloadPath = path.join(root, 'downloads', 'intel-vault.json');
const vaultMarkdownPath = path.join(root, 'downloads', 'intel-vault.md');
const ACTIVE_WINDOW_DAYS = 7;
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
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
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\/${name}>`, 'i'));
  return m ? clean(m[1]) : '';
}
function cutoffDate(now) { return new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000); }
function isFresh(item, now = new Date()) {
  const d = new Date(item.published || item.fetchedAt || item.updated || 0);
  return Number.isFinite(d.getTime()) && d >= cutoffDate(now) && d <= new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
function archiveReason(item, now = new Date()) {
  const d = new Date(item.published || item.fetchedAt || item.updated || 0);
  if (!Number.isFinite(d.getTime())) return 'missing-or-invalid-date';
  const ageDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  return ageDays > ACTIVE_WINDOW_DAYS ? `expired-after-${ACTIVE_WINDOW_DAYS}-day-window` : 'not-current-feed-item';
}
function evidenceBoundaryForLane(lane) {
  if (lane === 'epstein-files') return 'A fresh news or archive item is a lead, not a verdict. Open the source, classify the record, and separate court findings from claims, contact records, settlements, and commentary.';
  if (lane === 'crime-state-overlap') return 'A report, charge, sanction, or investigation is not the same as a conviction. Keep allegation, indictment, conviction, and association separate.';
  if (lane === 'declassified-files') return 'A released file is a source fragment. It needs date, origin, context, and corroboration before it becomes a conclusion.';
  return 'Treat this as a public-record lead. Open the source, preserve the evidence class, and do not share a claim stronger than the record supports.';
}
function routeForLane(lane) {
  if (lane === 'epstein-files') return 'epstein-files.html#epstein-evidence-ladder';
  if (lane === 'declassified-files') return 'evidence-vault.html';
  if (lane === 'control-system') return 'control-system-tracker.html';
  if (lane === 'war-machine') return 'dashboard-conflict.html';
  if (lane === 'crime-state-overlap') return 'network-maps.html';
  return 'live-intel.html';
}
function bookForLane(lane) {
  if (lane === 'epstein-files') return 'book-black-file.html';
  if (lane === 'declassified-files') return 'book-intelligence-dossiers.html';
  if (lane === 'crime-state-overlap') return 'book-crime-dossiers.html';
  if (lane === 'war-machine') return 'book-intelligence-dossiers.html';
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
function makeVideoHook(title, lane) {
  if (lane === 'epstein-files') return `New Epstein file lane: ${title}. The record matters, but the evidence class matters more.`;
  if (lane === 'declassified-files') return `New archive lane: ${title}. A released file is the start of the investigation, not the final verdict.`;
  if (lane === 'crime-state-overlap') return `New crime-network lane: ${title}. Separate indictment, conviction, sanction, reporting, and association.`;
  return `New seven-day intelligence lane: ${title}. Open the source first, then follow the evidence route.`;
}
function makeSocialThread(title, lane) {
  return [
    `1/ Fresh ${lane || 'public-record'} lead: ${title}`,
    '2/ Do not treat a headline as proof. First classify the source type and evidence level.',
    '3/ Open the source, then use the evidence route, source card, free brief, and book path.'
  ];
}
function sanitizeItem(item = {}) {
  return {
    ...item,
    title: clean(item.title || ''),
    summary: clean(item.summary || item.title || ''),
    sourceLabel: clean(item.sourceLabel || ''),
    laneTitle: clean(item.laneTitle || item.lane || ''),
    evidenceBoundary: clean(item.evidenceBoundary || ''),
    whyItMatters: clean(item.whyItMatters || ''),
    nextAction: clean(item.nextAction || ''),
    videoHook: clean(item.videoHook || ''),
    rumbleShortTitle: clean(item.rumbleShortTitle || item.title || ''),
    rumbleLongTitle: clean(item.rumbleLongTitle || item.title || ''),
    socialThread: Array.isArray(item.socialThread) ? item.socialThread.map(line => clean(line)) : []
  };
}
function itemFromRss(entry, feed, now) {
  const title = tag(entry, 'title');
  const rawLink = tag(entry, 'link') || tag(entry, 'guid');
  const link = rawLink.replace(/&amp;/g, '&');
  const publishedText = tag(entry, 'pubDate') || tag(entry, 'updated') || tag(entry, 'published') || now.toISOString();
  const published = new Date(publishedText);
  const safeDate = Number.isFinite(published.getTime()) ? published : now;
  const summary = tag(entry, 'description') || tag(entry, 'summary') || title;
  const lane = feed.lane || 'general';
  const evidenceRoute = routeForLane(lane);
  const bookRoute = bookForLane(lane);
  const offerRoute = offerForLane(lane);
  const optinRoute = optinForLane(lane);
  return {
    id: `${lane}-${safeDate.toISOString().slice(0,10)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,70)}`,
    lane,
    laneTitle: feed.label || lane,
    sourceLabel: feed.label || 'RSS source',
    title,
    url: link,
    published: safeDate.toISOString(),
    fetchedAt: now.toISOString(),
    summary,
    evidenceLevel: lane === 'epstein-files' ? 'Seven-day public-record/news lead' : 'Seven-day public-record lead',
    evidenceBoundary: evidenceBoundaryForLane(lane),
    whyItMatters: 'This item is fresh enough to appear in the seven-day intelligence window and can route readers to source, evidence, free brief, book, video, or offer paths.',
    nextAction: 'Open the source first, then follow the evidence route and only share the claim at the strength the record supports.',
    videoHook: makeVideoHook(title, lane),
    rumbleShortTitle: title.slice(0, 72),
    rumbleLongTitle: `${feed.label || 'Seven-Day Intel'} — ${title}`.slice(0, 140),
    socialThread: makeSocialThread(title, lane),
    evidenceRoute,
    videoRoute: 'videos.html',
    bookRoute,
    offerRoute,
    optinRoute,
    storeRoute: 'amazon-store-books.html',
    status: 'rss-seven-day'
  };
}
async function fetchFeed(feed, now) {
  if (!feed.url || typeof fetch !== 'function') return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': 'MatrixReprogrammedBot/2.0' }, signal: controller.signal });
    if (!res.ok) throw new Error(`${feed.label || feed.lane} RSS returned ${res.status}`);
    const xml = await res.text();
    const entries = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
    const altEntries = entries.length ? entries : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]);
    return altEntries.map(entry => itemFromRss(entry, feed, now)).filter(item => item.title && /^https?:\/\//i.test(item.url));
  } finally {
    clearTimeout(timer);
  }
}
function mergeVault(existingVault, expiredItems, now) {
  const byKey = new Map();
  for (const item of [...(existingVault.items || []), ...expiredItems]) {
    if (!item || !item.title) continue;
    const archived = sanitizeItem({
      ...item,
      archivedAt: item.archivedAt || now.toISOString(),
      archiveReason: item.archiveReason || archiveReason(item, now),
      status: 'archived-intel-vault'
    });
    const key = archived.id || `${archived.lane}-${archived.title}-${archived.published || archived.archivedAt}`;
    byKey.set(key, archived);
  }
  const items = [...byKey.values()].sort((a,b) => new Date(b.published || b.archivedAt || 0) - new Date(a.published || a.archivedAt || 0)).slice(0, 500);
  return {
    updated: now.toISOString(),
    title: 'Intel Vault',
    purpose: 'Archived daily-update cards that expired out of the active seven-day window. These remain searchable as historical source leads but must not appear as current updates.',
    activeWindowDays: ACTIVE_WINDOW_DAYS,
    boundary: 'Vault items are historical public-source leads. Re-check the source before treating them as current or before upgrading any claim.',
    items
  };
}
function writeVaultMarkdown(vault) {
  const lines = [
    '# Intel Vault',
    '',
    `Updated: ${vault.updated}`,
    '',
    '## Boundary',
    vault.boundary,
    '',
    '## Archived Items',
    ''
  ];
  for (const item of vault.items || []) {
    lines.push(`### ${item.title}`);
    lines.push(`- Published: ${item.published || 'unknown'}`);
    lines.push(`- Archived: ${item.archivedAt || vault.updated}`);
    lines.push(`- Lane: ${item.laneTitle || item.lane || 'unknown'}`);
    lines.push(`- Source: ${item.url || 'missing'}`);
    lines.push(`- Reason: ${item.archiveReason || 'expired'}`);
    lines.push('');
    lines.push(item.summary || 'No summary available.');
    lines.push('');
  }
  fs.writeFileSync(vaultMarkdownPath, lines.join('\n'));
}
async function main() {
  const now = new Date();
  const sources = readJson(sourcesPath, { rssFeeds: [], lanes: [], rules: [] });
  const existing = readJson(livePath, { updated: now.toISOString(), items: [], rules: [] });
  const existingVault = readJson(vaultPath, { items: [] });
  const fetchedAll = [];
  const errors = [];
  for (const feed of (sources.rssFeeds || [])) {
    try {
      const items = await fetchFeed(feed, now);
      fetchedAll.push(...items);
    } catch (err) {
      errors.push({ feed: feed.label || feed.url, error: err.message });
    }
  }
  const freshFetched = fetchedAll.filter(item => isFresh(item, now));
  const expiredFetched = fetchedAll.filter(item => !isFresh(item, now));
  const expiredPrevious = (existing.items || []).filter(item => !isFresh(item, now));
  const byId = new Map();
  for (const item of freshFetched) {
    const key = item.id || `${item.lane}-${item.title}-${item.published}`;
    if (!byId.has(key)) byId.set(key, sanitizeItem(item));
  }
  const items = [...byId.values()]
    .sort((a,b) => new Date(b.published || 0) - new Date(a.published || 0))
    .slice(0, 80);
  const expiredForVault = [...expiredPrevious, ...expiredFetched];
  const vault = mergeVault(existingVault, expiredForVault, now);
  const updated = {
    ...existing,
    updated: now.toISOString(),
    sourceConfigUpdated: sources.updated || existing.sourceConfigUpdated,
    status: items.length ? 'rss-seven-day-updated' : 'checked-no-fresh-seven-day-items',
    activeWindowDays: ACTIVE_WINDOW_DAYS,
    stalePolicy: 'Seven-day intel cards expire after seven days. Expired cards move to the Intel Vault and must not be displayed as current updates.',
    rules: Array.from(new Set([...(existing.rules || []), ...(sources.rules || []), 'Seven-day updater is fail-soft: feed errors preserve the page but do not display expired items as current.', 'RSS descriptions are decoded, stripped of HTML, and rendered as plain text only.', 'Active cards must be published inside the current seven-day window.', 'Expired daily cards move to data/intel-vault.json and downloads/intel-vault.json.'])),
    lanes: sources.lanes || existing.lanes || [],
    feedResults: freshFetched.map(item => ({ lane: item.lane, title: item.title, url: item.url, published: item.published })),
    feedErrors: errors,
    items,
    vaultRoute: 'intel-vault.html',
    vaultJson: 'downloads/intel-vault.json',
    vaultMarkdown: 'downloads/intel-vault.md',
    archivedThisRun: expiredForVault.length,
    vaultItemCount: vault.items.length
  };
  writeJson(livePath, updated);
  writeJson(sevenDayIntelDownloadPath, updated);
  writeJson(vaultPath, vault);
  writeJson(vaultDownloadPath, vault);
  writeVaultMarkdown(vault);
  console.log(`Seven-day intel updater complete: ${freshFetched.length} fresh fetched, ${items.length} active, ${expiredForVault.length} moved/kept in vault, ${errors.length} feed error(s). Exports: ${sevenDayIntelDownloadRoute}, downloads/intel-vault.json`);
}
main().catch(err => {
  console.warn(`Seven-day intel updater failed safely: ${err.message}`);
  const existing = readJson(livePath, { updated: new Date().toISOString(), items: [] });
  writeJson(sevenDayIntelDownloadPath, existing);
});
