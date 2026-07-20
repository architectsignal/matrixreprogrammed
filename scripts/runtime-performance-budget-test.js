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
function pass(name, detail = '') { checks.push({ name, ok: true, detail }); }
function fail(name, detail = '') { checks.push({ name, ok: false, detail }); failures.push(`${name}: ${detail}`); }
function requireFile(relative) { exists(relative) ? pass(`file ${relative}`, 'present') : fail(`file ${relative}`, 'missing'); }
function requireText(relative, marker, label = marker) { read(relative).includes(marker) ? pass(`${relative} ${label}`, 'present') : fail(`${relative} ${label}`, 'missing'); }

for (const relative of [
  'matrix.js',
  'investigation-pulse.js',
  'search.js',
  'evidence-network-map.js',
  'fixes.css',
  '_headers',
  'scripts/apply-runtime-performance-optimizations.js'
]) requireFile(relative);

for (const relative of ['matrix.js', 'investigation-pulse.js', 'search.js', 'evidence-network-map.js', 'scripts/apply-runtime-performance-optimizations.js']) {
  if (!exists(relative)) continue;
  const result = spawnSync(process.execPath, ['--check', full(relative)], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (result.status === 0) pass(`${relative} syntax`, 'valid');
  else fail(`${relative} syntax`, String(result.stderr || result.stdout || 'node --check failed').slice(-1200));
}

for (const marker of ['visibilitychange', 'navigator.connection', 'saveData', 'hardwareConcurrency', 'requestAnimationFrame', 'document.hidden']) requireText('matrix.js', marker, marker);
for (const marker of ['sessionStorage', 'requestIdleCallback', "cache: 'default'", 'matrix-investigation-pulse-v1']) requireText('investigation-pulse.js', marker, marker);
for (const marker of ['matrix-search-performance-v1', "cache:'default'", 'ensureFullIndex', 'Verified starter routes ready', 'HTML returned instead of JSON']) requireText('search.js', marker, marker);
for (const marker of ['matrix-network-performance-v1', "cache: 'default'", 'IntersectionObserver', 'rootMargin', 'startLoad']) requireText('evidence-network-map.js', marker, marker);
requireText('fixes.css', 'matrix-runtime-performance-v1', 'content visibility performance layer');
for (const marker of ['/search-index.json', '/data/evidence-network-map.json', '/data/*.json', 'stale-while-revalidate']) requireText('_headers', marker, marker);

function sizeBudget(relative, maximumMebibytes) {
  if (!exists(relative)) return fail(`${relative} size`, 'missing');
  const bytes = fs.statSync(full(relative)).size;
  const mebibytes = bytes / 1024 / 1024;
  if (mebibytes <= maximumMebibytes) pass(`${relative} size`, `${mebibytes.toFixed(2)} MiB <= ${maximumMebibytes} MiB`);
  else fail(`${relative} size`, `${mebibytes.toFixed(2)} MiB > ${maximumMebibytes} MiB`);
}
sizeBudget('search-index.json', 22);
sizeBudget('data/evidence-network-map.json', 25);

let htmlFiles = 0;
let eligibleImages = 0;
let lazyImages = 0;
let eligibleFrames = 0;
let lazyFrames = 0;
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
      images.slice(2).forEach(tag => {
        if (/\bfetchpriority\s*=\s*["']high/i.test(tag) || /\bdata-eager\b/i.test(tag)) return;
        eligibleImages += 1;
        if (/\bloading\s*=\s*["']lazy/i.test(tag)) lazyImages += 1;
      });
      const frames = html.match(/<iframe\b[^>]*>/gi) || [];
      eligibleFrames += frames.length;
      lazyFrames += frames.filter(tag => /\bloading\s*=\s*["']lazy/i.test(tag)).length;
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

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  budgets: {
    searchIndexMebibytes: exists('search-index.json') ? Number((fs.statSync(full('search-index.json')).size / 1024 / 1024).toFixed(2)) : null,
    evidenceNetworkMebibytes: exists('data/evidence-network-map.json') ? Number((fs.statSync(full('data/evidence-network-map.json')).size / 1024 / 1024).toFixed(2)) : null,
    searchStartupPolicy: 'verified fallback routes render immediately; complete index loads on search interaction or URL query',
    networkStartupPolicy: 'graph data loads only when the map approaches the viewport or a map control is used',
    animationPolicy: 'adaptive frame rate, reduced pixel ratio, Save-Data support and visibility pause'
  }
};
fs.mkdirSync(full('downloads'), { recursive: true });
fs.writeFileSync(full('downloads/runtime-performance-budget-test.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`RUNTIME PERFORMANCE BUDGET FAILED: ${failures.length} issue(s)`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`RUNTIME PERFORMANCE BUDGET PASSED: ${checks.length} checks across startup data, animation CPU, cache policy, lazy media and deployable asset sizes.`);
