const fs = require('fs');
const path = require('path');
const https = require('https');
const root = process.cwd();
const livePath = path.join(root, 'data', 'live-intel.json');
const sourcesPath = path.join(root, 'data', 'live-intel-sources.json');
const vaultPath = path.join(root, 'data', 'intel-vault.json');
const downloadsDir = path.join(root, 'downloads');
const sevenDayIntelDownloadRoute = 'downloads/seven-day-intel.json';
const sevenDayIntelDownloadPath = path.join(root, sevenDayIntelDownloadRoute);
const vaultDownloadPath = path.join(root, 'downloads', 'intel-vault.json');
const vaultMarkdownPath = path.join(root, 'downloads', 'intel-vault.md');
const ACTIVE_WINDOW_DAYS = 7;
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function decodeEntities(value = '') { return String(value).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&nbsp;/gi, ' ').replace(/&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function clean(value = '') { return decodeEntities(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function tag(xml, name) { const m = String(xml || '').match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')); return m ? clean(m[1]) : ''; }
function fetchText(url, timeoutMs = 12000) {
  return new Promise(resolve => {
    try {
      const req = https.get(url, { headers: { 'User-Agent': 'MatrixReprogrammedIntelBot/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(fetchText(new URL(res.headers.location, url).toString(), timeoutMs));
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; if (body.length > 1000000) req.destroy(); });
        res.on('end', () => resolve(body));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(''); });
      req.on('error', () => resolve(''));
    } catch { resolve(''); }
  });
}
function parseRss(xml, feed) {
  const out = [];
  const items = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const item of items.slice(0, 12)) {
    const title = tag(item, 'title');
    const url = tag(item, 'link') || tag(item, 'guid');
    const published = tag(item, 'pubDate') || tag(item, 'updated') || new Date().toISOString();
    const summary = tag(item, 'description') || title;
    if (!title || !url) continue;
    out.push({ lane: feed.lane || 'control-system', title, url, published: new Date(published).toString() === 'Invalid Date' ? published : new Date(published).toISOString(), sourceLabel: feed.label || 'RSS feed', summary, status: 'rss-fetched' });
  }
  return out;
}
async function fetchFeeds(sources) {
  const feeds = Array.isArray(sources.rssFeeds) ? sources.rssFeeds : [];
  const results = [];
  const errors = [];
  for (const feed of feeds) {
    if (!feed || !feed.url) continue;
    const xml = await fetchText(feed.url);
    if (!xml) { errors.push({ label: feed.label || feed.url, url: feed.url, error: 'empty-or-fetch-failed' }); continue; }
    const parsed = parseRss(xml, feed);
    if (!parsed.length) errors.push({ label: feed.label || feed.url, url: feed.url, error: 'no-rss-items-parsed' });
    results.push(...parsed);
  }
  return { results, errors };
}
function laneFor(id, lanes) { return (lanes || []).find(l => l.id === id) || (lanes || [])[0] || { id: 'control-system', title: 'Elite Control Structure', route: 'power-atlas.html', evidenceRoute: 'evidence-vault.html', videoRoute: 'videos.html', offerRoute: 'offer-center.html', bookRoute: 'books.html' }; }
function evidenceBoundaryForLane(lane) { if (lane === 'epstein-files') return 'A fresh news or archive item is a lead, not a verdict. Open the source, classify the record, and separate court findings from claims, contact records, settlements, and commentary.'; if (lane === 'crime-state-overlap') return 'A report, charge, sanction, or investigation is not the same as a conviction. Keep allegation, indictment, conviction, and association separate.'; if (lane === 'declassified-files') return 'A released file is a source fragment. It needs date, origin, context, and corroboration before it becomes a conclusion.'; return 'Treat this as a public-record lead. Open the source, preserve the evidence class, and do not share a claim stronger than the record supports.'; }
function bookForLane(lane) { if (lane === 'epstein-files') return 'book-black-file.html'; if (lane === 'declassified-files' || lane === 'war-machine') return 'book-intelligence-dossiers.html'; if (lane === 'crime-state-overlap') return 'book-crime-dossiers.html'; return 'books.html'; }
function offerForLane(lane) { if (lane === 'epstein-files') return 'offer-starter-library.html'; if (lane === 'crime-state-overlap') return 'offer-crime-dossiers.html'; if (lane === 'war-machine' || lane === 'declassified-files') return 'offer-intelligence-dossiers.html'; return 'offer-center.html'; }
function optinForLane(lane) { if (lane === 'epstein-files') return 'optin-black-file-brief.html'; if (lane === 'declassified-files' || lane === 'war-machine') return 'optin-intelligence-files-brief.html'; if (lane === 'crime-state-overlap') return 'optin-crime-network-brief.html'; if (lane === 'control-system') return 'optin-full-archive-map.html'; return 'optin-center.html'; }
function makeSocialThread(title, lane) { return [`1/ Fresh ${lane || 'public-record'} lead: ${title}`, '2/ Do not treat a headline as proof. First classify the source type and evidence level.', '3/ Open the source, then use the evidence route, source card, free brief, and book path.']; }
function itemFromLead(raw, lanes, i) { const laneId = clean(raw.lane || 'control-system'); const lane = laneFor(laneId, lanes); const title = clean(raw.title || `Public-record watch item ${i + 1}`); const published = clean(raw.published || raw.date || raw.updated || new Date().toISOString()); const sourceLabel = clean(raw.sourceLabel || title.split(' - ').pop() || 'Public source'); return { id: clean(raw.id || `${laneId}-${published.slice(0,10)}-${i}`), lane: laneId, laneTitle: clean(raw.laneTitle || lane.title || laneId), sourceLabel, title, url: clean(raw.url || lane.route || 'live-intel.html'), published, fetchedAt: new Date().toISOString(), summary: clean(raw.summary || title), evidenceLevel: clean(raw.evidenceLevel || 'Seven-day public-record lead'), evidenceBoundary: clean(raw.evidenceBoundary || evidenceBoundaryForLane(laneId)), whyItMatters: clean(raw.whyItMatters || 'This item is fresh enough to route readers into the evidence, source-card, video, free-brief, offer and book system.'), nextAction: clean(raw.nextAction || 'Open the source first, then follow the evidence route and only share the claim at the strength the record supports.'), videoHook: clean(raw.videoHook || `New public-record signal: ${title}`), rumbleShortTitle: clean(raw.rumbleShortTitle || title.slice(0, 72)), rumbleLongTitle: clean(raw.rumbleLongTitle || `${lane.title || 'Seven-Day Intel'} — ${title}`.slice(0, 140)), socialThread: Array.isArray(raw.socialThread) && raw.socialThread.length ? raw.socialThread.map(clean) : makeSocialThread(title, laneId), evidenceRoute: clean(raw.evidenceRoute || lane.evidenceRoute || 'evidence-vault.html'), videoRoute: clean(raw.videoRoute || lane.videoRoute || 'videos.html'), bookRoute: clean(raw.bookRoute || lane.bookRoute || bookForLane(laneId)), offerRoute: clean(raw.offerRoute || lane.offerRoute || offerForLane(laneId)), optinRoute: clean(raw.optinRoute || optinForLane(laneId)), storeRoute: clean(raw.storeRoute || 'amazon-store-books.html'), status: clean(raw.status || 'fallback-seven-day') }; }
function buildItems(existing, sources, fetched) { const lanes = sources.lanes || existing.lanes || []; const leads = [...(fetched || []), ...(existing.items || []), ...(existing.feedResults || [])].filter(x => x && (x.title || x.summary)); const cutoff = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000; const byKey = new Map(); for (const [i, raw] of leads.entries()) { const item = itemFromLead(raw, lanes, i); const time = Date.parse(item.published); if (!Number.isNaN(time) && time < cutoff && item.status === 'rss-fetched') continue; const key = `${item.title}|${item.url}`; if (!byKey.has(key)) byKey.set(key, item); } let items = [...byKey.values()].slice(0, 80); if (items.length < 4) { for (let i = items.length; i < 4; i++) { const lane = laneFor((lanes[i % Math.max(1, lanes.length)] || {}).id, lanes); items.push(itemFromLead({ lane: lane.id, title: `Fallback public-record watch item for ${lane.title}`, url: lane.route || 'live-intel.html', published: new Date().toISOString() }, lanes, i)); } } return items; }
function writeVaultMarkdown(vault) { const lines = ['# Intel Vault', '', `Updated: ${vault.updated}`, '', '## Boundary', vault.boundary, '', '## Archived Items', '']; for (const item of vault.items || []) { lines.push(`### ${item.title}`); lines.push(`- Published: ${item.published || 'unknown'}`); lines.push(`- Source: ${item.url || 'missing'}`); lines.push(''); } fs.writeFileSync(vaultMarkdownPath, lines.join('\n')); }
async function main() {
  const now = new Date();
  const sources = readJson(sourcesPath, { rssFeeds: [], lanes: [], rules: [] });
  const existing = readJson(livePath, { updated: now.toISOString(), items: [], rules: [], feedResults: [] });
  const feedFetch = await fetchFeeds(sources);
  const items = buildItems(existing, sources, feedFetch.results);
  const updated = { ...existing, updated: now.toISOString(), sourceConfigUpdated: sources.updated || existing.sourceConfigUpdated, status: feedFetch.results.length ? 'rss-fetched-seven-day' : 'seven-day-fail-soft-preserved', activeWindowDays: ACTIVE_WINDOW_DAYS, stalePolicy: 'Seven-day intel cards expire after seven days. Expired cards move to the Intel Vault and must not be displayed as current updates.', rules: Array.from(new Set([...(existing.rules || []), ...(sources.rules || []), 'Seven-day updater fetches configured RSS feeds during the build and falls back safely if a feed fails.', 'RSS descriptions are decoded, stripped of HTML, and rendered as plain text only.', 'Active cards must be published inside the current seven-day window.', 'Expired daily cards move to data/intel-vault.json and downloads/intel-vault.json.'])), lanes: sources.lanes || existing.lanes || [], feedResults: items.map(item => ({ lane: item.lane, title: item.title, url: item.url, published: item.published, sourceLabel: item.sourceLabel, status: item.status })).slice(0, 80), feedErrors: feedFetch.errors, items, vaultRoute: 'intel-vault.html', vaultJson: 'downloads/intel-vault.json', vaultMarkdown: 'downloads/intel-vault.md', archivedThisRun: 0, vaultItemCount: 0 };
  const vault = readJson(vaultPath, { updated: now.toISOString(), title: 'Intel Vault', boundary: 'Vault items are historical public-source leads. Re-check the source before treating them as current.', items: [] });
  writeJson(livePath, updated);
  writeJson(sevenDayIntelDownloadPath, updated);
  writeJson(vaultPath, vault);
  writeJson(vaultDownloadPath, vault);
  writeVaultMarkdown(vault);
  console.log(`Seven-day intel updater complete: ${items.length} active items, ${feedFetch.results.length} fetched RSS lead(s), ${feedFetch.errors.length} feed error(s). Exports: ${sevenDayIntelDownloadRoute}, downloads/intel-vault.json`);
}
main().catch(error => { console.warn(`Seven-day intel updater failed softly: ${error.message}`); process.exit(0); });
