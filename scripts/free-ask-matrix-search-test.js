const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function exists(name) { return fs.existsSync(path.join(root, name)); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function forbid(name, text) { if (exists(name) && read(name).toLowerCase().includes(text.toLowerCase())) issues.push(`${name} contains forbidden paid/external marker: ${text}`); }
function tokens(q) { return String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean); }
function hay(item) { return [item.title, item.category, item.layer, item.description, Array.isArray(item.keywords) ? item.keywords.join(' ') : item.keywords].join(' ').toLowerCase(); }
function score(item, query) {
  const ts = tokens(query);
  const h = hay(item);
  let s = Number(item.priority || 0) / 4;
  for (const t of ts) {
    if (String(item.title || '').toLowerCase().includes(t)) s += 22;
    if (String(item.category || '').toLowerCase().includes(t)) s += 12;
    if (String(item.layer || '').toLowerCase().includes(t)) s += 10;
    if (h.includes(t)) s += 4;
  }
  if (h.includes(String(query).toLowerCase())) s += 30;
  return s;
}
function top(index, query) { return index.slice().map(i => ({...i, _score: score(i, query)})).sort((a, b) => b._score - a._score).slice(0, 5); }
for (const name of ['search.html', 'search.js', 'search-index.json', 'scripts/build-free-ask-matrix-search.js']) needFile(name);
needText('search.html', 'SEARCH THE MACHINE.');
needText('search.html', 'Search V2');
needText('search.html', 'control-structure.html');
needText('search.html', 'data-living-pulse');
needText('search.html', '<script src="search.js"></script>');
needText('search.html', '<script src="living-pulse.js"></script>');
needText('search.js', 'SEARCH V2');
needText('search.js', '/search-index.json');
needText('search.js', 'layerMap');
needText('search.js', 'control-structure.html');
needText('search.js', 'evidence-vault.html');
needText('scripts/build-free-ask-matrix-search.js', 'coreJson');
needText('scripts/build-free-ask-matrix-search.js', 'control-structure.html');
needText('scripts/build-free-ask-matrix-search.js', 'missionRoutes');
needText('scripts/build-free-ask-matrix-search.js', 'priorityRoutes');
for (const name of ['search.html', 'search.js', 'scripts/build-free-ask-matrix-search.js']) {
  for (const bad of ['api.openai.com', 'workers-ai', 'ai-gateway', 'OPENAI_API_KEY', 'CLOUDFLARE_API_TOKEN', '@cf/']) forbid(name, bad);
}
if (exists('search-index.json')) {
  const index = JSON.parse(read('search-index.json'));
  if (!Array.isArray(index) || index.length < 40) issues.push('search-index.json should contain at least 40 routes after Search V2');
  for (const route of ['control-structure.html','daily-brain-brief.html','matrix-brain.html','outcome-briefings.html','epstein-files.html','policy-watch.html','gold-reserve-tracker.html','speculation-review.html','evidence-vault.html','books.html','newsletter.html','data/daily-brain-brief.json','data/control-structure-core.json']) {
    if (!index.some(item => item.url === route)) issues.push(`search-index.json missing Search V2 route ${route}`);
  }
  for (const item of index) {
    if (!item.title || !item.url) issues.push('search-index.json contains route without title/url');
    if (item.url && /^https?:\/\//i.test(item.url)) issues.push(`search-index.json should use local route, not external URL: ${item.url}`);
    if (!item.layer && !item.category) issues.push(`search-index.json route lacks layer/category: ${item.url}`);
  }
  const queryExpectations = [
    ['control structure', ['control-structure.html']],
    ['gold custody audit vault', ['gold-reserve-tracker.html','gold.html','data/gold-reserves-worldwide.json']],
    ['epstein redaction withheld court files', ['epstein-files.html','trigger-watchtower.html','record-intake-queue.html']],
    ['agenda 2030 digital identity wallet access', ['agenda-2030.html','policy-watch.html','convergence-hypotheses.html']],
    ['billionaire infrastructure policy influence foundation', ['billionaire-watch.html','power-atlas.html']],
    ['speculation source chain counter source', ['speculation-review.html','dark-speculation-lab.html']]
  ];
  for (const [query, acceptable] of queryExpectations) {
    const urls = top(index, query).map(i => i.url);
    if (!urls.some(u => acceptable.includes(u))) issues.push(`Search V2 weak result for "${query}". Top URLs: ${urls.join(', ')}`);
  }
}
if (issues.length) {
  console.error('SEARCH V2 TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('SEARCH V2 TEST PASSED');
console.log('Checked brain-aware search, mission-route boosting, JSON feed indexing, control layers, live pulse integration, local-only search, and real user query expectations.');
