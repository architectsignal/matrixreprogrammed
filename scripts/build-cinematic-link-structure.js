const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'node_modules', '_site', '.matrix-production-bin']);
const reportDirectory = path.join(root, 'downloads');
const dataDirectory = path.join(root, 'data');
fs.mkdirSync(reportDirectory, { recursive: true });
fs.mkdirSync(dataDirectory, { recursive: true });

const internalRoutes = new Set([
  'admin-control-center.html',
  'review-dashboard.html',
  'source-intake.html',
  'deploy-status.html',
  'deploy-health.html',
  'card-system-health.html',
  'site-brain-router.html',
  'card-artwork-automation.html',
  'card-artwork-queue.html',
  'card-artwork-batches.html',
  'card-art-studio.html',
  'conclusion-engine.html',
  'information-gathering-system.html',
  'update-monitor.html',
  'distribution-center.html',
  'launch-room.html',
  'offer-center.html',
  'sales-ladder.html',
  'schema-index.html',
  'machine-index.html',
  'accountability-review-inbox.html',
  'speculation-needs-review.html'
]);

const excludedRoutes = new Set(['index_v2.html', 'investigation-pathways.html']);

const clusters = {
  command: {
    label: 'Command Deck', eyebrow: 'Enter the signal', title: 'Choose the next move, not another random page.',
    lead: 'Move from the current signal into the wider system: orient, investigate, verify, then act.',
    keywords: ['index', 'start here', 'daily', 'command', 'live intel', 'latest intel', 'news', 'brief', 'watch', 'homepage'],
    routes: [
      ['start-here.html', 'Orient', 'Understand the mission, evidence boundary and the main doors into the system.'],
      ['daily-command-brief.html', 'Current signal', 'See what changed, why it matters and which investigation lanes need attention.'],
      ['power-atlas.html', 'Map the power', 'Place the signal inside the wider network of people, institutions and consequences.'],
      ['investigation-pathways.html', 'Open the signal map', 'Browse every public route by mission instead of hunting through menus.']
    ]
  },
  epstein: {
    label: 'Epstein Files', eyebrow: 'Follow the records', title: 'Move from a single Epstein lead into the full evidence chain.',
    lead: 'Separate records, associations, missing documents, financial routes and unresolved claims before drawing conclusions.',
    keywords: ['epstein', 'maxwell', 'little saint james', 'flight log'],
    routes: [
      ['epstein-files.html', 'Core file', 'Return to the central Epstein record, timeline and document lanes.'],
      ['evidence-vault.html', 'Verify', 'Open the source layer for court records, exhibits and primary documents.'],
      ['network-maps.html', 'Expand the network', 'Trace people, institutions, money routes and documented associations.'],
      ['forum.html', 'Drop a signal', 'Submit a source or unresolved lead without presenting it as proven fact.']
    ]
  },
  death: {
    label: 'Death Files', eyebrow: 'Trace the final consequence', title: 'Connect the death, the context, the network and the missing record.',
    lead: 'A death file should never stand alone. Follow the person, the institutions around them, the evidence boundary and unresolved questions.',
    keywords: ['death file', 'death-files', 'high profile death', 'assassination', 'died', 'dead', 'mortality'],
    routes: [
      ['death-files.html', 'Return to the archive', 'Browse the Death Files by year, person and unresolved evidence lane.'],
      ['evidence-vault.html', 'Check the record', 'Open court, medical, official and archival source routes where available.'],
      ['network-maps.html', 'Map the connections', 'See how the person connects to institutions, money, operations and other dossiers.'],
      ['forum.html', 'Submit evidence', 'Add a documented lead or missing record for review.']
    ]
  },
  speculation: {
    label: 'Dark Speculation Lab', eyebrow: 'Enter the disputed layer', title: 'Keep speculation cinematic without confusing it with proof.',
    lead: 'Follow the theory, then cross into the evidence lane, competing explanations and the next record needed to test it.',
    keywords: ['dark speculation', 'black eye', 'red shoe', 'club', 'symbolic', 'occult', 'ritual', 'speculation'],
    routes: [
      ['dark-speculation-lab.html', 'Theory index', 'Return to the quarantined speculation layer and its evidence boundaries.'],
      ['evidence-policy.html', 'Read the boundary', 'See how confirmed records, disputed claims and symbolic interpretation are separated.'],
      ['evidence-vault.html', 'Search for proof', 'Move from pattern recognition to documents, records and primary sources.'],
      ['forum.html', 'Challenge the theory', 'Add evidence, a counter-explanation or a missing record.']
    ]
  },
  power: {
    label: 'Control System', eyebrow: 'Follow the structure', title: 'Place this page inside the architecture of power.',
    lead: 'Move between actors, institutions, policy, money, jurisdiction and consequence so no dossier becomes an isolated claim.',
    keywords: ['power', 'elite', 'family', 'families', 'institution', 'policy', 'think tank', 'jurisdiction', 'agenda', 'control system', 'behind the curtain', 'black nobility', 'government'],
    routes: [
      ['power-atlas.html', 'System map', 'See the wider architecture of people, institutions, policy and consequence.'],
      ['follow-the-money.html', 'Money trail', 'Trace contracts, grants, ownership, lobbying and financial routes.'],
      ['network-maps.html', 'Connection layer', 'Open the relationship map around the current subject.'],
      ['evidence-vault.html', 'Evidence layer', 'Check the source records supporting or limiting the current conclusion.']
    ]
  },
  evidence: {
    label: 'Evidence System', eyebrow: 'Verify the signal', title: 'Turn a claim into a traceable evidence path.',
    lead: 'Move from the current record into source provenance, related dossiers, missing documents and the investigation queue.',
    keywords: ['evidence', 'source', 'archive', 'vault', 'declassified', 'court', 'document', 'research tool', 'data lab', 'citation', 'record'],
    routes: [
      ['evidence-vault.html', 'Evidence vault', 'Browse the central source and document system.'],
      ['source-document-vault.html', 'Primary documents', 'Open source files, official records and document routes.'],
      ['research-tools.html', 'Research tools', 'Use the lawful OSINT and verification workflow.'],
      ['investigation-machine.html', 'Feed the machine', 'Connect the record to a live investigation and its next evidence requirement.']
    ]
  },
  networks: {
    label: 'Network Layer', eyebrow: 'Connect the nodes', title: 'Move from one node into the system around it.',
    lead: 'Follow relationships, institutions, jurisdictions, money and evidence strength rather than relying on proximity alone.',
    keywords: ['network', 'map', 'money', 'geographic', 'relationship', 'connections', 'follow the money'],
    routes: [
      ['network-maps.html', 'Network maps', 'Explore the wider relationship structure.'],
      ['power-atlas.html', 'Power atlas', 'Place the network inside the full control system.'],
      ['follow-the-money.html', 'Financial routes', 'Trace ownership, contracts, donations and institutional funding.'],
      ['evidence-vault.html', 'Verify each edge', 'Check what each connection actually proves and what it does not.']
    ]
  },
  intelligence: {
    label: 'Investigation Machine', eyebrow: 'Advance the case', title: 'Connect the dossier to the next evidence-producing action.',
    lead: 'Move from current findings to source verification, network expansion, missing records and public participation.',
    keywords: ['investigation', 'intelligence', 'dossier', 'report', 'briefing', 'conclusion', 'outcome'],
    routes: [
      ['investigation-machine.html', 'Investigation machine', 'Return to the active research and routing system.'],
      ['evidence-vault.html', 'Evidence check', 'Verify the records behind the current finding.'],
      ['power-atlas.html', 'Wider context', 'Connect the dossier to related people, institutions and policies.'],
      ['forum.html', 'Signal board', 'Submit a source, correction or unresolved lead.']
    ]
  },
  books: {
    label: 'Book Universe', eyebrow: 'Go deeper', title: 'Connect the book to the living investigation behind it.',
    lead: 'The books provide depth; the site provides updates, sources, maps and continuing evidence routes.',
    keywords: ['book', 'books', 'amazon', 'store', 'author', 'reading'],
    routes: [
      ['books.html', 'Book archive', 'Browse the complete publishing system by series and subject.'],
      ['book-universe.html', 'Connected universe', 'See how the books connect to live dossiers and investigation lanes.'],
      ['evidence-vault.html', 'Source layer', 'Open the records and documents behind the subject.'],
      ['membership.html', 'Continue the work', 'Access deeper briefs, saved research and member investigation routes.']
    ]
  },
  community: {
    label: 'Signal Network', eyebrow: 'Join the investigation', title: 'Turn passive reading into a useful contribution.',
    lead: 'Save the route, follow the subject, submit a source, challenge a conclusion or receive the next briefing.',
    keywords: ['forum', 'signal board', 'contact', 'newsletter', 'membership', 'member', 'subscriber', 'community', 'optin', 'free brief'],
    routes: [
      ['forum.html', 'Signal board', 'Post a sourced lead, correction or question for review.'],
      ['contact-the-machine.html', 'Contact the machine', 'Send a private source, proposal or operational message.'],
      ['optin-center.html', 'Receive briefs', 'Choose the updates and public briefings you want to receive.'],
      ['start-here.html', 'Return to the mission', 'Re-enter the investigation through the main public routes.']
    ]
  },
  safety: {
    label: 'Trust Boundary', eyebrow: 'Protect the researcher', title: 'Keep the investigation lawful, secure and evidence-led.',
    lead: 'Use the privacy, source-handling and evidence rules before opening unknown files or making serious claims.',
    keywords: ['security', 'privacy', 'dark web', 'safety', 'trust', 'evidence policy', 'terms', 'legal'],
    routes: [
      ['security-privacy.html', 'Security tools', 'Protect accounts, devices, communications and source material.'],
      ['dark-web-safety.html', 'Dark web safety', 'Use lawful Tor and unknown-link handling practices.'],
      ['evidence-policy.html', 'Evidence policy', 'Understand how claims and sources are classified.'],
      ['start-here.html', 'Return to the system', 'Continue through the main investigation paths.']
    ]
  }
};

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(full);
  }
  return output;
}
function relativeRoute(file) { return path.relative(root, file).split(path.sep).join('/'); }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function stripHtml(value = '') {
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function extract(html, expression, fallback = '') { const match = html.match(expression); return match ? stripHtml(match[1]) : fallback; }
function hrefFrom(sourceRoute, targetRoute) {
  const sourceDirectory = path.posix.dirname(sourceRoute);
  let value = path.posix.relative(sourceDirectory === '.' ? '' : sourceDirectory, targetRoute);
  if (!value) value = path.posix.basename(targetRoute);
  return value || targetRoute;
}
function isInternal(route, html) {
  return internalRoutes.has(route)
    || /<meta\s+name=["']robots["'][^>]*content=["'][^"']*(?:noindex|noarchive)/i.test(html)
    || /<meta\s+content=["'][^"']*(?:noindex|noarchive)[^"']*["'][^>]*name=["']robots["']/i.test(html);
}
function classify(page) {
  const haystack = `${page.route} ${page.title} ${page.description} ${page.text.slice(0, 18000)}`.toLowerCase();
  let winner = 'command';
  let winnerScore = -1;
  for (const [id, cluster] of Object.entries(clusters)) {
    let score = 0;
    for (const keyword of cluster.keywords) {
      if (page.route.toLowerCase().includes(keyword.replace(/\s+/g, '-'))) score += 8;
      if (page.title.toLowerCase().includes(keyword)) score += 6;
      if (page.description.toLowerCase().includes(keyword)) score += 3;
      if (haystack.includes(keyword)) score += 1;
    }
    if (score > winnerScore) { winner = id; winnerScore = score; }
  }
  return winner;
}
function ensureStylesheet(html, route) {
  if (/cinematic-pathways\.css/i.test(html)) return html;
  const link = `<link rel="stylesheet" href="${escapeHtml(hrefFrom(route, 'cinematic-pathways.css'))}"/>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${link}</head>`);
  return `${link}${html}`;
}
function routeCards(page, routeSet) {
  const cluster = clusters[page.cluster] || clusters.command;
  const candidates = [...cluster.routes, ['investigation-pathways.html', 'Signal map', 'Open every public route grouped by mission and evidence lane.']];
  const seen = new Set([page.route]);
  const selected = [];
  for (const [route, label, description] of candidates) {
    if (!routeSet.has(route) || seen.has(route)) continue;
    seen.add(route);
    selected.push({ route, label, description });
    if (selected.length === 4) break;
  }
  return selected;
}
function pathwaySection(page, cards) {
  const cluster = clusters[page.cluster] || clusters.command;
  const cardHtml = cards.map((card, index) => `<a class="matrix-pathway-card" href="${escapeHtml(hrefFrom(page.route, card.route))}"><span class="matrix-pathway-number">0${index + 1}</span><span class="matrix-pathway-card-copy"><strong>${escapeHtml(card.label)}</strong><small>${escapeHtml(card.description)}</small></span><span class="matrix-pathway-arrow" aria-hidden="true">→</span></a>`).join('');
  return `<!-- cinematic-pathways:start --><section class="matrix-pathways" aria-labelledby="matrix-pathways-title"><div class="matrix-pathways-head"><div><span class="matrix-pathways-eyebrow">${escapeHtml(cluster.eyebrow)}</span><h2 id="matrix-pathways-title">${escapeHtml(cluster.title)}</h2><p>${escapeHtml(cluster.lead)}</p></div><a class="matrix-pathways-map-link" href="${escapeHtml(hrefFrom(page.route, 'investigation-pathways.html'))}">Open full signal map</a></div><div class="matrix-pathways-sequence" aria-label="Investigation sequence"><span>Discover</span><i></i><span>Investigate</span><i></i><span>Verify</span><i></i><span>Act</span></div><div class="matrix-pathway-grid">${cardHtml}</div><p class="matrix-pathways-boundary"><strong>${escapeHtml(cluster.label)}:</strong> Follow the records, preserve uncertainty and treat association as context rather than proof.</p></section><!-- cinematic-pathways:end -->`;
}
function injectSection(html, section) {
  const clean = html.replace(/<!-- cinematic-pathways:start -->[\s\S]*?<!-- cinematic-pathways:end -->/gi, '');
  if (/<\/main>/i.test(clean)) return clean.replace(/<\/main>/i, `${section}</main>`);
  if (/<footer\b/i.test(clean)) return clean.replace(/<footer\b/i, `${section}<footer`);
  if (/<\/body>/i.test(clean)) return clean.replace(/<\/body>/i, `${section}</body>`);
  return `${clean}${section}`;
}
function pageCard(page, mapRoute) {
  return `<a class="signal-map-card" href="${escapeHtml(hrefFrom(mapRoute, page.route))}" data-search="${escapeHtml(`${page.title} ${page.description} ${page.route}`.toLowerCase())}"><span>${escapeHtml(page.title)}</span><small>${escapeHtml(page.description || 'Open this route in the investigation system.')}</small><em>${escapeHtml(page.route)}</em></a>`;
}
function mapPage(pages) {
  const mapRoute = 'investigation-pathways.html';
  const groups = Object.entries(clusters).map(([clusterId, cluster]) => {
    const groupPages = pages.filter(page => page.cluster === clusterId).sort((a, b) => a.title.localeCompare(b.title));
    if (!groupPages.length) return '';
    return `<section class="signal-map-group" data-group="${escapeHtml(clusterId)}"><div class="signal-map-group-head"><span>${escapeHtml(cluster.eyebrow)}</span><h2>${escapeHtml(cluster.label)}</h2><p>${escapeHtml(cluster.lead)}</p><strong>${groupPages.length} route${groupPages.length === 1 ? '' : 's'}</strong></div><div class="signal-map-grid">${groupPages.map(page => pageCard(page, mapRoute)).join('')}</div></section>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Investigation Pathways | Matrix Reprogrammed</title><meta name="description" content="A cinematic map of every public Matrix Reprogrammed investigation, evidence, dossier, book and participation route."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="reader-experience.css"/><link rel="stylesheet" href="cinematic-pathways.css"/></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="start-here.html">Start Here</a><a href="daily-command-brief.html">Daily Brief</a><a href="power-atlas.html">Control System</a><a href="evidence-vault.html">Evidence</a><a href="forum.html">Signal Board</a></nav></header><main class="wrap section signal-map"><div class="signal-map-hero"><span class="matrix-pathways-eyebrow">The complete route graph</span><h1>FOLLOW THE SIGNAL.</h1><p class="lead">Every public page is connected here by purpose. Search by person, institution, evidence lane, book, theory or system, then continue through the contextual pathways on each page.</p><label class="signal-map-search"><span>Search the system</span><input id="signal-map-query" type="search" placeholder="Try Epstein, policy, death files, evidence, books…" autocomplete="off"/></label><div class="signal-map-count"><strong id="signal-map-visible">${pages.length}</strong> of ${pages.length} public routes visible</div></div>${groups}<div id="signal-map-empty" class="signal-map-empty" hidden><h2>No route matched.</h2><p>Try a broader subject, institution or evidence term.</p></div></main><footer class="footer wrap"><p><strong>Evidence boundary:</strong> Connections organize research. They do not prove guilt, intent or causation.</p></footer></div><script src="matrix.js"></script><script>(function(){const input=document.getElementById('signal-map-query');const cards=[...document.querySelectorAll('.signal-map-card')];const groups=[...document.querySelectorAll('.signal-map-group')];const visible=document.getElementById('signal-map-visible');const empty=document.getElementById('signal-map-empty');function apply(){const q=input.value.trim().toLowerCase();let count=0;for(const card of cards){const show=!q||card.dataset.search.includes(q);card.hidden=!show;if(show)count++;}for(const group of groups){group.hidden=!group.querySelector('.signal-map-card:not([hidden])');}visible.textContent=String(count);empty.hidden=count!==0;}input.addEventListener('input',apply);})();</script></body></html>`;
}
function localHtmlTarget(sourceRoute, href) {
  const clean = String(href || '').split('#')[0].split('?')[0].trim();
  if (!clean || clean.startsWith('#') || /^[a-z]+:/i.test(clean) || clean.startsWith('//')) return '';
  const sourceDirectory = path.posix.dirname(sourceRoute);
  const target = path.posix.normalize(path.posix.join(sourceDirectory === '.' ? '' : sourceDirectory, clean.replace(/^\//, '')));
  return target.endsWith('.html') ? target : '';
}

const files = walk(root);
const pages = [];
for (const file of files) {
  const route = relativeRoute(file);
  if (excludedRoutes.has(route)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (isInternal(route, html)) continue;
  const title = extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i, path.basename(route, '.html').replace(/[-_]+/g, ' '));
  const description = extract(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/i)
    || extract(html, /<meta\s+content=["']([^"']*)["']\s+name=["']description["'][^>]*>/i)
    || extract(html, /<p[^>]*class=["'][^"']*lead[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const page = { file, route, title, description, text: stripHtml(html) };
  page.cluster = classify(page);
  pages.push(page);
}

fs.writeFileSync(path.join(root, 'investigation-pathways.html'), mapPage(pages));
const routeSet = new Set([...pages.map(page => page.route), 'investigation-pathways.html']);
let touched = 0;
let linksInjected = 0;
for (const page of pages) {
  let html = fs.readFileSync(page.file, 'utf8');
  const cards = routeCards(page, routeSet);
  if (!cards.length) continue;
  html = ensureStylesheet(html, page.route);
  html = injectSection(html, pathwaySection(page, cards));
  fs.writeFileSync(page.file, html);
  touched += 1;
  linksInjected += cards.length + 1;
}

const allPublicPages = [...pages, { file: path.join(root, 'investigation-pathways.html'), route: 'investigation-pathways.html', title: 'Investigation Pathways', description: 'The complete public route graph.', text: '', cluster: 'command' }];
const inbound = new Map(allPublicPages.map(page => [page.route, 0]));
const edges = [];
for (const page of allPublicPages) {
  const html = fs.readFileSync(page.file, 'utf8');
  const expression = /\shref=["']([^"']+)["']/gi;
  let match;
  while ((match = expression.exec(html))) {
    const target = localHtmlTarget(page.route, match[1]);
    if (!target || !inbound.has(target) || target === page.route) continue;
    inbound.set(target, inbound.get(target) + 1);
    edges.push({ from: page.route, to: target });
  }
}
const orphanPages = allPublicPages.filter(page => (inbound.get(page.route) || 0) === 0).map(page => page.route);
const clusterCounts = Object.fromEntries(Object.keys(clusters).map(id => [id, allPublicPages.filter(page => page.cluster === id).length]));
const graph = {
  ok: orphanPages.length === 0,
  generatedAt: new Date().toISOString(),
  publicPages: allPublicPages.length,
  pagesEnhanced: touched,
  contextualLinksInjected: linksInjected,
  edgeCount: edges.length,
  orphanPages,
  clusterCounts,
  nodes: allPublicPages.map(page => ({ route: page.route, title: page.title, description: page.description, cluster: page.cluster, inboundLinks: inbound.get(page.route) || 0 })),
  edges
};
fs.writeFileSync(path.join(dataDirectory, 'internal-link-graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
fs.writeFileSync(path.join(reportDirectory, 'cinematic-link-structure-report.json'), `${JSON.stringify({
  ok: graph.ok,
  generatedAt: graph.generatedAt,
  publicPages: graph.publicPages,
  pagesEnhanced: graph.pagesEnhanced,
  contextualLinksInjected: graph.contextualLinksInjected,
  edgeCount: graph.edgeCount,
  orphanPages: graph.orphanPages,
  clusterCounts: graph.clusterCounts,
  boundary: 'The route graph improves discovery and context. It does not convert association or proximity into proof.'
}, null, 2)}\n`);
if (orphanPages.length) {
  console.error(`Cinematic link structure left ${orphanPages.length} public orphan page(s): ${orphanPages.join(', ')}`);
  process.exit(1);
}
console.log(`Cinematic link structure connected ${allPublicPages.length} public pages across ${Object.keys(clusters).length} mission clusters with ${edges.length} internal edges.`);
