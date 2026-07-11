const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const checks = [];

function pass(name, detail = '') { checks.push({ name, ok: true, detail }); }
function fail(name, detail = '') { checks.push({ name, ok: false, detail }); failures.push(`${name}: ${detail}`); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function words(query) {
  const stop = new Set('the and for with what where when why how does into from that this show about latest update updates are all site page pages tell me'.split(' '));
  return String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 1 && !stop.has(word));
}
function keys(item) { return Array.isArray(item.keywords) ? item.keywords : String(item.keywords || '').split(/[, ]+/).filter(Boolean); }
function hay(item) { return [item.title, item.category, item.layer, item.description, keys(item).join(' ')].join(' ').toLowerCase(); }
function score(item, tokens, query) {
  const text = hay(item);
  let value = Number(item.priority || 0) / 4;
  for (const token of tokens) {
    if (String(item.title || '').toLowerCase().includes(token)) value += 22;
    if (String(item.category || '').toLowerCase().includes(token)) value += 12;
    if (String(item.layer || '').toLowerCase().includes(token)) value += 10;
    if (keys(item).join(' ').toLowerCase().includes(token)) value += 14;
    if (text.includes(token)) value += 4;
  }
  if (query && text.includes(String(query).toLowerCase())) value += 30;
  return value;
}
function ranked(index, query) {
  const tokens = words(query);
  return index.map(item => ({ ...item, _score: score(item, tokens, query) }))
    .filter(item => item._score > Number(item.priority || 0) / 4)
    .sort((a, b) => b._score - a._score || String(a.title).localeCompare(String(b.title)))
    .slice(0, 20);
}
function testIndex(index, label) {
  if (!Array.isArray(index)) { fail(`${label} index type`, 'not an array'); return; }
  if (index.length < 100) fail(`${label} index size`, `only ${index.length} entries`); else pass(`${label} index size`, `${index.length} entries`);
  const urls = index.map(item => item && item.url).filter(Boolean);
  const duplicates = urls.filter((url, i) => urls.indexOf(url) !== i);
  if (duplicates.length) fail(`${label} unique URLs`, `${new Set(duplicates).size} duplicate URLs`); else pass(`${label} unique URLs`, `${urls.length} unique routes`);
  const required = ['investigation-machine.html', 'daily-investigation-conclusions.html', 'weekly-investigation-report.html', 'investigation-source-ledger.html', 'epstein-files.html', 'evidence-vault.html'];
  for (const url of required) index.some(item => item.url === url) ? pass(`${label} route ${url}`) : fail(`${label} route ${url}`, 'missing');
  const queries = [
    { query: 'corruption bribery fraud official enforcement', expected: /investigation-machine|daily-investigation-conclusions|government-enforcement/ },
    { query: 'WikiLeaks documents cables archive', expected: /investigation-source-ledger|investigation-machine|evidence-vault/ },
    { query: 'government contracts USAspending procurement', expected: /investigation-source-ledger|investigation-machine|private-contractor/ },
    { query: 'Epstein DOJ disclosures redactions', expected: /epstein|investigation-source-ledger|daily-investigation/ },
    { query: 'SEC filings ownership enforcement', expected: /investigation|sec|evidence|blackrock/ }
  ];
  for (const test of queries) {
    const results = ranked(index, test.query);
    const routeText = results.map(item => `${item.url} ${item.layer} ${item.title}`).join(' ');
    if (!results.length) fail(`${label} query ${test.query}`, 'zero results');
    else if (!test.expected.test(routeText)) fail(`${label} query ${test.query}`, `expected route absent from top ${results.length}: ${results.slice(0, 5).map(item => item.url).join(', ')}`);
    else pass(`${label} query ${test.query}`, results.slice(0, 3).map(item => item.url).join(', '));
  }
}

for (const file of ['search.html', 'search.js', 'search-index.json']) {
  if (!fs.existsSync(path.join(root, file))) fail(`local ${file}`, 'missing'); else pass(`local ${file}`, 'present');
}

let localIndex = [];
if (fs.existsSync(path.join(root, 'search-index.json'))) {
  try { localIndex = JSON.parse(read('search-index.json')); pass('local index JSON', 'valid'); }
  catch (error) { fail('local index JSON', error.message); }
}
if (fs.existsSync(path.join(root, 'search.html'))) {
  const html = read('search.html');
  for (const marker of ['id="archive-search"', 'id="search-results"', 'id="search-count"', 'src="search.js"']) html.includes(marker) ? pass(`search.html marker ${marker}`) : fail(`search.html marker ${marker}`, 'missing');
  if (/data-q="corruption bribery fraud official enforcement"/.test(html)) pass('investigation shortcut', 'present'); else fail('investigation shortcut', 'missing');
}
if (fs.existsSync(path.join(root, 'search.js'))) {
  const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'search.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (syntax.status === 0) pass('search.js syntax', 'valid'); else fail('search.js syntax', syntax.stderr || syntax.stdout || 'node --check failed');
  const js = read('search.js');
  for (const marker of ['/search-index.json', 'investigationQueryPrefill', 'init(fallbackIndex)', 'HTML returned instead of JSON']) js.includes(marker) ? pass(`search.js marker ${marker}`) : fail(`search.js marker ${marker}`, 'missing');
}
testIndex(localIndex, 'local');

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'MatrixSearchSmokeTest/1.0', accept: 'text/html,application/json,*/*' } });
    return { response, text: await response.text() };
  } finally { clearTimeout(timer); }
}

async function liveTest() {
  const base = String(process.env.SITE_URL || '').replace(/\/$/, '');
  if (!base || String(process.env.SEARCH_TEST_LIVE || '').toLowerCase() !== 'true') return;
  const page = await fetchText(`${base}/search`);
  if (page.response.ok && page.text.includes('id="archive-search"') && page.text.includes('search.js')) pass('live search page', `HTTP ${page.response.status}`); else fail('live search page', `HTTP ${page.response.status}; required markers missing`);
  const script = await fetchText(`${base}/search.js`);
  if (script.response.ok && script.text.includes('/search-index.json') && script.text.includes('investigationQueryPrefill')) pass('live search.js', `HTTP ${script.response.status}`); else fail('live search.js', `HTTP ${script.response.status}; runtime markers missing`);
  const indexResponse = await fetchText(`${base}/search-index.json`);
  let index = [];
  try { index = JSON.parse(indexResponse.text); } catch (error) { fail('live search index JSON', error.message); return; }
  if (indexResponse.response.ok) pass('live search index HTTP', `HTTP ${indexResponse.response.status}`); else fail('live search index HTTP', `HTTP ${indexResponse.response.status}`);
  testIndex(index, 'live');
}

liveTest().then(() => {
  const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
  fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'downloads', 'search-investigation-smoke-test.json'), JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error(`SEARCH INVESTIGATION SMOKE TEST FAILED: ${failures.length} failure(s)`);
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
  }
  console.log(`Search investigation smoke test passed: ${checks.length} checks across UI, runtime, index and investigation queries.`);
}).catch(error => {
  console.error(`Search investigation smoke test failed: ${error.stack || error.message}`);
  process.exit(1);
});
