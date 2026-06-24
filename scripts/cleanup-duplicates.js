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
  { files: ['conversion-funnel.html'], script: 'build-phase7-conversion-funnel.js', label: 'Phase 7' }
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

const canonicalNav = `<nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="book-universe.html">Book Universe</a><a href="conversion-funnel.html">Funnels</a><a href="answer-engine.html">AI Answers</a><a href="power-atlas.html">Power Atlas</a><a href="network-maps.html">Network Maps</a><a href="network-map-index.html">Map Index</a><a href="evidence-vault.html">Evidence Vault</a><a href="evidence-vault-index.html">Source Index</a><a href="news.html">Intel Desk</a><a href="forum.html">Signal Board</a><a href="search.html">Search</a><a href="timers.html">Timers</a><a href="videos.html">Videos</a><a href="black-file.html">Black File</a></nav>`;
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html) { fs.writeFileSync(path.join(root, file), html); }
function replaceNav(html) { return html.replace(/<nav class="nav">[\s\S]*?<\/nav>/g, canonicalNav); }
function removeVisibleKeywordPills(html) { return html.replace(/<p>(?:<span class="pill">[^<]+<\/span>\s*){2,}<\/p>/g, '').replace(/<p>\s*<\/p>/g, ''); }
function cleanupHomepage(html) {
  return html
    .replace(/<article class="card book-card"><div><div class="pill">Flagship Door<\/div><h3>D\.O\.G The Architect[\s\S]*?<\/article>/g, '')
    .replace(/<p><a class="btn" href="book-as-above-so-below\.html">D\.O\.G The Architect[\s\S]*?<\/a><\/p>/g, '')
    .replace('Reader paths now map to live books.', 'Reader paths now branch without repeating the flagship.');
}
function cleanupTimers(html) { return html.replace(/<div class="terminal">SIGNALS INCREASING RISK[\s\S]*?Verified correction<\/div>/g, '<p><span class="pill">Unique signal lane</span></p>'); }
function cleanupNews(html) {
  return html.replace(/<div class="grid">\s*(?:<article class="card(?: redline)?"><span class="figure-caption">Worldwide \/ latest sourced figure<\/span>[\s\S]*?<\/article>\s*)+<\/div>/g, '');
}
function cleanupVideos(html) {
  if (!/Rumble Channel Routes/.test(html)) return html;
  return html.replace(/<section class="section wrap"><h2>Rumble Channel Routes<\/h2>[\s\S]*?<\/section>\s*<section class="section wrap split">/, '<section class="section wrap"><h2>Video Production Map</h2><p class="lead">This page covers formats and publishing rules only. The full channel directory lives on the Rumble network page.</p><div class="grid"><article class="card"><span class="label">Format</span><h3>60-Second Intel Drop</h3><p>Hook, source, evidence label, interpretation, and one archive path.</p></article><article class="card"><span class="label">Format</span><h3>3-Minute Dark Explainer</h3><p>A cinematic dossier breakdown for court files, releases, sanctions, war lanes, and public-record signals.</p></article><article class="card redline"><span class="label">Directory</span><h3>Rumble Channels</h3><p>Open the channel network when you need the external broadcast routes.</p><a class="btn" href="transmissions.html">Open Rumble Network</a></article></div></section><section class="section wrap split">');
}
function strengthenSearchPage() {
  const indexFile = path.join(root, 'search-index.json');
  const searchFile = path.join(root, 'search.html');
  if (!fs.existsSync(indexFile) || !fs.existsSync(searchFile)) return;
  const items = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const wanted = ['as-above-so-below', 'elite-toolkit', 'cia', 'albanian-mafia', 'symbol', 'wwiii', 'identity-trap', 'black-file'];
  const fallback = wanted.map(key => items.find(item => item.key === key)).filter(Boolean);
  const cards = fallback.map(b => `<article class="card"><span class="label">${esc(b.category)}</span><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><a class="btn" href="${esc(b.url)}">Open Door</a></article>`).join('');
  let html = read('search.html');
  html = html.replace('<p class="lead">Search by title, topic, series, category, or keyword.</p>', '<p class="lead">Search by title, topic, series, category, or keyword. Strong fallback doors are visible even before the live search loads.</p>');
  html = html.replace('<p class="filter-count" id="search-count"></p><div class="grid" id="search-results"></div>', `<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">${cards}</div>`);
  write('search.html', replaceNav(removeVisibleKeywordPills(html)));
}
function rewriteSearchJs() {
  const file = path.join(root, 'search.js');
  if (!fs.existsSync(file)) return;
  const js = `(function(){const input=document.getElementById('archive-search'),results=document.getElementById('search-results'),count=document.getElementById('search-count');if(!input||!results)return;function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}function render(items){count.textContent=items.length+' archive door'+(items.length===1?'':'s')+' shown';results.innerHTML=items.map(b=>'<article class="card"><span class="label">'+esc(b.category)+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description)+'</p><a class="btn" href="'+esc(b.url)+'">Open Door</a></article>').join('');}fetch('search-index.json').then(r=>r.json()).then(data=>{function run(){const q=input.value.trim().toLowerCase();render(!q?data:data.filter(b=>[b.title,b.subtitle,b.series,b.category,b.description,(b.keywords||[]).join(' ')].join(' ').toLowerCase().includes(q)));}input.addEventListener('input',run);if(input.value.trim())run();}).catch(()=>{});})();`;
  fs.writeFileSync(file, js);
}

const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
for (const file of htmlFiles) {
  let html = replaceNav(removeVisibleKeywordPills(read(file)));
  if (file === 'index.html') html = cleanupHomepage(html);
  if (file === 'timers.html') html = cleanupTimers(html);
  if (file === 'news.html') html = cleanupNews(html);
  if (file === 'videos.html') html = cleanupVideos(html);
  write(file, html);
}
strengthenSearchPage();
rewriteSearchJs();
console.log(`Duplicate cleanup complete across ${htmlFiles.length} HTML files.`);
