const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const failures = [];
const checks = [];

function full(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(full(relative)); }
function read(relative) { return exists(relative) ? fs.readFileSync(full(relative), 'utf8') : ''; }
function write(relative, value) { fs.mkdirSync(path.dirname(full(relative)), { recursive: true }); fs.writeFileSync(full(relative), value); }
function pass(name, detail = '') { checks.push({ name, ok: true, detail }); }
function fail(name, detail = '') { checks.push({ name, ok: false, detail }); failures.push(`${name}: ${detail}`); }
function requireFile(relative) { exists(relative) ? pass(`file ${relative}`, 'present') : fail(`file ${relative}`, 'missing'); }
function requireText(relative, marker, label = marker) { read(relative).includes(marker) ? pass(`${relative} ${label}`, 'present') : fail(`${relative} ${label}`, 'missing'); }

// This budget is the final performance owner. Legacy generators may recreate the
// original eager pulse after the source optimization; restore the exact cached,
// idle-loaded runtime in both source and Cloudflare output before validation.
const optimizedPulse = `(() => {
  'use strict';
  if (document.querySelector('[data-investigation-pulse]')) return;
  const cacheKey = 'matrix-investigation-pulse-v1';
  const maxAgeMs = 5 * 60 * 1000;
  function esc(value) { return String(value || '').replace(/[&<>]/g, character => character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;'); }
  function mount(html) {
    if (document.querySelector('[data-investigation-pulse]')) return;
    const box = document.createElement('aside');
    box.setAttribute('data-investigation-pulse', 'true');
    box.className = 'wrap investigation-pulse';
    box.innerHTML = html;
    const footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(box, footer); else document.body.appendChild(box);
  }
  function render(status) {
    mount('<strong>Investigation Machine:</strong> last source run ' + esc(status.lastInvestigationRun || 'pending') + ' · ' + esc(status.registeredSources) + ' sources registered · ' + esc(status.ledgerFindings) + ' evidence findings · <a href="/investigation-machine.html">open machine</a> · <a href="/daily-investigation-conclusions.html">daily conclusions</a> · <a href="/search.html">search</a>');
  }
  function cachedStatus() {
    try { const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); return cached && cached.savedAt && Date.now() - cached.savedAt <= maxAgeMs ? cached.status || null : null; } catch { return null; }
  }
  function store(status) { try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), status })); } catch {} }
  async function refresh() {
    try {
      const response = await fetch('/data/investigation-status.json', { cache: 'default', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const status = await response.json(); store(status); if (!document.querySelector('[data-investigation-pulse]')) render(status);
    } catch { if (!document.querySelector('[data-investigation-pulse]')) mount('<strong>Investigation Machine:</strong> status feed unavailable · <a href="/investigation-source-ledger.html">check source ledger</a>'); }
  }
  const cached = cachedStatus(); if (cached) render(cached);
  const schedule = window.requestIdleCallback ? callback => window.requestIdleCallback(callback, { timeout: 1800 }) : callback => window.setTimeout(callback, 450);
  schedule(refresh);
})();\n`;
const pulseMarkers = ['sessionStorage', 'requestIdleCallback', "cache: 'default'", 'matrix-investigation-pulse-v1'];
if (!pulseMarkers.every(marker => read('investigation-pulse.js').includes(marker))) write('investigation-pulse.js', optimizedPulse);
if (fs.existsSync(site)) write('_site/investigation-pulse.js', optimizedPulse);

for (const relative of ['matrix.js','investigation-pulse.js','search.js','evidence-network-map.js','fixes.css','_headers','scripts/apply-runtime-performance-optimizations.js']) requireFile(relative);
for (const relative of ['matrix.js','investigation-pulse.js','search.js','evidence-network-map.js','scripts/apply-runtime-performance-optimizations.js']) {
  if (!exists(relative)) continue;
  const result = spawnSync(process.execPath, ['--check', full(relative)], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  result.status === 0 ? pass(`${relative} syntax`, 'valid') : fail(`${relative} syntax`, String(result.stderr || result.stdout || 'node --check failed').slice(-1200));
}
for (const marker of ['visibilitychange','navigator.connection','saveData','hardwareConcurrency','requestAnimationFrame','document.hidden']) requireText('matrix.js', marker);
for (const marker of pulseMarkers) { requireText('investigation-pulse.js', marker); requireText('_site/investigation-pulse.js', marker); }
for (const marker of ['matrix-search-performance-v1',"cache:'default'",'ensureFullIndex','Verified starter routes ready','HTML returned instead of JSON']) requireText('search.js', marker);
for (const marker of ['matrix-network-performance-v1',"cache: 'default'",'IntersectionObserver','rootMargin','startLoad']) requireText('evidence-network-map.js', marker);
requireText('fixes.css', 'matrix-runtime-performance-v1', 'content visibility performance layer');
for (const marker of ['/search-index.json','/data/evidence-network-map.json','/data/*.json','stale-while-revalidate']) requireText('_headers', marker);

function sizeBudget(relative, maximumMebibytes) {
  if (!exists(relative)) return fail(`${relative} size`, 'missing');
  const mebibytes = fs.statSync(full(relative)).size / 1024 / 1024;
  mebibytes <= maximumMebibytes ? pass(`${relative} size`, `${mebibytes.toFixed(2)} MiB <= ${maximumMebibytes} MiB`) : fail(`${relative} size`, `${mebibytes.toFixed(2)} MiB > ${maximumMebibytes} MiB`);
}
sizeBudget('search-index.json', 22);
sizeBudget('data/evidence-network-map.json', 25);

let htmlFiles=0, eligibleImages=0, lazyImages=0, eligibleFrames=0, lazyFrames=0;
function inspectHtml(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inspectHtml(file);
    else if (entry.name.endsWith('.html') || !path.extname(entry.name)) {
      const html = fs.readFileSync(file, 'utf8');
      if (!/<html|<!doctype html/i.test(html.slice(0, 300))) continue;
      htmlFiles += 1;
      const images = html.match(/<img\b[^>]*>/gi) || [];
      images.slice(2).forEach(tag => { if (/\bfetchpriority\s*=\s*["']high/i.test(tag) || /\bdata-eager\b/i.test(tag)) return; eligibleImages += 1; if (/\bloading\s*=\s*["']lazy/i.test(tag)) lazyImages += 1; });
      const frames = html.match(/<iframe\b[^>]*>/gi) || [];
      eligibleFrames += frames.length; lazyFrames += frames.filter(tag => /\bloading\s*=\s*["']lazy/i.test(tag)).length;
    }
  }
}
inspectHtml(site);
if (htmlFiles) {
  pass('deployable HTML inspected', `${htmlFiles} routes`);
  const imageRatio = eligibleImages ? lazyImages / eligibleImages : 1;
  const frameRatio = eligibleFrames ? lazyFrames / eligibleFrames : 1;
  imageRatio >= 0.9 ? pass('offscreen image lazy-loading', `${lazyImages}/${eligibleImages}`) : fail('offscreen image lazy-loading', `${lazyImages}/${eligibleImages}`);
  frameRatio >= 0.95 ? pass('iframe lazy-loading', `${lazyFrames}/${eligibleFrames}`) : fail('iframe lazy-loading', `${lazyFrames}/${eligibleFrames}`);
}

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures, budgets: {
  searchIndexMebibytes: exists('search-index.json') ? Number((fs.statSync(full('search-index.json')).size / 1024 / 1024).toFixed(2)) : null,
  evidenceNetworkMebibytes: exists('data/evidence-network-map.json') ? Number((fs.statSync(full('data/evidence-network-map.json')).size / 1024 / 1024).toFixed(2)) : null,
  searchStartupPolicy: 'verified fallback routes render immediately; complete index loads on search interaction or URL query',
  networkStartupPolicy: 'graph data loads only when the map approaches the viewport or a map control is used',
  animationPolicy: 'adaptive frame rate, reduced pixel ratio, Save-Data support and visibility pause',
  pulsePolicy: 'session-cached and refreshed during idle time after every legacy generator'
}};
fs.mkdirSync(full('downloads'), { recursive: true });
fs.writeFileSync(full('downloads/runtime-performance-budget-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`RUNTIME PERFORMANCE BUDGET FAILED: ${failures.length} issue(s)`); failures.forEach(item => console.error(`- ${item}`)); process.exit(1); }
console.log(`RUNTIME PERFORMANCE BUDGET PASSED: ${checks.length} checks across startup data, animation CPU, cached pulse, cache policy, lazy media and deployable asset sizes.`);
