const fs = require('fs');
const path = require('path');

const root = process.cwd();
const phaseChecks = [
  { files: ['power-atlas.html', 'evidence-vault.html', 'evidence-policy.html', 'network-maps.html'], script: 'build-phase1-structure.js', label: 'Phase 1' },
  { files: ['atlas-index.html'], script: 'build-phase2-power-atlas.js', label: 'Phase 2' },
  { files: ['evidence-vault-index.html'], script: 'build-phase3-evidence-vault.js', label: 'Phase 3' },
  { files: ['book-universe.html'], script: 'build-phase4-book-universe.js', label: 'Phase 4' },
  { files: ['answer-engine.html'], script: 'build-phase5-ai-answer-engine.js', label: 'Phase 5' },
  { files: ['network-map-index.html'], script: 'build-phase6-network-maps.js', label: 'Phase 6' },
  { files: ['conversion-funnel.html'], script: 'build-phase7-conversion-funnel.js', label: 'Phase 7' },
  { files: ['trust-center.html'], script: 'build-phase8-trust-center.js', label: 'Phase 8' },
  { files: ['distribution-center.html'], script: 'build-phase9-content-distribution.js', label: 'Phase 9' },
  { files: ['sales-ladder.html'], script: 'build-phase10-sales-ladder.js', label: 'Phase 10' },
  { files: ['update-monitor.html'], script: 'build-phase11-update-monitor.js', label: 'Phase 11' },
  { files: ['authority-hub.html'], script: 'build-phase12-authority-clusters.js', label: 'Phase 12' },
  { files: ['schema-index.html', 'site-graph.json', 'claim-taxonomy.json', 'crawler-map.json'], script: 'build-phase13-schema-engine.js', label: 'Phase 13' },
  { files: ['download-center.html', 'downloads/dossier-pack-black-file-starter.json', 'downloads/dossier-pack-black-file-starter.md'], script: 'build-phase14-dossier-packs.js', label: 'Phase 14' },
  { files: ['feed-center.html', 'feeds/main-signal.xml', 'feeds/main-signal-atom.xml', 'feeds/main-signal.json'], script: 'build-phase15-feed-engine.js', label: 'Phase 15' },
  { files: ['share-center.html', 'downloads/share-kit-black-file-starter.json', 'downloads/share-kit-black-file-starter.md', 'downloads/share-kit-black-file-starter.txt'], script: 'build-phase16-share-kits.js', label: 'Phase 16' },
  { files: ['launch-room.html', 'downloads/campaign-black-file-launch.json', 'downloads/campaign-black-file-launch.md'], script: 'build-phase17-campaign-calendar.js', label: 'Phase 17' },
  { files: ['offer-center.html', 'downloads/offer-starter-library.json', 'downloads/offer-starter-library.md'], script: 'build-phase18-offer-stack.js', label: 'Phase 18' },
  { files: ['optin-center.html', 'downloads/lead-magnet-black-file-brief.json', 'downloads/lead-magnet-black-file-brief.md'], script: 'build-phase19-lead-magnets.js', label: 'Phase 19' }
];

function runBuilderWhenMissing(check) {
  const missing = check.files.some(file => !fs.existsSync(path.join(root, file)));
  if (!missing) return;
  const builder = path.join(root, 'scripts', check.script);
  if (!fs.existsSync(builder)) throw new Error(`${check.label} pages missing and ${builder} was not found.`);
  console.log(`${check.label} pages missing before cleanup. Running ${check.script} first.`);
  require(builder);
}
for (const check of phaseChecks) runBuilderWhenMissing(check);

const primaryNavLinks = [
  ['start-here.html', 'Start Here'],
  ['books.html', 'Books'],
  ['amazon-store-books.html', 'Amazon Store'],
  ['power-atlas.html', 'Control System'],
  ['evidence-vault.html', 'Declassified Files'],
  ['news.html', 'Live Intel'],
  ['videos.html', 'Rumble Channels'],
  ['search.html', 'Search']
];
const secondaryNavGroups = [
  ['Sell / Capture', [
    ['optin-center.html', 'Opt-in Center'], ['offer-center.html', 'Offer Center'], ['sales-ladder.html', 'Reader Paths'], ['book-universe.html', 'Book Universe'], ['launch-room.html', 'Launch Room'], ['share-center.html', 'Share Center']
  ]],
  ['Evidence & Trust', [
    ['trust-center.html', 'Trust Center'], ['evidence-vault-index.html', 'Source Index'], ['evidence-policy.html', 'Evidence Policy'], ['black-file.html', 'Black File'], ['download-center.html', 'Download Center'], ['feed-center.html', 'Feed Center']
  ]],
  ['Control Maps', [
    ['power-atlas.html', 'Power Atlas'], ['network-maps.html', 'Network Maps'], ['network-map-index.html', 'Map Index'], ['authority-hub.html', 'Authority Hub'], ['answer-engine.html', 'AI Answers'], ['schema-index.html', 'Machine Index']
  ]],
  ['Freedom Ecosystem', [
    ['news.html', 'Intel Desk'], ['videos.html', 'Rumble Channels'], ['forum.html', 'Signal Board'], ['timers.html', 'Timers'], ['distribution-center.html', 'Distribution'], ['update-monitor.html', 'Update Monitor']
  ]]
];
function navLink([href, label]) { return `<a href="${href}">${label}</a>`; }
const secondaryNav = secondaryNavGroups.map(([title, links]) => `<div class="nav-group"><strong>${title}</strong>${links.map(navLink).join('')}</div>`).join('');
const canonicalNav = `<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary">${primaryNavLinks.map(navLink).join('')}</div><details class="nav-more"><summary>More</summary><div class="nav-drawer">${secondaryNav}</div></details></nav>`;

const copyReplacements = [
  ['## Buy / Continue', '## Continue The Investigation'],
  ['Buy / Continue', 'Continue The Investigation'],
  ['THE Hegelian CRISIS DIALECTIC', 'THE HEGELIAN CRISIS DIALECTIC'],
  ['following the The ', 'following the '],
  ['Database-driven archive', 'Book Archive'],
  ['Database-driven Archive', 'Book Archive'],
  ['Source: data/books.json', 'Archive: Matrix Reprogrammed index'],
  ['Source: data/', 'Archive source: Matrix Reprogrammed'],
  ['Live generated pages', 'Available book pages'],
  ['Generated pages', 'Available book pages'],
  ['generated pages', 'reader pages'],
  ['Search index: active', 'Search: ready'],
  ['Reader paths: active', 'Reader paths: open'],
  ['Risk timers: active', 'Risk timers: open'],
  ['Black File funnel: active', 'Black File path: open'],
  ['Black File funnel', 'Black File path'],
  ['Use this page as a sales door and an archive route. The book sells the deep dive; the atlas and vault prove the system around it.', 'Start with the book for the full investigation, then use the atlas and evidence vault to follow the source trail.'],
  ['Use this page as a sales door and an archive route.', 'Use this page as a reader path into the book, the atlas, and the evidence vault.'],
  ['The book sells the deep dive; the atlas and vault prove the system around it.', 'The book gives the full investigation; the atlas and vault help you trace the surrounding evidence.'],
  ['sales door', 'reader path'],
  ['Sales door', 'Reader path'],
  ['archive route', 'archive pathway'],
  ['Archive route', 'Archive pathway'],
  ['the book sells the deep dive', 'the book gives the full investigation'],
  ['The book sells the deep dive', 'The book gives the full investigation'],
  ['Phase 19 Lead Magnet / Capture Engine', 'Free Briefs / Reader Capture'],
  ['Phase 19 Lead Magnet', 'Free Brief'],
  ['Phase 18 Offer Stack / Revenue Ladder Engine', 'Offer Center / Reading Routes'],
  ['Phase 18 Offer Stack', 'Offer Route'],
  ['Phase 17 Campaign Calendar / Launch Room Engine', 'Launch Room / Campaign Paths'],
  ['Phase 17 Campaign Calendar', 'Campaign Calendar'],
  ['Phase 16 Share Kit / Social Distribution Engine', 'Share Kits / Distribution Tools'],
  ['Phase 16 Share Kit', 'Share Kit'],
  ['Phase 15 Feed Discovery', 'Feed Center'],
  ['Phase 14 Dossier Pack', 'Download Center'],
  ['Phase 13 Schema Engine', 'Machine Index'],
  ['Phase 12 Authority Cluster', 'Authority Hub'],
  ['Phase 11 Freshness Monitor', 'Update Monitor'],
  ['Phase 10 Reader Path Sales Ladder', 'Reader Paths'],
  ['Phase 9 Content Distribution', 'Distribution Tools'],
  ['Phase 8 Trust Center', 'Trust Center'],
  ['Phase 7 Conversion Funnel', 'Conversion Funnel'],
  ['Phase 6 Network Map', 'Network Map'],
  ['Phase 5 AI Answer Engine', 'AI Answer Engine'],
  ['Phase 4 Book Universe', 'Book Universe'],
  ['Phase 3 Evidence Vault', 'Evidence Vault'],
  ['Phase 2 Power Atlas', 'Power Atlas'],
  ['Phase 1 structure pages', 'core structure pages'],
  ['Phase 1 structure', 'core structure'],
  ['This section is generated as a stable anchor for dashboard routing and source-led updates.', 'This route keeps the archive connected to source-led updates and reader navigation.']
];
const regexReplacements = [
  [/\bBlack File funnel\b/gi, 'Black File path'],
  [/\bArchive route\b/gi, 'Archive pathway'],
  [/\bgenerated pages\b/gi, 'reader pages'],
  [/\bLive generated pages\b/gi, 'Available book pages'],
  [/\bSearch index:\s*active\b/gi, 'Search: ready'],
  [/\bReader paths:\s*active\b/gi, 'Reader paths: open'],
  [/\bRisk timers:\s*active\b/gi, 'Risk timers: open'],
  [/\bSource:\s*data\/books\.json\b/gi, 'Archive: Matrix Reprogrammed index'],
  [/\bSource:\s*data\//gi, 'Archive source: Matrix Reprogrammed ']
];
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html) { fs.writeFileSync(path.join(root, file), html); }
function replaceNav(html) { return html.replace(/<nav class="nav[^"']*"[^>]*>[\s\S]*?<\/nav>/g, canonicalNav); }
function cleanEmptyPills(html) { return html.replace(/<p>(?:<span class="pill">[^<]+<\/span>\s*){2,}<\/p>/g, '').replace(/<p>\s*<\/p>/g, ''); }
function cleanupImplementationCopy(html) {
  for (const [from, to] of copyReplacements) html = html.split(from).join(to);
  for (const [pattern, to] of regexReplacements) html = html.replace(pattern, to);
  return html;
}
function cleanupHomepage(html) { return html.replace(/<article class="card book-card"><div><div class="pill">Flagship Door<\/div><h3>D\.O\.G The Architect[\s\S]*?<\/article>/g, '').replace(/Flagship Door/g, 'Primary Route'); }
function cleanupNewsDuplicates(html) { return html.replace(/<article class="card(?: redline)?">\s*<span class="figure-caption">Worldwide \/ latest sourced figure<\/span>[\s\S]*?<\/article>/g, '').replace(/<span class="figure-caption">Worldwide \/ latest sourced figure<\/span>/g, '<span class="figure-caption">Dated sourced figure</span>'); }
function cleanupTimerRiskTerminal(html) { return html.replace(/SIGNALS INCREASING RISK/g, 'Risk Signal Lane').replace(/<div class="terminal">\s*Risk Signal Lane[\s\S]*?Verified correction\s*<\/div>/g, '<div class="terminal">RISK SIGNAL LANE\n&gt; Dated signals only\n&gt; No repeated risk terminal\n&gt; Static page, not a live counter</div>').replace(/(?:<div class="terminal">\s*RISK SIGNAL LANE[\s\S]*?not a live counter\s*<\/div>\s*){2,}/g, '<div class="terminal">RISK SIGNAL LANE\n&gt; Dated signals only\n&gt; No repeated risk terminal\n&gt; Static page, not a live counter</div>'); }
function cleanupVideoRoutes(html) { return html.replace(/Rumble Channel Routes/g, 'Video Production Map'); }
function safeSearchJs() { return `(function(){const input=document.getElementById('archive-search'),results=document.getElementById('search-results'),count=document.getElementById('search-count');if(!input||!results)return;function esc(s){return String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}function render(items){count.textContent=items.length+' archive door'+(items.length===1?'':'s')+' shown';results.innerHTML=items.map(b=>'<article class="card"><span class="label">'+esc(b.category||'Archive')+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description||b.subtitle||'')+'</p><a class="btn" href="'+esc(b.url)+'">Open Door</a></article>').join('');}fetch('search-index.json').then(r=>r.json()).then(data=>{function run(){const q=input.value.trim().toLowerCase();render(!q?data:data.filter(b=>[b.title,b.subtitle,b.series,b.category,b.description,(b.keywords||[]).join(' ')].join(' ').toLowerCase().includes(q)));}input.addEventListener('input',run);if(input.value.trim())run();}).catch(()=>{});})();`; }

const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
for (const file of htmlFiles) {
  let html = cleanupImplementationCopy(cleanEmptyPills(replaceNav(read(file))));
  if (file === 'index.html') html = cleanupHomepage(html);
  if (file === 'news.html') html = cleanupNewsDuplicates(html);
  if (file === 'timers.html') html = cleanupTimerRiskTerminal(html);
  if (file === 'videos.html') html = cleanupVideoRoutes(html);
  write(file, html);
}
const searchFile = path.join(root, 'search.html');
const indexFile = path.join(root, 'search-index.json');
if (fs.existsSync(searchFile) && fs.existsSync(indexFile)) {
  const items = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const fallback = items.slice(0, 8).map(b => `<article class="card"><span class="label">${esc(b.category || 'Archive')}</span><h3>${esc(b.title)}</h3><p>${esc(b.description || b.subtitle || '')}</p><a class="btn" href="${esc(b.url)}">Open Door</a></article>`).join('');
  let html = cleanupImplementationCopy(read('search.html'));
  if (!html.includes('Showing the strongest entry points')) html = html.replace('<p class="filter-count" id="search-count"></p><div class="grid" id="search-results"></div>', `<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">${fallback}</div>`);
  write('search.html', replaceNav(html));
}
write('search.js', safeSearchJs());
console.log(`UX cleanup complete across ${htmlFiles.length} HTML files. Navigation shell, archive drawer, and public copy polished.`);
