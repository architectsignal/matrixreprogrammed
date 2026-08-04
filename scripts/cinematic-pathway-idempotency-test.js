const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const finalizer = path.join(repositoryRoot, 'scripts', 'finalize-cinematic-pathway-ids.js');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-cinematic-pathways-'));

function write(relative, content) {
  const file = path.join(temporaryRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(relative) { return fs.readFileSync(path.join(temporaryRoot, relative), 'utf8'); }
function hash(relative) { return crypto.createHash('sha256').update(read(relative)).digest('hex'); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function count(source, expression) { return (source.match(expression) || []).length; }
function countExactClassToken(source, className, tagName = '') {
  const expression = /<([a-z][a-z0-9:-]*)\b[^>]*\bclass\s*=\s*(["'])([^"']*)\2[^>]*>/gi;
  const wantedTag = String(tagName || '').toLowerCase();
  let total = 0;
  let match;
  while ((match = expression.exec(source))) {
    if (wantedTag && match[1].toLowerCase() !== wantedTag) continue;
    if (match[3].trim().split(/\s+/).filter(Boolean).includes(className)) total += 1;
  }
  return total;
}
function runFinalizer() {
  const result = spawnSync(process.execPath, [finalizer], {
    cwd: temporaryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Cinematic pathway finalizer exited ${result.status}.`);
}

const legacySection = '<section class="matrix-pathways" aria-labelledby="matrix-pathways-title"><div><h2 id="matrix-pathways-title">Legacy duplicate</h2><p>Remove this duplicate.</p></div></section>';
const canonicalSection = '<!-- cinematic-pathways:start --><section class="matrix-pathways extra" aria-labelledby="matrix-pathways-title"><div class="matrix-pathways-head"><span class="matrix-pathways-eyebrow">Investigate</span><h2 id="matrix-pathways-title">Canonical pathway</h2><a class="matrix-pathways-map-link" href="investigation-pathways.html">Map</a></div><div class="matrix-pathways-sequence">Discover · Verify</div><p class="matrix-pathways-boundary">Preserve this selected content.</p></section><!-- cinematic-pathways:end -->';
const secondMarker = '<!-- cinematic-pathways:start --><section class="matrix-pathways" aria-labelledby="matrix-pathways-title-old"><div class="matrix-pathways-head"><span class="matrix-pathways-eyebrow">Newest</span><h2 id="matrix-pathways-title-old">Newest canonical pathway</h2><a class="matrix-pathways-map-link" href="investigation-pathways.html">Map</a></div><div class="matrix-pathways-sequence">Discover · Verify</div><p class="matrix-pathways-boundary">Keep the newest marker block.</p></section><!-- cinematic-pathways:end -->';

// Reproduce the production Black File corruption: a legacy outer marker wraps
// the page hero and already-marked pathway blocks. A start-to-end block regex
// would consume the H1 and reader copy. The finalizer must preserve all
// non-pathway content while retaining only the newest exact pathway section.
const fixture = `<!doctype html><html><head><title>Black File</title></head><body><main><!-- cinematic-pathways:start --><section class="hero"><h1>THE BLACK FILE</h1><p id="black-file-public-lead">Preserve the reader gateway and archive map.</p></section>${legacySection}${canonicalSection}${secondMarker}<!-- cinematic-pathways:end --><section id="after-pathway"><h2>After the pathway</h2><p>Preserve downstream content.</p></section></main><footer>Footer</footer></body></html>`;
const nestedFixture = `<!doctype html><html><body><main><h1>Nested</h1>${legacySection}${canonicalSection}</main></body></html>`;
const untouched = '<!doctype html><html><body><main><h1>No cinematic pathways</h1></main></body></html>';
const files = [
  'black-file.html',
  'black-file',
  '_site/black-file.html',
  '_site/black-file',
  'books/example.html',
  '_site/books/example.html'
];

try {
  for (const relative of files.slice(0, 4)) write(relative, fixture);
  for (const relative of files.slice(4)) write(relative, nestedFixture);
  write('untouched.html', untouched);

  runFinalizer();

  for (const relative of files.slice(0, 4)) {
    const html = read(relative);
    assert(countExactClassToken(html, 'matrix-pathways', 'section') === 1, `${relative}: expected one pathway section.`);
    assert(countExactClassToken(html, 'matrix-pathways-head') === 1, `${relative}: descendant pathway classes were not preserved.`);
    assert(countExactClassToken(html, 'matrix-pathways-eyebrow') === 1, `${relative}: pathway eyebrow was not preserved.`);
    assert(countExactClassToken(html, 'matrix-pathways-map-link') === 1, `${relative}: pathway map link was not preserved.`);
    assert(countExactClassToken(html, 'matrix-pathways-sequence') === 1, `${relative}: pathway sequence was not preserved.`);
    assert(countExactClassToken(html, 'matrix-pathways-boundary') === 1, `${relative}: pathway boundary was not preserved.`);
    assert(count(html, /<!--\s*cinematic-pathways:start\s*-->/gi) === 1, `${relative}: expected one start marker.`);
    assert(count(html, /<!--\s*cinematic-pathways:end\s*-->/gi) === 1, `${relative}: expected one end marker.`);
    assert(count(html, /id=["']matrix-pathways-title-black-file["']/gi) === 1, `${relative}: expected one route-specific title ID.`);
    assert(/aria-labelledby=["']matrix-pathways-title-black-file["']/i.test(html), `${relative}: aria-labelledby does not match the title ID.`);
    assert(!/id=["']matrix-pathways-title["']/i.test(html), `${relative}: legacy title ID survived.`);
    assert(html.includes('Newest canonical pathway'), `${relative}: the newest marker block was not retained.`);
    assert(!html.includes('Legacy duplicate'), `${relative}: unmarked legacy duplicate survived.`);
    assert(!html.includes('Canonical pathway'), `${relative}: older marker duplicate survived.`);
    assert(/<h1>THE BLACK FILE<\/h1>/i.test(html), `${relative}: nested markers consumed the public H1.`);
    assert(html.includes('black-file-public-lead'), `${relative}: nested markers consumed the public lead.`);
    assert(html.includes('after-pathway'), `${relative}: nested markers consumed downstream page content.`);
  }

  for (const relative of files.slice(4)) {
    const html = read(relative);
    assert(countExactClassToken(html, 'matrix-pathways', 'section') === 1, `${relative}: expected one nested pathway section.`);
    assert(count(html, /id=["']matrix-pathways-title-books-example["']/gi) === 1, `${relative}: expected a nested route-specific title ID.`);
    assert(/aria-labelledby=["']matrix-pathways-title-books-example["']/i.test(html), `${relative}: nested aria-labelledby mismatch.`);
    assert(/<h1>Nested<\/h1>/i.test(html), `${relative}: normal page H1 was not preserved.`);
  }

  assert(read('untouched.html') === untouched, 'A page without cinematic pathways was modified.');
  const firstHashes = Object.fromEntries([...files, 'untouched.html'].map(relative => [relative, hash(relative)]));
  runFinalizer();
  for (const [relative, expected] of Object.entries(firstHashes)) {
    assert(hash(relative) === expected, `${relative}: finalizer is not idempotent.`);
  }

  const report = JSON.parse(read('downloads/cinematic-pathway-id-finalization.json'));
  assert(report.ok === true, 'Finalization report is not healthy.');
  console.log('CINEMATIC PATHWAY IDEMPOTENCY TEST PASSED');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
