const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const canonicalNav = `<nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="power-atlas.html">Power Atlas</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a><a href="news.html">Intel Desk</a><a href="search.html">Search</a><a href="timers.html">Timers</a><a href="videos.html">Videos</a><a href="black-file.html">Black File</a></nav>`;

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html) { fs.writeFileSync(path.join(root, file), html); }
function replaceNav(html) { return html.replace(/<nav class="nav">[\s\S]*?<\/nav>/g, canonicalNav); }
function removeVisibleKeywordPills(html) {
  return html
    .replace(/<p>(?:<span class="pill">[^<]+<\/span>\s*){2,}<\/p>/g, '')
    .replace(/<p>\s*<\/p>/g, '');
}
function removeTimerRepeats(html) {
  return html.replace(/<div class="terminal">SIGNALS INCREASING RISK[\s\S]*?Verified correction<\/div>/g, '<p><span class="pill">Unique signal lane</span></p>');
}
function removeHumanCostDuplicateCards(html) {
  return html
    .replace(/<div class="grid">\s*(?:<article class="card(?: redline)?"><span class="figure-caption">Worldwide \/ latest sourced figure<\/span>[\s\S]*?<\/article>\s*)+<\/div>/g, '')
    .replace(/<p class="lead">War, migration, exploitation, medicine, policy, and criminal networks have human cost\. These panels use sourced, dated figures only\. They do not display fake live counters or unverifiable global totals\.<\/p>/, '<p class="lead">War, migration, exploitation, medicine, policy, and criminal networks have human cost. Each sourced figure appears once here, without fake live counters or duplicate cards.</p>');
}
function cleanupHomepage(html) {
  html = html.replace(/<p class="lead">The strongest entry points now pull from the upgraded archive: D\.O\.G, Elite Toolkit, CIA, Crime Dossiers, SYMBOL, and WWIII\.<\/p>/, '<p class="lead">The strongest entry points after the flagship: Elite Toolkit, CIA, Crime Dossiers, SYMBOL, and WWIII. The flagship stays above, so the same door is not repeated.</p>');
  html = html.replace(/<article class="card book-card"><div><div class="pill">Flagship Door<\/div><h3>D\.O\.G The Architect[\s\S]*?<\/article>/, '');
  html = html.replace(/<p><a class="btn" href="book-as-above-so-below\.html">D\.O\.G The Architect[\s\S]*?<\/a><\/p>/, '');
  html = html.replace('Reader paths now map to live books.', 'Reader paths now branch without repeating the flagship.');
  return html;
}
function cleanupVideos(html) {
  if (!/Rumble Channel Routes/.test(html)) return html;
  return html.replace(/<section class="section wrap"><h2>Rumble Channel Routes<\/h2>[\s\S]*?<\/section>\s*<section class="section wrap split">/, '<section class="section wrap"><h2>Video Production Map</h2><p class="lead">This page now covers formats and publishing rules only. The full channel directory lives on the Rumble network page, so the same channel cards are not duplicated.</p><div class="grid"><article class="card"><span class="label">Format</span><h3>60-Second Intel Drop</h3><p>Hook, source, evidence label, interpretation, and one archive path.</p></article><article class="card"><span class="label">Format</span><h3>3-Minute Dark Explainer</h3><p>A cinematic dossier breakdown for court files, releases, sanctions, war lanes, and public-record signals.</p></article><article class="card redline"><span class="label">Directory</span><h3>Rumble Channels</h3><p>Open the channel network when you need the external broadcast routes.</p><a class="btn" href="transmissions.html">Open Rumble Network</a></article></div></section><section class="section wrap split">');
}
function strengthenSearchPage() {
  const indexFile = path.join(root, 'search-index.json');
  if (!fs.existsSync(indexFile) || !fs.existsSync(path.join(root, 'search.html'))) return;
  const items = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const wanted = ['as-above-so-below', 'elite-toolkit', 'cia', 'albanian-mafia', 'symbol', 'wwiii', 'identity-trap', 'black-file'];
  const fallback = wanted.map(key => items.find(item => item.key === key)).filter(Boolean);
  const cards = fallback.map(b => `<article class="card"><span class="label">${esc(b.category)}</span><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><a class="btn" href="${esc(b.url)}">Open Door</a></article>`).join('');
  let html = read('search.html');
  html = html.replace('<p class="lead">Search by title, topic, series, category, or keyword.</p>', '<p class="lead">Search by title, topic, series, category, or keyword. Strong fallback doors are visible even before the live search loads.</p>');
  html = html.replace('<p class="filter-count" id="search-count"></p><div class="grid" id="search-results"></div>', `<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">${cards}</div>`);
  html = replaceNav(removeVisibleKeywordPills(html));
  write('search.html', html);
}
function rewriteSearchJs() {
  const file = path.join(root, 'search.js');
  if (!fs.existsSync(file)) return;
  const js = `(function(){const input=document.getElementById('archive-search'),results=document.getElementById('search-results'),count=document.getElementById('search-count');if(!input||!results)return;function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}function render(items){count.textContent=items.length+' archive door'+(items.length===1?'':'s')+' shown';results.innerHTML=items.map(b=>'<article class="card"><span class="label">'+esc(b.category)+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description)+'</p><a class="btn" href="'+esc(b.url)+'">Open Door</a></article>').join('');}fetch('search-index.json').then(r=>r.json()).then(data=>{function run(){const q=input.value.trim().toLowerCase();render(!q?data:data.filter(b=>[b.title,b.subtitle,b.series,b.category,b.description,(b.keywords||[]).join(' ')].join(' ').toLowerCase().includes(q)));}input.addEventListener('input',run);if(input.value.trim())run();}).catch(()=>{});})();`;
  fs.writeFileSync(file, js);
}

for (const file of htmlFiles) {
  let html = read(file);
  html = replaceNav(html);
  html = removeVisibleKeywordPills(html);
  if (file === 'index.html') html = cleanupHomepage(html);
  if (file === 'timers.html') html = removeTimerRepeats(html);
  if (file === 'news.html') html = removeHumanCostDuplicateCards(html);
  if (file === 'videos.html') html = cleanupVideos(html);
  write(file, html);
}
strengthenSearchPage();
rewriteSearchJs();
console.log(`Duplicate cleanup complete across ${htmlFiles.length} HTML files.`);
