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
  { files: ['schema-index.html', 'site-graph.json', 'claim-taxonomy.json', 'crawler-map.json'], script: 'build-phase13-schema-engine.js', label: 'Phase 13' }
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

const navLinks = [
  ['index.html', 'Home'], ['start-here.html', 'Start Here'], ['books.html', 'Books'],
  ['schema-index.html', 'Schema Index'], ['authority-hub.html', 'Authority Hub'], ['sales-ladder.html', 'Reader Paths'],
  ['book-universe.html', 'Book Universe'], ['conversion-funnel.html', 'Funnels'], ['trust-center.html', 'Trust Center'],
  ['distribution-center.html', 'Distribution'], ['update-monitor.html', 'Update Monitor'], ['answer-engine.html', 'AI Answers'],
  ['power-atlas.html', 'Power Atlas'], ['network-maps.html', 'Network Maps'], ['network-map-index.html', 'Map Index'],
  ['evidence-vault.html', 'Evidence Vault'], ['evidence-vault-index.html', 'Source Index'], ['news.html', 'Intel Desk'],
  ['forum.html', 'Signal Board'], ['search.html', 'Search'], ['timers.html', 'Timers'], ['videos.html', 'Videos'], ['black-file.html', 'Black File']
];
const canonicalNav = `<nav class="nav">${navLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav>`;
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html) { fs.writeFileSync(path.join(root, file), html); }
function replaceNav(html) { return html.replace(/<nav class="nav">[\s\S]*?<\/nav>/g, canonicalNav); }
function cleanEmptyPills(html) { return html.replace(/<p>(?:<span class="pill">[^<]+<\/span>\s*){2,}<\/p>/g, '').replace(/<p>\s*<\/p>/g, ''); }
function cleanupHomepage(html) {
  return html
    .replace(/<article class="card book-card"><div><div class="pill">Flagship Door<\/div><h3>D\.O\.G The Architect[\s\S]*?<\/article>/g, '')
    .replace(/Flagship Door/g, 'Primary Route');
}
function cleanupNewsDuplicates(html) {
  return html
    .replace(/<article class="card(?: redline)?">\s*<span class="figure-caption">Worldwide \/ latest sourced figure<\/span>[\s\S]*?<\/article>/g, '')
    .replace(/<span class="figure-caption">Worldwide \/ latest sourced figure<\/span>/g, '<span class="figure-caption">Dated sourced figure</span>');
}
function cleanupTimerRiskTerminal(html) {
  return html
    .replace(/SIGNALS INCREASING RISK/g, 'Risk Signal Lane')
    .replace(/<div class="terminal">\s*Risk Signal Lane[\s\S]*?Verified correction\s*<\/div>/g, '<div class="terminal">RISK SIGNAL LANE\n&gt; Dated signals only\n&gt; No repeated risk terminal\n&gt; Static page, not a live counter</div>')
    .replace(/(?:<div class="terminal">\s*RISK SIGNAL LANE[\s\S]*?not a live counter\s*<\/div>\s*){2,}/g, '<div class="terminal">RISK SIGNAL LANE\n&gt; Dated signals only\n&gt; No repeated risk terminal\n&gt; Static page, not a live counter</div>');
}
function cleanupVideoRoutes(html) { return html.replace(/Rumble Channel Routes/g, 'Video Production Map'); }
function safeSearchJs() {
  return `(function(){const input=document.getElementById('archive-search'),results=document.getElementById('search-results'),count=document.getElementById('search-count');if(!input||!results)return;function esc(s){return String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}function render(items){count.textContent=items.length+' archive door'+(items.length===1?'':'s')+' shown';results.innerHTML=items.map(b=>'<article class="card"><span class="label">'+esc(b.category||'Archive')+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description||b.subtitle||'')+'</p><a class="btn" href="'+esc(b.url)+'">Open Door</a></article>').join('');}fetch('search-index.json').then(r=>r.json()).then(data=>{function run(){const q=input.value.trim().toLowerCase();render(!q?data:data.filter(b=>[b.title,b.subtitle,b.series,b.category,b.description,(b.keywords||[]).join(' ')].join(' ').toLowerCase().includes(q)));}input.addEventListener('input',run);if(input.value.trim())run();}).catch(()=>{});})();`;
}

const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
for (const file of htmlFiles) {
  let html = cleanEmptyPills(replaceNav(read(file)));
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
  let html = read('search.html');
  if (!html.includes('Showing the strongest entry points')) {
    html = html.replace('<p class="filter-count" id="search-count"></p><div class="grid" id="search-results"></div>', `<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">${fallback}</div>`);
  }
  write('search.html', replaceNav(html));
}
write('search.js', safeSearchJs());
console.log(`Duplicate cleanup complete across ${htmlFiles.length} HTML files.`);
