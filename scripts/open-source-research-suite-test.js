const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportFile = path.join(root, 'downloads', 'open-source-research-suite-test.json');
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) console.error(`FAILED: ${name}${detail ? ` — ${detail}` : ''}`);
}
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function exists(file) { return fs.existsSync(path.join(root, file)); }

for (const file of [
  'evidence-reader.html', 'evidence-reader.js', 'data/evidence-reader-manifest.json',
  'evidence-timeline.html', 'evidence-timeline.js', 'data/evidence-timeline.json',
  'pagefind-fallback.js', 'scripts/patch-pagefind-fallback.js',
  '.github/workflows/open-source-research-suite.yml'
]) check(`Required open-source suite file exists: ${file}`, exists(file));

const reader = read('evidence-reader.js');
const readerPage = read('evidence-reader.html');
const manifest = json('data/evidence-reader-manifest.json');
check('Evidence reader declares PDF.js', /pdfjs-dist@4\.10\.38/.test(reader));
check('PDF.js worker is pinned to same version', /pdf\.worker\.min\.mjs/.test(reader) && /PDFJS_VERSION/.test(reader));
check('Reader accepts only same-origin manifest PDF URLs', reader.includes('url.origin !== location.origin') && reader.includes("/\\.pdf"));
check('Reader has no arbitrary src query parameter', !/params\.get\(['"]src['"]\)/.test(reader));
check('Reader supports page-specific links', reader.includes("searchParams.set('page'") && readerPage.includes('Copy Page Link'));
check('Reader supports text search', reader.includes('getTextContent') && readerPage.includes('Search inside PDF'));
check('Reader has browser PDF fallback', reader.includes('fallbackViewer') && reader.includes('<iframe'));
check('Reader is mobile responsive', /@media\(max-width:900px\)/.test(readerPage));
check('Manifest names PDF.js engine and licence', manifest.engine === 'PDF.js' && /Apache/.test(manifest.engineLicense || ''));
check('Manifest carries an evidence boundary', /does not prove|does not authenticate/i.test(manifest.evidenceBoundary || ''));
check('Manifest documents are an array', Array.isArray(manifest.documents));
for (const documentRecord of manifest.documents || []) {
  check(`Manifest document ${documentRecord.id} has local PDF URL`, !/^https?:/i.test(documentRecord.url || '') && /\.pdf$/i.test(documentRecord.url || ''));
  check(`Manifest document ${documentRecord.id} has SHA-256`, /^[a-f0-9]{64}$/i.test(documentRecord.sha256 || ''));
  check(`Manifest document ${documentRecord.id} has evidence fields`, Boolean(documentRecord.evidenceGrade && documentRecord.factualStatus && documentRecord.established && documentRecord.notEstablished));
}

const timeline = json('data/evidence-timeline.json');
const timelineJs = read('evidence-timeline.js');
const timelinePage = read('evidence-timeline.html');
check('Timeline declares vis-timeline engine', timeline.engine === 'vis-timeline');
check('Timeline runtime pins vis-timeline version', /vis-timeline@7\.7\.3/.test(timelineJs));
check('Timeline has accessible list fallback', timelineJs.includes('accessible event list') && timelinePage.includes('Accessible event list'));
check('Timeline has URL query filters', timelineJs.includes('URLSearchParams') && timelinePage.includes('timeline-grade'));
check('Timeline is mobile responsive', /@media\(max-width:850px\)/.test(timelinePage));
check('Timeline events are an array', Array.isArray(timeline.events));
check('Timeline contains dated events', (timeline.events || []).length > 0, String((timeline.events || []).length));
for (const event of (timeline.events || []).slice(0, 500)) {
  check(`Timeline event ${event.id} has valid date`, /^\d{4}-\d{2}-\d{2}$/.test(event.date || ''));
  check(`Timeline event ${event.id} has evidence fields`, Boolean(event.evidenceGrade && event.factualStatus && event.established && event.notEstablished));
  check(`Timeline event ${event.id} grade is bounded`, /^[A-D]$/.test(event.evidenceGrade || ''));
}

const pagefind = read('pagefind-fallback.js');
const searchHtml = read('search.html');
const pagefindPatch = read('scripts/patch-pagefind-fallback.js');
check('Pagefind runtime imports only local generated module', pagefind.includes("import('/pagefind/pagefind.js')") && !/import\(['"]https?:/.test(pagefind));
check('Pagefind is explicitly secondary to Search V3', /Search V3 remains the primary/i.test(pagefind));
check('Pagefind failure hides fallback rather than breaking search', pagefind.includes('section.hidden = true') && pagefind.includes('Pagefind fallback inactive'));
check('Search page includes fallback runtime', searchHtml.includes('pagefind-fallback.js'));
check('Search page remains Pagefind indexable', searchHtml.includes('data-pagefind-body'));
check('Homepage exposes reader and timeline', read('index.html').includes('evidence-reader.html') && read('index.html').includes('evidence-timeline.html'));
check('Sitemap exposes reader and timeline', read('sitemap.xml').includes('/evidence-reader.html') && read('sitemap.xml').includes('/evidence-timeline.html'));
check('Pagefind patch is idempotent', pagefindPatch.includes("if (!html.includes('pagefind-fallback.js'))"));

const cloudflare = read('scripts/build-cloudflare-output.js');
check('Cloudflare build runs reader and timeline generators', cloudflare.includes('build-evidence-reader.js') && cloudflare.includes('build-evidence-timeline.js'));
check('Cloudflare build runs open-source suite test', cloudflare.includes('open-source-research-suite-test.js'));
check('Cloudflare package allows Pagefind binary extensions', ['.wasm', '.pf_fragment', '.pf_index', '.pf_meta', '.pf_filter'].every(extension => cloudflare.includes(`'${extension}'`)));
check('Cloudflare package requires public reader and timeline routes', cloudflare.includes("'evidence-reader.html'") && cloudflare.includes("'evidence-timeline.html'"));
check('Suite diagnostics are blocked from public output', cloudflare.includes("'downloads/open-source-research-suite-test.json'"));

const failed = checks.filter(item => !item.pass);
const report = {
  ok: failed.length === 0,
  generatedAt: new Date().toISOString(),
  checks: checks.length,
  failures: failed.length,
  manifestDocuments: (manifest.documents || []).length,
  timelineEvents: (timeline.events || []).length,
  results: checks
};
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`Open-source research suite test: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
