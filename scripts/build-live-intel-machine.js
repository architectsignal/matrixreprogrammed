const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'live-intel.json');
const sourcesPath = path.join(root, 'data', 'live-intel-sources.json');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
const data = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : { updated: new Date().toISOString(), items: [] };
const sources = fs.existsSync(sourcesPath) ? JSON.parse(fs.readFileSync(sourcesPath, 'utf8')) : { lanes: [], rules: [] };
const lanes = sources.lanes || data.lanes || [];
const routeAliases = {
  'offer-intelligence-entry.html': 'offer-intelligence-dossiers.html',
  'offer-crime-dossier-entry.html': 'offer-crime-dossiers.html'
};

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
function cleanText(value = '') {
  return decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\btarget\s*=\s*"?_blank"?/gi, ' ')
    .replace(/\bfont\s+color\s*=\s*"?#[a-f0-9]+"?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanUrl(value = '') {
  const text = cleanText(value);
  const normalized = routeAliases[text] || text;
  return /^https?:\/\//i.test(normalized) || /^[a-z0-9/_#.-]+\.html$/i.test(normalized) || /^downloads\//i.test(normalized) ? normalized : '#';
}
function validDate(value) { const time = Date.parse(String(value || '')); return Number.isFinite(time) ? new Date(time).toISOString() : ''; }
function laneDefaultRoute(laneId, field, fallback) {
  const lane = lanes.find(item => cleanText(item.id) === cleanText(laneId)) || {};
  return cleanUrl(lane[field] || fallback);
}
function cleanItem(item = {}) {
  const laneId = cleanText(item.lane || '');
  return {
    ...item,
    lane: laneId,
    laneTitle: cleanText(item.laneTitle || item.lane || ''),
    sourceLabel: cleanText(item.sourceLabel || ''),
    sourceTier: cleanText(item.sourceTier || 'discovery'),
    title: cleanText(item.title || ''),
    url: cleanUrl(item.url || ''),
    published: validDate(item.published || ''),
    fetchedAt: validDate(item.fetchedAt || ''),
    summary: cleanText(item.summary || item.title || ''),
    evidenceLevel: cleanText(item.evidenceLevel || ''),
    evidenceBoundary: cleanText(item.evidenceBoundary || ''),
    whyItMatters: cleanText(item.whyItMatters || ''),
    nextAction: cleanText(item.nextAction || ''),
    videoHook: cleanText(item.videoHook || item.summary || ''),
    rumbleShortTitle: cleanText(item.rumbleShortTitle || item.title || ''),
    rumbleLongTitle: cleanText(item.rumbleLongTitle || item.title || ''),
    evidenceRoute: cleanUrl(item.evidenceRoute || laneDefaultRoute(laneId, 'evidenceRoute', 'evidence-vault.html')),
    videoRoute: cleanUrl(item.videoRoute || laneDefaultRoute(laneId, 'videoRoute', 'videos.html')),
    optinRoute: cleanUrl(item.optinRoute || 'optin-center.html'),
    offerRoute: cleanUrl(item.offerRoute || laneDefaultRoute(laneId, 'offerRoute', 'offer-center.html')),
    storeRoute: cleanUrl(item.storeRoute || 'amazon-store-books.html'),
    bookRoute: cleanUrl(item.bookRoute || laneDefaultRoute(laneId, 'bookRoute', 'books.html')),
    socialThread: Array.isArray(item.socialThread) ? item.socialThread.map(cleanText).filter(Boolean) : []
  };
}
const items = (data.items || []).map(cleanItem).filter(item => item.title && item.published && item.url !== '#').sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
const metrics = data.collectionMetrics || {};
const latestPublishedAt = validDate(data.latestPublishedAt || items[0]?.published || '');
const collectionCompletedAt = validDate(data.collectionCompletedAt || data.updated || '');
const newItemCount = Number(metrics.newItemCount || 0);
const collectionHealthy = Number(metrics.successfulFeedCount || 0) > 0;
const statusText = cleanText(data.freshnessTruth || (newItemCount ? `${newItemCount} new source items were added.` : 'No newly published source item entered the current evidence window during the last completed collection.'));

function esc(value = '') { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function displayDate(value) { const date = validDate(value); return date ? date.slice(0, 10) : 'date unavailable'; }
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="amazon-store-books.html">Amazon Store</a><a href="power-atlas.html">Control System</a><a href="evidence-vault.html">Declassified Files</a><a href="live-intel.html">Live Intel</a><a href="videos.html">Rumble Channels</a><a href="search.html">Search</a></nav></header>`; }
function layout(title, description, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><link rel="stylesheet" href="styles.css" /><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,description,dateModified:collectionCompletedAt || data.updated})}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — dated public-source intelligence, evidence routes, video hooks, and book paths.</p><p class="warning">Source boundary: current records are starting points for verification, not automatic proof of wrongdoing.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function laneCards() {
  return lanes.map(lane => `<article class="card redline"><span class="label">Source lane</span><h3>${esc(cleanText(lane.title))}</h3><p>${esc(cleanText(lane.description))}</p><div class="cta-row small"><a class="btn" href="${esc(cleanUrl(lane.route))}">Open Lane</a><a class="btn alt" href="${esc(cleanUrl(lane.evidenceRoute))}">Evidence</a><a class="btn alt" href="${esc(cleanUrl(lane.videoRoute))}">Video</a><a class="btn alt" href="${esc(cleanUrl(lane.bookRoute))}">Book</a></div></article>`).join('');
}
function actionButtons(item) {
  return `<div class="cta-row small"><a class="btn" href="${esc(item.url)}">Open Source</a><a class="btn alt" href="${esc(item.evidenceRoute || 'evidence-vault.html')}">Evidence Route</a><a class="btn alt" href="${esc(item.videoRoute || 'videos.html')}">Video Hook</a><a class="btn alt" href="${esc(item.optinRoute || 'optin-center.html')}">Free Brief</a><a class="btn alt" href="${esc(item.offerRoute || 'offer-center.html')}">Offer</a><a class="btn alt" href="${esc(item.storeRoute || 'amazon-store-books.html')}">Books / Store</a></div>`;
}
function socialThread(item) {
  const thread = item.socialThread || [];
  return thread.length ? `<details class="card"><summary>Social thread / caption copy</summary><p>${thread.map(esc).join('<br />')}</p></details>` : '';
}
function itemCards(list = items) {
  if (!list.length) return '<article class="card"><span class="label">Truthful freshness state</span><h3>No current source item is available</h3><p>The collector did not invent a replacement story. Check the collection status above, then use the source lanes and Intel Vault while the next collection runs.</p></article>';
  return list.map(raw => {
    const item = cleanItem(raw);
    const sourceClass = item.sourceTier === 'primary-or-official' ? 'Primary / official source' : item.sourceTier === 'reputable-secondary' ? 'Reputable secondary source' : 'Discovery source';
    return `<article class="news-item"><span class="figure-caption">${esc(displayDate(item.published))} · ${esc(item.laneTitle || item.lane)} · ${esc(item.sourceLabel)}</span><p><span class="label">${esc(sourceClass)}</span></p><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="grid"><div class="card"><span class="label">Evidence Level</span><h3>${esc(item.evidenceLevel || 'Source linked')}</h3><p>${esc(item.evidenceBoundary || 'Open the source route before treating this update as evidence.')}</p></div><div class="card"><span class="label">Why It Matters</span><h3>Reader Context</h3><p>${esc(item.whyItMatters || 'This update belongs inside a broader source trail, not as a standalone claim.')}</p></div><div class="card"><span class="label">Next Action</span><h3>Route The Reader</h3><p>${esc(item.nextAction || 'Open the source, then follow the evidence, video, free brief, offer, and book path.')}</p></div></div><div class="terminal">VIDEO HOOK\n&gt; ${esc(item.videoHook || item.summary)}\n&gt; Short: ${esc(item.rumbleShortTitle || item.title)}\n&gt; Longform: ${esc(item.rumbleLongTitle || item.title)}</div>${actionButtons(item)}${socialThread(item)}</article>`;
  }).join('');
}
function markdown() {
  return ['# Live Intel Machine', '', `Collection completed: ${collectionCompletedAt || 'unavailable'}`, `Latest source publication: ${latestPublishedAt || 'none in current window'}`, `Collection status: ${data.status || 'unknown'}`, `New items this collection: ${newItemCount}`, '', '## Freshness truth', statusText, '', '## Rules', ...(sources.rules || data.rules || []).map(rule => `- ${cleanText(rule)}`), '', '## Lanes', ...lanes.map(lane => `- ${cleanText(lane.title)}: ${cleanUrl(lane.route)}`), '', '## Current Items', ...items.map(item => [`- ${displayDate(item.published)} — ${item.title}`, `  - Source: ${item.url}`, `  - Source class: ${item.sourceTier || 'unknown'}`, `  - Evidence: ${item.evidenceLevel || 'Source linked'}`, `  - Video hook: ${item.videoHook || item.summary}`, `  - Next action: ${item.nextAction || 'Open source and follow the evidence route.'}`].join('\n'))].join('\n');
}

const downloadPayload = {
  collectionCompletedAt,
  latestPublishedAt,
  status: data.status,
  freshnessTruth: statusText,
  collectionMetrics: metrics,
  lanes: lanes.map(lane => ({ ...lane, offerRoute: cleanUrl(lane.offerRoute || 'offer-center.html') })),
  items,
  feedResults: data.feedResults || [],
  feedSuccesses: data.feedSuccesses || [],
  feedErrors: data.feedErrors || [],
  htmlSanitized: true,
  routeNormalizer: 'active',
  truthfulFreshnessMetadata: true,
  normalizedOfferRoutes: ['offer-intelligence-dossiers.html', 'offer-crime-dossiers.html']
};
fs.writeFileSync(path.join(root, 'downloads', 'live-intel-latest.json'), `${JSON.stringify(downloadPayload, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'downloads', 'live-intel-latest.md'), `${markdown()}\n`);

const byLane = new Map();
for (const item of items) { if (!byLane.has(item.lane)) byLane.set(item.lane, []); byLane.get(item.lane).push(item); }
const laneSections = lanes.map(lane => `<section class="section wrap"><h2>${esc(cleanText(lane.title))}</h2><p class="lead">${esc(cleanText(lane.description))}</p>${itemCards(byLane.get(cleanText(lane.id)) || [])}</section>`).join('');
const stateLabel = newItemCount > 0 ? `${newItemCount} new item${newItemCount === 1 ? '' : 's'} this collection` : 'No newly published item this collection';
const body = `<main><section class="hero wrap"><div class="eyebrow">Live Intelligence Machine</div><h1>LIVE INTEL.</h1><p class="lead">Current, dated public-source leads from official records, archives and discovery feeds. Collection time and source publication time are shown separately so an old item cannot appear new merely because the page rebuilt.</p><div class="cta-row"><a class="btn" href="downloads/live-intel-latest.json">Machine-readable data</a><a class="btn alt" href="downloads/live-intel-latest.md">Markdown Brief</a><a class="btn alt" href="intel-vault.html">Intel Vault</a><a class="btn alt" href="amazon-store-books.html">Books / Store</a></div></section><section class="section wrap split"><div class="terminal">LIVE INTEL STATUS\n&gt; Collection completed: ${esc(collectionCompletedAt || 'unavailable')}\n&gt; Latest source publication: ${esc(latestPublishedAt || 'none in current window')}\n&gt; State: ${esc(stateLabel)}\n&gt; Current items: ${items.length}\n&gt; Successful feeds: ${Number(metrics.successfulFeedCount || 0)} / ${Number(metrics.configuredFeedCount || 0)}\n&gt; Failed feeds: ${Number(metrics.failedFeedCount || 0)}\n&gt; Primary / official items: ${Number(metrics.primaryOrOfficialItemCount || 0)}\n&gt; HTML sanitizer: active\n&gt; Route normalizer: active</div><aside class="card redline"><span class="label">Freshness truth</span><h2>${collectionHealthy ? 'Collection completed' : 'Collection degraded'}</h2><p>${esc(statusText)}</p><p class="warning">The collection timestamp is not an evidence date. The newest source date is shown separately.</p></aside></section><section class="section wrap"><h2>Latest Actionable Updates</h2>${itemCards(items.slice(0, 12))}</section><section class="section wrap"><h2>Source Lanes</h2><div class="grid">${laneCards()}</div></section>${laneSections}</main>`;
fs.writeFileSync(path.join(root, 'live-intel.html'), layout('Live Intel | Matrix Reprogrammed', 'Current dated public-source intelligence with truthful collection and publication timestamps.', body));

function patch(file) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) return;
  let page = fs.readFileSync(filePath, 'utf8');
  const section = `<section id="live-intel-machine-route" class="section wrap"><h2>Live Intelligence Machine</h2><p class="lead">Current public-source records with separate collection and publication dates, source classes, evidence boundaries and deeper report routes.</p><div class="cta-row"><a class="btn" href="live-intel.html">Open Live Intel</a><a class="btn alt" href="downloads/live-intel-latest.json">Latest JSON</a><a class="btn alt" href="intel-vault.html">Intel Vault</a><a class="btn alt" href="amazon-store-books.html">Books / Store</a></div></section>`;
  if (page.includes('id="live-intel-machine-route"')) page = page.replace(/<section id="live-intel-machine-route"[\s\S]*?<\/section>/, section);
  else page = page.replace('</main>', `${section}</main>`);
  fs.writeFileSync(filePath, page);
}
for (const file of ['index.html', 'news.html', 'evidence-vault.html', 'epstein-files.html', 'videos.html', 'books.html']) patch(file);

function patchSearch() {
  const filePath = path.join(root, 'search-index.json');
  if (!fs.existsSync(filePath)) return;
  const index = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const record = { key: 'live-intel-machine', title: 'Live Intel Machine', subtitle: 'Current source-watch updates', series: 'Freedom Intelligence Engine', category: 'Live Intel', url: 'live-intel.html', description: 'Dated source lanes with separate collection and publication times, official-source classification and evidence boundaries.', keywords: ['live intel','source watch','declassified files','Epstein files','official records','current updates'] };
  const position = index.findIndex(item => item.url === 'live-intel.html');
  if (position >= 0) index[position] = { ...index[position], ...record }; else index.push(record);
  fs.writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`);
}
function patchSitemap() {
  const filePath = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(filePath)) return;
  let xml = fs.readFileSync(filePath, 'utf8');
  if (!xml.includes('/live-intel.html</loc>')) xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/live-intel.html</loc><lastmod>${displayDate(collectionCompletedAt)}</lastmod><changefreq>daily</changefreq><priority>0.98</priority></url>\n</urlset>`);
  else xml = xml.replace(/(<loc>https:\/\/matrixreprogrammed\.com\/live-intel\.html<\/loc>[\s\S]*?<changefreq>)[^<]+(<\/changefreq>)/, '$1daily$2');
  fs.writeFileSync(filePath, xml);
}
function patchLlms() {
  const filePath = path.join(root, 'llms.txt');
  if (!fs.existsSync(filePath)) return;
  let text = fs.readFileSync(filePath, 'utf8');
  if (!text.includes('/live-intel.html')) text += '\n\nLive Intel Machine:\n- /live-intel.html — current public-source records with separate collection and publication timestamps.\n- /downloads/live-intel-latest.json — machine-readable current window.\n';
  fs.writeFileSync(filePath, text);
}
patchSearch();
patchSitemap();
patchLlms();
console.log(`Live Intel machine built: ${items.length} current items, ${newItemCount} new this collection, latest source ${latestPublishedAt || 'none'}.`);
