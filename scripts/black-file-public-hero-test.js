'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const finalizer = path.join(repositoryRoot, 'scripts', 'finalize-black-file-public-hero.js');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-black-file-hero-'));

function write(relative, content) {
  const file = path.join(temporaryRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(relative) {
  return fs.readFileSync(path.join(temporaryRoot, relative), 'utf8');
}
function digest(relative) {
  return crypto.createHash('sha256').update(read(relative)).digest('hex');
}
function count(value, expression) {
  return (String(value || '').match(expression) || []).length;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function runFinalizer() {
  const result = spawnSync(process.execPath, [finalizer], {
    cwd: temporaryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Black File hero finalizer exited ${result.status}.`);
}
function verifySurfaces(expectedBoundary = null) {
  const surfaces = ['black-file.html', '_site/black-file.html', '_site/black-file'];
  const sourceHash = digest('black-file.html');
  for (const relative of surfaces) {
    const html = read(relative);
    assert(digest(relative) === sourceHash,
      `${relative} is not byte-identical to the canonical source.`);
    assert(count(html, /<h1\b/gi) === 1,
      `${relative} does not contain exactly one H1.`);
    assert(count(html, /<section\b[^>]*class=["'][^"']*\bhero\b[^"']*["']/gi) === 1,
      `${relative} does not contain exactly one hero.`);
    assert(count(html, /<!--\s*black-file-public-hero:start\s*-->/gi) === 1,
      `${relative} lacks one start marker.`);
    assert(count(html, /<!--\s*black-file-public-hero:end\s*-->/gi) === 1,
      `${relative} lacks one end marker.`);
    assert(/<h1>THE BLACK FILE<\/h1>/i.test(html),
      `${relative} lacks the canonical H1.`);
    assert(/id=["']black-file-public-lead["']/i.test(html),
      `${relative} lacks the canonical lead marker.`);
    assert(/href=["']#request["']/i.test(html),
      `${relative} lacks the request CTA.`);
    assert(/id=["']request["']/i.test(html),
      `${relative} lost the request target.`);
    assert(html.includes('downstream-records'),
      `${relative} lost downstream archive content.`);
  }
  const report = JSON.parse(read('downloads/black-file-public-hero-finalization.json'));
  assert(report.ok === true, 'Black File hero report is not healthy.');
  assert(report.fallbackInsertionSupported === true,
    'Black File report does not certify fallback insertion.');
  assert(report.surfaces.length === 3,
    `Expected three finalized surfaces; found ${report.surfaces.length}.`);
  assert(report.surfaces.every(surface => surface.sha256 === report.sourceSha256),
    'Report contains surface hash drift.');
  if (expectedBoundary) {
    assert(report.sourceInsertionBoundary === expectedBoundary,
      `Expected insertion boundary ${expectedBoundary}; found ${report.sourceInsertionBoundary}.`);
  }
  return surfaces;
}

const damagedSource = '<!doctype html><html><head><title>Black File</title></head><body><main><section class="hero wrap"><div class="eyebrow">Damaged hero</div><p>No H1 remains.</p></section><section class="section wrap split"><aside id="request"><h2>Request</h2><form><input name="email"></form></aside></section><section id="downstream-records"><h2>Records</h2><p>Preserve downstream evidence and archive content.</p></section><!-- cinematic-pathways:start --><section class="matrix-pathways" aria-labelledby="matrix-pathways-title-black-file"><section class="matrix-pathways-head"><h2 id="matrix-pathways-title-black-file">Pathway</h2></section><section class="matrix-pathways-boundary">Preserve the pathway.</section></section><!-- cinematic-pathways:end --></main><footer>Footer</footer></body></html>';
const damagedOutput = '<!doctype html><html><head><title>Black File</title></head><body><main><section class="section"><aside id="request"><h2>Request</h2></aside></section><section id="downstream-records"><h2>Records</h2></section></main></body></html>';
const duplicateOutput = '<!doctype html><html><body><main><!-- black-file-public-hero:start --><section class="hero wrap" data-black-file-public-hero="old"><h1>OLD BLACK FILE</h1></section><!-- black-file-public-hero:end --><section class="hero"><h1>DUPLICATE</h1></section><section><aside id="request"></aside></section><section id="downstream-records"><p>Keep me.</p></section></main></body></html>';
const untouched = '<!doctype html><html><body><main><h1>Unrelated page</h1></main></body></html>';

try {
  write('black-file.html', damagedSource);
  write('_site/black-file.html', damagedOutput);
  write('_site/black-file', duplicateOutput);
  write('unrelated.html', untouched);

  runFinalizer();
  verifySurfaces('main-open');
  assert(read('black-file.html').includes('matrix-pathways-boundary'),
    'Source pathway content was removed.');
  assert(read('black-file.html').includes('Preserve downstream evidence and archive content.'),
    'Source evidence content was removed.');
  assert(read('unrelated.html') === untouched, 'An unrelated page was modified.');

  // Reproduce the broad-build failure: a late legacy transformation removes only
  // the main wrapper while leaving the body, request target, pathways and records.
  const lateNoMain = read('black-file.html')
    .replace(/<\/?main\b[^>]*>/gi, '')
    .replace(/<!--\s*black-file-public-hero:start\s*-->[\s\S]*?<!--\s*black-file-public-hero:end\s*-->/i, '');
  assert(!/<main\b/i.test(lateNoMain), 'Late-build fixture still contains a main element.');
  assert(/<body\b/i.test(lateNoMain), 'Late-build fixture lacks its body fallback boundary.');
  write('black-file.html', lateNoMain);
  write('_site/black-file.html', '<!doctype html><html><body><section id="request"></section><section id="downstream-records"></section></body></html>');
  write('_site/black-file', '<!doctype html><html><body><section class="hero"><h1>STALE</h1></section><section id="request"></section><section id="downstream-records"></section></body></html>');

  runFinalizer();
  const surfaces = verifySurfaces('body-open');
  assert(!/<main\b/i.test(read('black-file.html')),
    'Fallback finalization invented a main wrapper instead of using the body boundary.');
  assert(read('black-file.html').includes('matrix-pathways-boundary'),
    'No-main finalization removed pathway content.');
  assert(read('black-file.html').includes('Preserve downstream evidence and archive content.'),
    'No-main finalization removed downstream evidence content.');

  const firstHashes = Object.fromEntries(
    [...surfaces, 'unrelated.html'].map(relative => [relative, digest(relative)])
  );
  runFinalizer();
  for (const [relative, expected] of Object.entries(firstHashes)) {
    assert(digest(relative) === expected,
      `${relative} changed across repeated fallback finalization.`);
  }

  console.log('BLACK FILE PUBLIC HERO TEST PASSED');
  console.log('One canonical H1 survives ordinary and no-main late-build documents without losing request, pathway or downstream archive content.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
