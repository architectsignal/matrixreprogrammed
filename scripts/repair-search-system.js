const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const repairs = [];
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }

const SEARCH_V2_REQUIRED = [
  'SEARCH V2',
  '/search-index.json',
  'layerMap',
  'control-structure.html',
  'evidence-vault.html'
];

function searchV2Missing(){
  if (!exists('search.js')) return SEARCH_V2_REQUIRED.slice();
  const js = read('search.js');
  return SEARCH_V2_REQUIRED.filter(marker => !js.includes(marker));
}

function rebuildSearchV2(reason){
  const builder = fp('scripts/build-free-ask-matrix-search.js');
  if (!fs.existsSync(builder)) return false;
  const result = spawnSync(process.execPath, [builder], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  repairs.push({
    type: 'search-v2-regenerated',
    reason,
    status: result.status === 0 ? 'ok' : 'failed',
    stdout: String(result.stdout || '').slice(0, 500),
    stderr: String(result.stderr || '').slice(0, 500)
  });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    process.exit(result.status || 1);
  }
  return true;
}

const coreRoutes = [
  ['control-structure.html','Control Structure Map','Main Mission'],
  ['daily-brain-brief.html','Daily Brain Brief','Living Brain'],
  ['matrix-brain.html','Matrix Brain','Living Brain'],
  ['outcome-briefings.html','Outcome Briefings','Finished Intelligence'],
  ['evidence-vault.html','Evidence Vault','Evidence'],
  ['epstein-files.html','Disclosure Files','Disclosure'],
  ['policy-watch.html','Policy Watch','Policy'],
  ['gold-reserve-tracker.html','Gold Reserve Tracker','Reserves'],
  ['speculation-review.html','Speculation Review','Review'],
  ['books.html','Books','Books'],
  ['newsletter.html','Newsletter','Free Brief'],
  ['downloads/forum-posts.json','Forum Posts Export','Machine Data'],
  ['downloads/forum-posts.md','Forum Posts Markdown','Download'],
  ['data/daily-brain-brief.json','Daily Brain Brief JSON','Machine Data'],
  ['data/control-structure-core.json','Control Structure Core JSON','Machine Data'],
  ['power-entities.html','Power Entity Engine','Entity Intelligence'],
  ['system-fusion-core.html','System Fusion Core','Living Brain'],
  ['data/entities.json','Power Entities JSON','Machine Data'],
  ['data/system-fusion-core.json','System Fusion Core JSON','Machine Data']
];

const firstMissing = searchV2Missing();
if (firstMissing.length) rebuildSearchV2('search.js missing final Search V2 markers before compatibility repair: ' + firstMissing.join(', '));

if (exists('search-index.json')) {
  let index;
  try { index = JSON.parse(read('search-index.json')); } catch { index = []; }
  if (!Array.isArray(index)) index = [];
  const byUrl = new Map(index.filter(x => x && x.url).map(x => [x.url, x]));
  for (const [url, title, category] of coreRoutes) {
    if (!byUrl.has(url)) {
      byUrl.set(url, { url, title, category, description: 'Core Matrix Reprogrammed search route.', keywords: [title, category], priority: 75 });
      repairs.push('route:' + url);
    }
  }
  write('search-index.json', JSON.stringify([...byUrl.values()], null, 2));
}

if (exists('search.html')) {
  let html = read('search.html');
  const before = html;
  if (!html.includes('Showing the strongest entry points')) {
    html = html.replace('Loading brain-aware index...', 'Showing the strongest entry points. Type above to filter the full archive.');
    if (!html.includes('Showing the strongest entry points') && html.includes('id="search-results"')) {
      html = html.replace('<div class="grid" id="search-results">', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">');
    }
    repairs.push('fallback-copy');
  }
  if (!html.includes('id="phase-twelve-authority-engine"')) {
    const block = '<section id="phase-twelve-authority-engine" class="section wrap"><h2>Authority / Internal Link Engine</h2><p class="lead">Search connects the control map, daily brief, evidence lanes, books, downloads and newsletter.</p><div class="cta-row"><a class="btn" href="authority-hub.html">Authority Hub</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="books.html">Books</a></div></section>';
    html = html.includes('</main>') ? html.replace('</main>', block + '</main>') : html + block;
    repairs.push('authority-anchor');
  }
  if (!html.includes('<script src="search.js"></script>') && html.includes('</body>')) { html = html.replace('</body>', '<script src="search.js"></script></body>'); repairs.push('script-link'); }
  if (html !== before) write('search.html', html);
}

fs.mkdirSync(fp('downloads'), { recursive: true });

const finalMissing = searchV2Missing();
if (finalMissing.length) {
  rebuildSearchV2('final Search V2 marker check failed after compatibility repair: ' + finalMissing.join(', '));
}
const stillMissing = searchV2Missing();
if (stillMissing.length) {
  console.error('SEARCH V2 REPAIR FAILED');
  for (const marker of stillMissing) console.error('- final search.js missing ' + marker);
  process.exit(1);
}

write('downloads/search-system-repair-report.json', JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), repairs, mode: 'Search V2 final compatibility repair and overwrite guard' }, null, 2));
console.log('Search system repair complete: ' + repairs.length + ' repair(s). Search V2 final guard passed.');
