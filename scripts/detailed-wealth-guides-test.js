const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const full = rel => path.join(root, rel);
const failures = [];
const fail = message => failures.push(message);
const read = rel => { try { return fs.readFileSync(full(rel)); } catch { return null; } };
const json = rel => { try { return JSON.parse(fs.readFileSync(full(rel), 'utf8')); } catch { return null; } };
const pageCount = bytes => Number(String(bytes).match(/\/Type \/Pages \/Count (\d+)/)?.[1] || 0);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const core = json('data/making-money-core.json');
const index = json('downloads/wealth-guides/index.json');
const library = json('data/detailed-wealth-guides.json');

if (!core || !Array.isArray(core.downloads)) fail('making-money-core downloads are missing');
if (!index || !Array.isArray(index.guides)) fail('detailed wealth guide index is missing');
if (!library || !Array.isArray(library.guides)) fail('detailed wealth guide source index is missing');

const expected = core?.downloads || [];
if (expected.length !== 16) fail(`expected exactly 16 public wealth guides, found ${expected.length}`);
if (index?.guides?.length !== expected.length) fail(`index count ${index?.guides?.length || 0} does not match public count ${expected.length}`);
if (library?.guides?.length !== expected.length) fail(`library count ${library?.guides?.length || 0} does not match public count ${expected.length}`);

const hashes = new Set();
for (const item of expected) {
  const meta = index?.guides?.find(guide => guide.slug === item.slug);
  const source = library?.guides?.find(guide => guide.slug === item.slug);
  const file = `downloads/wealth-guides/${item.slug}.pdf`;
  const bytes = read(file);
  if (!bytes) { fail(`${file} missing`); continue; }
  const text = bytes.toString('latin1');
  const pages = pageCount(bytes);
  const digest = sha(bytes);
  if (hashes.has(digest)) fail(`${item.slug} duplicates another PDF byte-for-byte`);
  hashes.add(digest);
  if (bytes.length < 24000) fail(`${item.slug} is too small for a detailed guide: ${bytes.length} bytes`);
  if (pages < 8) fail(`${item.slug} has only ${pages} pages; minimum is 8`);
  if (!meta) fail(`${item.slug} missing from detailed index`);
  if (!source) fail(`${item.slug} missing from detailed source library`);
  if (!item.detailed || String(item.description || '').length < 70) fail(`${item.slug} public card lacks a subject-specific detailed description`);
  if (meta) {
    if (meta.pageCount !== pages) fail(`${item.slug} index page count ${meta.pageCount} does not match PDF ${pages}`);
    if (meta.sectionCount < 14) fail(`${item.slug} has only ${meta.sectionCount} sections; minimum is 14`);
    if (meta.wordCount < 1100) fail(`${item.slug} has only ${meta.wordCount} source words; minimum is 1100`);
    if (meta.sourceCount < 4) fail(`${item.slug} has only ${meta.sourceCount} official research routes; minimum is 4`);
    if (meta.detailed !== true) fail(`${item.slug} is not marked detailed`);
    for (const marker of meta.markers || []) if (!text.toUpperCase().includes(String(marker).toUpperCase())) fail(`${item.slug} PDF missing subject marker: ${marker}`);
  }
  const titleTokens = String(item.title || '').toUpperCase().split(/[^A-Z0-9]+/).filter(token => token.length > 5).slice(0, 3);
  for (const token of titleTokens) if (!text.toUpperCase().includes(token)) fail(`${item.slug} PDF does not contain title token ${token}`);
  for (const required of ['CONTENTS', 'EVIDENCE STANDARD', 'DECISION RECORD WORKSHEET', 'PROFESSIONAL ADVICE TRIGGERS', 'OFFICIAL RESEARCH ROUTES']) {
    if (!text.toUpperCase().includes(required)) fail(`${item.slug} missing required section ${required}`);
  }
  if (/Branded Matrix Reprogrammed educational guide with checklist, evidence boundary and next actions\./.test(text)) fail(`${item.slug} still contains the obsolete placeholder-only copy`);
}

const makingJs = fs.existsSync(full('making-money.js')) ? fs.readFileSync(full('making-money.js'), 'utf8') : '';
if (!makingJs.includes('x.description')) fail('making-money.js still renders one generic description for every PDF');
const makingHtml = fs.existsSync(full('making-money.html')) ? fs.readFileSync(full('making-money.html'), 'utf8') : '';
if (!makingHtml.includes('Sixteen detailed subject-specific guides')) fail('making-money.html does not describe the detailed library');
const deep = fs.existsSync(full('scripts/build-deep-pdf-intelligence.mjs')) ? fs.readFileSync(full('scripts/build-deep-pdf-intelligence.mjs'), 'utf8') : '';
if (!deep.includes('wealth=[]')) fail('deep PDF intelligence builder can still overwrite custom wealth guides');
const allBuilder = fs.existsSync(full('scripts/build-all-branded-download-pdfs.js')) ? fs.readFileSync(full('scripts/build-all-branded-download-pdfs.js'), 'utf8') : '';
if (!allBuilder.includes("run('build-detailed-wealth-guides.js')")) fail('all branded PDF build does not restore detailed wealth guides last');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  guideCount: expected.length,
  totalPages: (index?.guides || []).reduce((sum, guide) => sum + Number(guide.pageCount || 0), 0),
  minimumPages: Math.min(...(index?.guides || []).map(guide => Number(guide.pageCount || 0))),
  minimumSections: Math.min(...(index?.guides || []).map(guide => Number(guide.sectionCount || 0))),
  minimumWords: Math.min(...(index?.guides || []).map(guide => Number(guide.wordCount || 0))),
  failures
};
fs.mkdirSync(full('downloads'), { recursive: true });
fs.writeFileSync(full('downloads/detailed-wealth-guides-test.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('DETAILED WEALTH GUIDES TEST FAILED');
  for (const problem of failures) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Detailed wealth guides test passed: ${report.guideCount} guides, ${report.totalPages} pages, minimum ${report.minimumPages} pages and ${report.minimumWords} words per guide.`);
