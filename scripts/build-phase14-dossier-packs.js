const fs = require('fs');
const path = require('path');
const { loadSiteContext, pickRelatedBooks, pickMainPlayers, termsFrom, routeUrl, writeBrandedPdf } = require('./branded-pdf-mini-book');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'dossier-packs.json');
const liveIntelPath = path.join(root, 'data', 'live-intel.json');
if (!fs.existsSync(dataPath)) {
  console.log('No data/dossier-packs.json found. Skipping Phase 14 Dossier Packs build.');
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const liveIntel = fs.existsSync(liveIntelPath) ? JSON.parse(fs.readFileSync(liveIntelPath, 'utf8')) : { updated: data.updated, items: [] };
const siteContext = loadSiteContext(root);
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="download-center.html">Download Center</a><a href="schema-index.html">Schema Index</a><a href="authority-hub.html">Authority Hub</a><a href="sales-ladder.html">Reader Paths</a><a href="trust-center.html">Trust Center</a><a href="evidence-vault.html">Evidence Vault</a><a href="forum.html">Signal Board</a><a href="black-file.html">Black File</a></nav></header>`; }
function layout(title, desc, body) { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CreativeWork',name:title,description:desc})}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Dossier pack boundary: orientation bundles are not proof of guilt. Use original source pathways and trust pages.</p></footer></div><script src="matrix.js"></script></body></html>`; }
function titleFromFile(file) { return file.replace(/^downloads\//, '').replace(/\.html$|\.json$|\.md$|\.pdf$/g, '').replace(/[-_]/g, ' '); }
function cards(items = [], label = 'Takeaway') { return items.map(item => `<article class="card"><span class="label">${esc(label)}</span><h3>${esc(item)}</h3><p>Preserve this boundary when using the pack for reading, research, or content.</p></article>`).join(''); }
function topicTerms(pack) {
  const text = [pack.slug, pack.title, pack.label, pack.summary, pack.trustRoute, pack.evidenceRoute, pack.readerPath, pack.machineRoute, ...(pack.keywords || []), ...(pack.routes || []), ...(pack.takeaways || [])].join(' ').toLowerCase();
  return Array.from(new Set(text.split(/[^a-z0-9]+/).filter(w => w.length > 3)));
}
function relevantIntel(pack, limit = 8) {
  const terms = topicTerms(pack);
  const matches = (liveIntel.items || []).filter(item => {
    const hay = [item.lane, item.laneTitle, item.sourceLabel, item.title, item.summary, item.evidenceLevel, item.evidenceBoundary, item.whyItMatters, item.nextAction, item.evidenceRoute, item.bookRoute, item.offerRoute, item.optinRoute].join(' ').toLowerCase();
    return terms.some(term => hay.includes(term));
  }).slice(0, limit);
  if (matches.length) return matches;
  return (liveIntel.items || []).slice(0, Math.min(3, limit)).map(item => ({ ...item, relevanceNote: 'General current intelligence item included because no exact subject match exists yet.' }));
}
function sourceFiles(pack, intel) {
  const fromRoutes = (pack.routes || []).map(route => ({ title: titleFromFile(route), route, kind: route.includes('evidence') ? 'Evidence route' : route.includes('book') ? 'Book route' : 'Source route' }));
  const fromIntel = (intel || []).map(item => ({ title: item.title, route: item.url, kind: item.sourceLabel || 'Latest source' }));
  return [...fromRoutes, ...fromIntel].slice(0, 18);
}
function intelCards(items = []) {
  return items.map(item => `<article class="card redline"><span class="label">${esc(String(item.published || '').slice(0,10))} · ${esc(item.sourceLabel || item.laneTitle || 'Source')}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary || '')}</p><p><strong>Boundary:</strong> ${esc(item.evidenceBoundary || 'Open the source and keep the evidence class visible.')}</p><p><strong>Next:</strong> ${esc(item.nextAction || 'Open source, then follow the evidence route.')}</p><div class="cta-row small"><a class="btn" href="${esc(item.url)}">Open Source</a><a class="btn alt" href="${esc(item.evidenceRoute || 'evidence-vault.html')}">Evidence Route</a><a class="btn alt" href="${esc(item.bookRoute || 'books.html')}">Book Route</a></div></article>`).join('');
}
function packJson(pack) {
  const intel = relevantIntel(pack);
  const files = sourceFiles(pack, intel);
  return {
    updated: data.updated,
    liveIntelUpdated: liveIntel.updated || null,
    title: pack.title,
    label: pack.label,
    summary: pack.summary,
    boundary: 'A dossier pack is an orientation bundle. It does not prove guilt, causation, intent, control, or criminal conduct.',
    brandedPdfRoute: `downloads/dossier-pack-${pack.slug}.pdf`,
    relevanceKeywords: pack.keywords || [],
    trustRoute: pack.trustRoute,
    evidenceRoute: pack.evidenceRoute,
    readerPath: pack.readerPath,
    machineRoute: pack.machineRoute,
    forumPostsRoute: `downloads/forum-posts.json?pack=${pack.slug}`,
    forumPostsMarkdownRoute: `downloads/forum-posts.md?pack=${pack.slug}`,
    liveIntelWindow: { updated: liveIntel.updated || data.updated, itemCount: intel.length, items: intel },
    sourceFiles: files,
    routes: pack.routes,
    takeaways: pack.takeaways,
    downloadIncludes: ['branded PDF mini book', 'trust route', 'evidence route', 'reader path', 'source files', 'latest intelligence window', 'forum posts export', 'book/store route']
  };
}
function packMarkdown(pack) {
  const payload = packJson(pack);
  return `# ${pack.title}\n\n${pack.summary}\n\n## Branded PDF Mini Book\n\n- PDF: ${payload.brandedPdfRoute}\n\n## Boundary\n\n${payload.boundary}\n\n## Latest Intelligence Window\n\nUpdated: ${payload.liveIntelWindow.updated}\nItems: ${payload.liveIntelWindow.itemCount}\n\n${payload.liveIntelWindow.items.map(i => `- ${String(i.published || '').slice(0,10)} — ${i.title}\n  - Source: ${i.url}\n  - Evidence: ${i.evidenceLevel || 'Source-linked item'}\n  - Boundary: ${i.evidenceBoundary || 'Open source first.'}\n  - Next: ${i.nextAction || 'Open source and evidence route.'}`).join('\n')}\n\n## Source Pathways / Relevant Source Files\n\n${payload.sourceFiles.map(s => `- ${s.kind}: ${s.title} — ${s.route}`).join('\n')}\n\n## Forum Posts Export\n\n- JSON: ${payload.forumPostsRoute}\n- Markdown: ${payload.forumPostsMarkdownRoute}\n\n## Core Pathways\n\n- Trust pathway: ${pack.trustRoute}\n- Evidence pathway: ${pack.evidenceRoute}\n- Reader path: ${pack.readerPath}\n- Machine pathway: ${pack.machineRoute}\n\n## Takeaways\n\n${(pack.takeaways || []).map(t => `- ${t}`).join('\n')}\n`;
}
function writeForumPostPlaceholders() {
  const jsonPlaceholder = { ok: true, persistent: true, dynamicSource: 'Cloudflare Worker /downloads/forum-posts.json reads FORUM_POSTS KV at request time.', staticFallback: true, boundary: 'This static file only keeps the site audit green. The live Worker overrides this path with current forum posts from persistent Cloudflare KV / FORUM_POSTS KV.', packFilter: 'Use ?pack=black-file-starter, ?pack=intelligence-network, ?pack=crime-state-overlap, ?pack=war-machine, ?pack=symbolic-power, or ?pack=trust-evidence for subject-filtered exports.', posts: [] };
  fs.writeFileSync(path.join(root, 'downloads', 'forum-posts.json'), JSON.stringify(jsonPlaceholder, null, 2));
  fs.writeFileSync(path.join(root, 'downloads', 'forum-posts.md'), '# Forum Posts Export\n\nThis static fallback keeps the download path available during build. On Cloudflare, `/downloads/forum-posts.md` is served dynamically from the persistent FORUM_POSTS KV namespace. Add `?pack=<pack-slug>` for a subject-filtered export.\n');
}
function buildPackPdf(pack, intel, files, pdfFile) {
  const terms = termsFrom(...topicTerms(pack));
  writeBrandedPdf(path.join(root, pdfFile), {
    title: pack.title,
    label: 'Dossier Pack Mini Book',
    summary: pack.summary,
    why: ['Turn a subject into a structured archive route: proof links, names/entities, source boundaries, current updates, books, and next actions.', 'Use the pack as a mini-book before moving into the deeper Matrix Reprogrammed reading path.'],
    proofLinks: files.map(file => `${file.kind}: ${file.title} - ${routeUrl(file.route)}`),
    mainPlayers: pickMainPlayers(siteContext, terms, pack.keywords || []),
    recordSupports: ['This pack supports source routing, latest intelligence windows, evidence boundaries, trust paths, subject keywords, related books, and forum export routes.', ...(pack.takeaways || [])],
    speculation: ['A dossier pack is not proof of guilt, causation, intent, control, or criminal conduct.', 'Use speculation only as labelled analysis after the reader has the source route and evidence class.'],
    liveIntel: intel.map(item => `${String(item.published || '').slice(0,10)} - ${item.title} - ${item.url}`),
    relatedBooks: pickRelatedBooks(siteContext, terms),
    actions: [...(pack.takeaways || []), 'Open the trust pathway before sharing a claim.', 'Open the evidence pathway before treating an item as proven.', 'Use the related books for the deep version of the subject.'],
    routes: [pack.trustRoute, pack.evidenceRoute, pack.readerPath, pack.machineRoute, ...(pack.routes || []), `downloads/forum-posts.json?pack=${pack.slug}`].filter(Boolean).map(routeUrl)
  });
}
function buildPack(pack) {
  const htmlFile = `dossier-pack-${pack.slug}.html`;
  const jsonFile = `downloads/dossier-pack-${pack.slug}.json`;
  const mdFile = `downloads/dossier-pack-${pack.slug}.md`;
  const pdfFile = `downloads/dossier-pack-${pack.slug}.pdf`;
  const intel = relevantIntel(pack);
  const files = sourceFiles(pack, intel);
  const payload = packJson(pack);
  fs.writeFileSync(path.join(root, jsonFile), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(root, mdFile), packMarkdown(pack));
  buildPackPdf(pack, intel, files, pdfFile);
  const sourceRows = files.map(file => `<article class="card"><span class="label">${esc(file.kind)}</span><h3>${esc(file.title)}</h3><p><a href="${esc(file.route)}">${esc(file.route)}</a></p></article>`).join('');
  const body = `<main><section class="hero wrap"><div class="eyebrow">Dossier Pack · Relevant Sources</div><h1>${esc(pack.title)}</h1><p class="lead">${esc(pack.summary)}</p><div class="cta-row"><a class="btn" href="${esc(pdfFile)}">Branded PDF Mini Book</a><a class="btn alt" href="${esc(jsonFile)}">Source Pack JSON</a><a class="btn alt" href="${esc(mdFile)}">Markdown Brief</a><a class="btn alt" href="downloads/forum-posts.json?pack=${esc(pack.slug)}">Forum Posts JSON</a><a class="btn alt" href="download-center.html">Download Center</a></div></section><section class="section wrap split"><div class="terminal">DOSSIER PACK\n&gt; Pack: ${esc(pack.title)}\n&gt; PDF mini book: ${esc(pdfFile)}\n&gt; Latest intel items: ${intel.length}\n&gt; Source files: ${files.length}\n&gt; Forum export: downloads/forum-posts.json?pack=${esc(pack.slug)}\n&gt; Trust pathway: ${esc(pack.trustRoute)}\n&gt; Evidence pathway: ${esc(pack.evidenceRoute)}</div><aside class="card redline"><h2>Pack Boundary</h2><p>A dossier pack is an orientation bundle, not proof of guilt. It contains relevant source links, latest intel, reader pathways, branded PDF mini books, and filtered Signal Board exports for the subject.</p></aside></section><section class="section wrap"><h2>Latest Intelligence Window</h2><p class="lead">Subject-matched live-intel items, source links, evidence boundaries, and next actions for this pack.</p><div class="grid">${intelCards(intel)}</div></section><section class="section wrap"><h2>Source Pathways / Relevant Source Files</h2><div class="grid">${sourceRows}</div></section><section class="section wrap"><h2>Core Pathways</h2><div class="card"><div class="cta-row small"><a class="btn" href="${esc(pack.trustRoute)}">Trust Pathway</a><a class="btn alt" href="${esc(pack.evidenceRoute)}">Evidence Pathway</a><a class="btn alt" href="${esc(pack.readerPath)}">Reader Path</a><a class="btn alt" href="${esc(pack.machineRoute)}">Data Pathway</a></div></div></section><section class="section wrap"><h2>Forum Posts For This Subject</h2><article class="card redline"><p>Useful public Signal Board posts can deepen the pack when they match the subject. The live Worker filters the persistent Cloudflare KV export by this pack slug.</p><div class="cta-row small"><a class="btn" href="downloads/forum-posts.json?pack=${esc(pack.slug)}">Subject Forum JSON</a><a class="btn alt" href="downloads/forum-posts.md?pack=${esc(pack.slug)}">Subject Forum Markdown</a><a class="btn alt" href="forum.html">Open Signal Board</a></div></article></section><section class="section wrap"><h2>Takeaways</h2><div class="grid">${cards(pack.takeaways)}</div></section><section class="section wrap"><h2>Downloads</h2><div class="card"><div class="cta-row"><a class="btn" href="${esc(pdfFile)}">PDF Mini Book</a><a class="btn alt" href="${esc(jsonFile)}">Source Pack JSON</a><a class="btn alt" href="${esc(mdFile)}">Markdown Brief</a><a class="btn alt" href="downloads/forum-posts.json?pack=${esc(pack.slug)}">Forum Posts JSON</a></div></div></section></main>`;
  fs.writeFileSync(path.join(root, htmlFile), layout(`${pack.title} | Matrix Reprogrammed`, pack.summary, body));
  return { htmlFile, jsonFile, mdFile, pdfFile };
}
function patchFile(file, marker, section) { const p = path.join(root, file); if (!fs.existsSync(p)) return; let html = fs.readFileSync(p, 'utf8'); if (html.includes(marker)) return; html = html.replace('</main>', `${section}</main>`); fs.writeFileSync(p, html); }
function addPagesToSitemap(files) { const p = path.join(root, 'sitemap.xml'); if (!fs.existsSync(p)) return; let xml = fs.readFileSync(p, 'utf8'); const add = files.filter(f => f.endsWith('.html') && !xml.includes(`/${f}</loc>`)).map(f => `  <url><loc>https://matrixreprogrammed.com/${f}</loc><lastmod>${esc(data.updated || '2026-06-26')}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`).join('\n'); if (add) xml = xml.replace('</urlset>', `${add}\n</urlset>`); fs.writeFileSync(p, xml); }
function patchLlms(files) { const p = path.join(root, 'llms.txt'); if (!fs.existsSync(p)) return; let llms = fs.readFileSync(p, 'utf8'); const lines = [`Dossier Pack / Download Center Engine:`, `- /download-center.html: downloadable briefing pack hub for branded PDF mini books, relevant source files, latest intelligence, trust routes, evidence boundaries, forum post exports, and subject pathways.`, ...files.map(f => `- /${f}: dossier pack output or branded PDF mini book.`), `- /downloads/forum-posts.json: dynamic forum posts export served from FORUM_POSTS KV on Cloudflare; supports ?pack=<pack-slug>.`, `- /downloads/forum-posts.md: dynamic forum posts markdown export served from FORUM_POSTS KV on Cloudflare; supports ?pack=<pack-slug>.`]; const missing = lines.filter(line => !llms.includes(line)); if (missing.length) fs.writeFileSync(p, `${llms.trim()}\n\n${missing.join('\n')}\n`); }
function patchSearchIndex(files) { const p = path.join(root, 'search-index.json'); if (!fs.existsSync(p)) return; const search = JSON.parse(fs.readFileSync(p, 'utf8')); const existing = new Set(search.map(i => i.url)); for (const pack of data.packs || []) { const url = `dossier-pack-${pack.slug}.html`; if (!existing.has(url)) { search.push({ key: `dossier-pack-${pack.slug}`, title: `${pack.title} | Dossier Pack`, subtitle: pack.label, series: 'Dossier Pack Engine', category: 'Download Center', url, description: pack.summary, keywords: [pack.title, pack.label, pack.summary, ...(pack.keywords || []), pack.trustRoute, pack.evidenceRoute, ...(pack.routes || []), 'branded pdf mini book'] }); existing.add(url); } } if (!existing.has('download-center.html')) search.push({ key: 'download-center', title: 'Download Center | Matrix Reprogrammed', subtitle: 'Relevant Dossier Packs', series: 'Dossier Pack Engine', category: 'Download Center', url: 'download-center.html', description: 'Download center for relevant Matrix Reprogrammed public dossier packs, branded PDF mini books, latest intel, source files, and forum post exports.', keywords: ['download center','dossier packs','source files','latest intel','forum posts','briefing packs','pdf mini books'] }); if (!existing.has('downloads/forum-posts.json')) search.push({ key: 'forum-posts-export', title: 'Forum Posts Export | Signal Board', subtitle: 'Persistent KV forum posts', series: 'Signal Board', category: 'Download Center', url: 'downloads/forum-posts.json', description: 'Dynamic export of useful public Signal Board posts from persistent Cloudflare KV.', keywords: ['forum posts','signal board','public posts','download','KV export'] }); fs.writeFileSync(p, JSON.stringify(search, null, 2)); }
const outputs = [];
for (const pack of data.packs || []) { const built = buildPack(pack); outputs.push(built.htmlFile, built.jsonFile, built.mdFile, built.pdfFile); }
writeForumPostPlaceholders();
outputs.push('downloads/forum-posts.json', 'downloads/forum-posts.md');
const packCards = (data.packs || []).map(pack => { const intel = relevantIntel(pack); return `<article class="card redline"><span class="label">${esc(pack.label)} · ${intel.length} intel item(s)</span><h3>${esc(pack.title)}</h3><p>${esc(pack.summary)}</p><p><strong>Includes:</strong> branded PDF mini book, relevant source files, latest intelligence windows, trust/evidence routes, and subject-filtered forum exports.</p><div class="cta-row small"><a class="btn" href="dossier-pack-${esc(pack.slug)}.html">Open Pack</a><a class="btn alt" href="downloads/dossier-pack-${esc(pack.slug)}.pdf">PDF Mini Book</a></div></article>`; }).join('');
const forumCard = `<article class="card redline"><span class="label">Signal Board Resource</span><h3>Public Forum Posts Export</h3><p>Useful public posts from the Signal Board are persistent Cloudflare KV resources in FORUM_POSTS and downloadable as JSON or Markdown. Use pack filters to pull subject-relevant posts.</p><div class="cta-row small"><a class="btn" href="downloads/forum-posts.json">Forum Posts JSON</a><a class="btn alt" href="downloads/forum-posts.md">Forum Posts Markdown</a><a class="btn alt" href="forum.html">Open Signal Board</a></div></article>`;
const ruleCards = (data.rules || []).map(rule => `<article class="card"><span class="label">Pack Rule</span><h3>${esc(rule)}</h3><p>All downloadable packs must preserve source boundaries and stay relevant to the pack subject.</p></article>`).join('');
const body = `<main><section class="hero wrap"><div class="eyebrow">Download Center</div><h1>DOWNLOAD CENTER.</h1><p class="lead">Download subject-specific packs that bundle branded PDF mini books, relevant source files, latest intelligence windows, trust pages, evidence boundaries, reader paths, source links, and useful Signal Board posts.</p><div class="cta-row"><a class="btn" href="dossier-pack-black-file-starter.html">Starter Pack</a><a class="btn alt" href="downloads/dossier-pack-black-file-starter.pdf">Starter PDF</a><a class="btn alt" href="dossier-pack-intelligence-network.html">Intelligence Pack</a><a class="btn alt" href="downloads/forum-posts.json">Forum Posts Export</a></div></section><section class="section wrap split"><div class="terminal">DOSSIER PACK ENGINE STATUS\n&gt; Packs: ${(data.packs || []).length}\n&gt; Branded PDF mini books: ${(data.packs || []).length}\n&gt; Rules: ${(data.rules || []).length}\n&gt; Relevant source files: active\n&gt; Latest intel windows: active\n&gt; Forum posts export: persistent Cloudflare KV + pack filters\n&gt; Trust pathways: active\n&gt; Evidence pathways: active</div><aside class="card redline"><h2>Download Boundary</h2><p>Download packs are subject-specific orientation bundles. They pull relevant source routes, live-intel links, evidence boundaries, branded PDFs, and filtered public Signal Board exports from persistent Cloudflare KV.</p></aside></section><section class="section wrap"><h2>Dossier Packs</h2><div class="grid">${packCards}${forumCard}</div></section><section class="section wrap"><h2>Pack Rules</h2><div class="grid">${ruleCards}</div></section></main>`;
fs.writeFileSync(path.join(root, 'download-center.html'), layout('Download Center | Matrix Reprogrammed', 'Download center for subject-specific Matrix Reprogrammed dossier packs, branded PDF mini books, latest intel, source files, and persistent Signal Board post exports.', body));
outputs.push('download-center.html');
const section = `<section id="phase-fourteen-dossier-pack-engine" class="section wrap"><h2>Dossier Pack / Download Center</h2><p class="lead">This pathway connects to subject-specific briefing packs with branded PDF mini books, relevant source files, latest intelligence windows, trust/evidence routes, and dynamic Signal Board post exports.</p><div class="cta-row"><a class="btn" href="download-center.html">Download Center</a><a class="btn alt" href="dossier-pack-black-file-starter.html">Starter Pack</a><a class="btn alt" href="downloads/dossier-pack-black-file-starter.pdf">Starter PDF</a><a class="btn alt" href="downloads/forum-posts.json">Forum Posts Export</a></div></section>`;
for (const file of ['index.html','black-file.html','trust-center.html','evidence-vault.html','sales-ladder.html','schema-index.html']) patchFile(file, 'id="phase-fourteen-dossier-pack-engine"', section);
addPagesToSitemap(outputs);
patchLlms(outputs);
patchSearchIndex(outputs);
console.log(`Built Dossier Packs with ${(data.packs || []).length} packs, branded PDF mini books, relevant intel windows, source files, forum post exports, and ${outputs.length} outputs.`);
