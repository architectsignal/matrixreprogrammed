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
    title: cleanText(item.title || ''),
    url: cleanUrl(item.url || ''),
    published: cleanText(item.published || ''),
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
const items = (data.items || []).map(cleanItem).filter(item => item.title);
function esc(s = '') { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="amazon-store-books.html">Amazon Store</a><a href="power-atlas.html">Control System</a><a href="evidence-vault.html">Declassified Files</a><a href="live-intel.html">Live Intel</a><a href="videos.html">Rumble Channels</a><a href="search.html">Search</a></nav></header>`; }
function layout(title, desc, body) { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><link rel="stylesheet" href="styles.css" /><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,description:desc,dateModified:data.updated})}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — dated public-source intelligence, evidence routes, video hooks, and book paths.</p><p class="warning">Source boundary: updates are starting points for verification, not automatic proof of wrongdoing.</p></footer></div><script src="matrix.js"></script></body></html>`; }
function laneCards() { return lanes.map(lane => `<article class="card redline"><span class="label">Source lane</span><h3>${esc(cleanText(lane.title))}</h3><p>${esc(cleanText(lane.description))}</p><div class="cta-row small"><a class="btn" href="${esc(cleanUrl(lane.route))}">Open Lane</a><a class="btn alt" href="${esc(cleanUrl(lane.evidenceRoute))}">Evidence</a><a class="btn alt" href="${esc(cleanUrl(lane.videoRoute))}">Video</a><a class="btn alt" href="${esc(cleanUrl(lane.bookRoute))}">Book</a></div></article>`).join(''); }
function actionButtons(item) { return `<div class="cta-row small"><a class="btn" href="${esc(item.url)}">Open Source</a><a class="btn alt" href="${esc(item.evidenceRoute || 'evidence-vault.html')}">Evidence Route</a><a class="btn alt" href="${esc(item.videoRoute || 'videos.html')}">Video Hook</a><a class="btn alt" href="${esc(item.optinRoute || 'optin-center.html')}">Free Brief</a><a class="btn alt" href="${esc(item.offerRoute || 'offer-center.html')}">Offer</a><a class="btn alt" href="${esc(item.storeRoute || 'amazon-store-books.html')}">Store</a></div>`; }
function socialThread(item) { const thread = item.socialThread || []; if (!thread.length) return ''; return `<details class="card"><summary>Social thread / caption copy</summary><p>${thread.map(esc).join('<br />')}</p></details>`; }
function itemCards(list = items) { return list.map(raw => { const item = cleanItem(raw); return `<article class="news-item"><span class="figure-caption">${esc((item.published || '').slice(0, 10))} · ${esc(item.laneTitle || item.lane)} · ${esc(item.sourceLabel)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="grid"><div class="card"><span class="label">Evidence Level</span><h3>${esc(item.evidenceLevel || 'Source linked')}</h3><p>${esc(item.evidenceBoundary || 'Open the source route before treating this update as evidence.')}</p></div><div class="card"><span class="label">Why It Matters</span><h3>Reader Context</h3><p>${esc(item.whyItMatters || 'This update belongs inside a broader source trail, not as a standalone claim.')}</p></div><div class="card"><span class="label">Next Action</span><h3>Route The Reader</h3><p>${esc(item.nextAction || 'Open the source, then follow the evidence, video, free brief, offer, and book path.')}</p></div></div><div class="terminal">VIDEO HOOK\n&gt; ${esc(item.videoHook || item.summary)}\n&gt; Short: ${esc(item.rumbleShortTitle || item.title)}\n&gt; Longform: ${esc(item.rumbleLongTitle || item.title)}</div>${actionButtons(item)}${socialThread(item)}</article>`; }).join('') || '<article class="card"><h3>No live items yet</h3><p>The source lanes are configured. The scheduled updater will populate this page as feeds return usable items.</p></article>'; }
function markdown() { return ['# Live Intel Machine', '', `Updated: ${data.updated}`, '', '## Rules', ...(sources.rules || data.rules || []).map(r => `- ${cleanText(r)}`), '', '## Lanes', ...lanes.map(l => `- ${cleanText(l.title)}: ${cleanUrl(l.route)}`), '', '## Latest Items', ...items.map(i => [`- ${String(i.published || '').slice(0,10)} — ${i.title}`, `  - Source: ${i.url}`, `  - Evidence: ${i.evidenceLevel || 'Source linked'}`, `  - Video hook: ${i.videoHook || i.summary}`, `  - Short title: ${i.rumbleShortTitle || i.title}`, `  - Longform title: ${i.rumbleLongTitle || i.title}`, `  - Next action: ${i.nextAction || 'Open source and follow the evidence route.'}`, `  - Offer: ${i.offerRoute || 'offer-center.html'}`].join('\n'))].join('\n'); }
fs.writeFileSync(path.join(root, 'downloads', 'live-intel-latest.json'), JSON.stringify({ updated: data.updated, lanes: lanes.map(lane => ({ ...lane, offerRoute: cleanUrl(lane.offerRoute || 'offer-center.html') })), items, feedResults: data.feedResults || [], htmlSanitized: true, routeNormalizer: 'active', normalizedOfferRoutes: ['offer-intelligence-dossiers.html', 'offer-crime-dossiers.html'] }, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'live-intel-latest.md'), markdown());
const byLane = new Map();
for (const item of items) { if (!byLane.has(item.lane)) byLane.set(item.lane, []); byLane.get(item.lane).push(item); }
const laneSections = lanes.map(lane => `<section class="section wrap"><h2>${esc(cleanText(lane.title))}</h2><p class="lead">${esc(cleanText(lane.description))}</p>${itemCards(byLane.get(cleanText(lane.id)) || [])}</section>`).join('');
const body = `<main><section class="hero wrap"><div class="eyebrow">Live Intelligence Machine</div><h1>LIVE INTEL.</h1><p class="lead">Dated updates from public-source lanes: Epstein files, declassified archives, elite-control structures, war/intelligence state, and crime-state overlap. Each update routes to evidence, video, opt-ins, offers, books, and the Amazon store.</p><div class="cta-row"><a class="btn" href="downloads/live-intel-latest.json">Machine-readable data</a><a class="btn alt" href="downloads/live-intel-latest.md">Markdown Brief</a><a class="btn alt" href="epstein-files.html">Epstein Watch</a><a class="btn alt" href="amazon-store-books.html">Books / Store</a></div></section><section class="section wrap split"><div class="terminal">LIVE INTEL STATUS\n&gt; Updated: ${esc(data.updated)}\n&gt; Source lanes: ${lanes.length}\n&gt; Items available: ${items.length}\n&gt; Evidence route: evidence-vault.html\n&gt; Video route: videos.html\n&gt; Free brief route: optin-center.html\n&gt; Store route: amazon-store-books.html\n&gt; HTML sanitizer: active\n&gt; Route normalizer: active</div><aside class="card redline"><h2>How To Use This Page</h2><p>Start with the dated update, open the source, follow the evidence route, then use the video hook, free brief, offer, and book path for deeper context.</p></aside></section><section class="section wrap"><h2>Latest Actionable Updates</h2>${itemCards(items.slice(0, 12))}</section><section class="section wrap"><h2>Source Lanes</h2><div class="grid">${laneCards()}</div></section>${laneSections}</main>`;
fs.writeFileSync(path.join(root, 'live-intel.html'), layout('Live Intel | Matrix Reprogrammed', 'Dated public-source intelligence machine for Epstein files, declassified archives, elite-control updates, video routes, and book paths.', body));
function patch(file) { const p = path.join(root, file); if (!fs.existsSync(p)) return; let html = fs.readFileSync(p, 'utf8'); if (html.includes('id="live-intel-machine-route"')) return; const section = `<section id="live-intel-machine-route" class="section wrap"><h2>Live Intelligence Machine</h2><p class="lead">Fresh public-source updates, source lanes, declassified-file routes, Epstein watch, Rumble/video hooks, free briefs, offers, and book paths.</p><div class="cta-row"><a class="btn" href="live-intel.html">Open Live Intel</a><a class="btn alt" href="downloads/live-intel-latest.json">Latest JSON</a><a class="btn alt" href="videos.html">Rumble Channels</a><a class="btn alt" href="amazon-store-books.html">Books / Store</a></div></section>`; html = html.replace('</main>', `${section}</main>`); fs.writeFileSync(p, html); }
for (const file of ['index.html', 'news.html', 'evidence-vault.html', 'epstein-files.html', 'videos.html', 'books.html']) patch(file);
function patchSearch() { const p = path.join(root, 'search-index.json'); if (!fs.existsSync(p)) return; const idx = JSON.parse(fs.readFileSync(p, 'utf8')); if (!idx.some(x => x.url === 'live-intel.html')) idx.push({ key: 'live-intel-machine', title: 'Live Intel Machine', subtitle: 'Source-watch updates', series: 'Freedom Intelligence Engine', category: 'Live Intel', url: 'live-intel.html', description: 'Dated source lanes for Epstein files, declassified archives, elite-control developments, video hooks, and book paths.', keywords: ['live intel','source watch','declassified files','Epstein files','elite control','Rumble','books'] }); fs.writeFileSync(p, JSON.stringify(idx, null, 2)); }
function patchSitemap() { const p = path.join(root, 'sitemap.xml'); if (!fs.existsSync(p)) return; let xml = fs.readFileSync(p, 'utf8'); if (!xml.includes('/live-intel.html</loc>')) xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/live-intel.html</loc><lastmod>${String(data.updated).slice(0,10)}</lastmod><changefreq>hourly</changefreq><priority>0.98</priority></url>\n</urlset>`); fs.writeFileSync(p, xml); }
function patchLlms() { const p = path.join(root, 'llms.txt'); if (!fs.existsSync(p)) return; let txt = fs.readFileSync(p, 'utf8'); if (!txt.includes('/live-intel.html')) txt += '\n\nLive Intel Machine:\n- /live-intel.html: dated source-watch hub for public-record updates, declassified-file lanes, Epstein watch, video hooks, opt-ins, offers, and book routes.\n- /downloads/live-intel-latest.json: normalized latest source-watch data.\n- /downloads/live-intel-latest.md: copyable latest intelligence brief with video and reader-route hooks.\n'; fs.writeFileSync(p, txt); }
patchSearch(); patchSitemap(); patchLlms();
console.log(`Built Live Intel Machine with ${lanes.length} lanes and ${items.length} update items. HTML sanitizer active. Route normalizer active.`);
