const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { classifyChange, canonicalContent, sha256, sanitizeError } = require('./source-change-utils');

const failures = [];
const checks = [];
function pass(name, detail = '') { checks.push({ name, ok: true, detail }); }
function fail(name, detail = '') { checks.push({ name, ok: false, detail }); failures.push(`${name}: ${detail}`); }
function assert(name, condition, detail = '') { condition ? pass(name, detail) : fail(name, detail || 'assertion failed'); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function run(script, cwd, args = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) fail(`${script} execution`, result.stderr || result.stdout || `exit ${result.status}`); else pass(`${script} execution`, result.stdout.trim());
  return result;
}

const addedRemoved = classifyChange({
  previous: { status: 'fetched', bodyHash: 'raw-a', canonicalHash: 'canon-a', itemIds: ['one','two'], records: [{id:'one',title:'One'},{id:'two',title:'Two'}] },
  current: { status: 'fetched', bodyHash: 'raw-a', itemIds: ['one','three'] },
  canonicalHash: 'canon-a',
  currentRecords: [{id:'one',title:'One'},{id:'three',title:'Three'}],
  detectedAt: '2026-07-11T12:00:00.000Z'
});
assert('detect additions and removals', addedRemoved.changeType === 'records-added-and-removed' && addedRemoved.addedIds[0] === 'three' && addedRemoved.removedIds[0] === 'two');
const outage = classifyChange({ previous: { status: 'fetched', canonicalHash: 'x' }, current: { status: 'failed', itemIds: [] }, canonicalHash: 'x', detectedAt: '2026-07-11T12:00:00.000Z' });
assert('detect source outage', outage.changeType === 'unavailable' && outage.meaningful);
const restored = classifyChange({ previous: { status: 'failed', canonicalHash: 'x' }, current: { status: 'fetched', itemIds: [] }, canonicalHash: 'x', detectedAt: '2026-07-11T12:00:00.000Z' });
assert('detect restored source', restored.changeType === 'restored' && restored.meaningful);
const canonicalA = sha256(Buffer.from(canonicalContent(Buffer.from('<html><script>nonce=abc</script><body>Public record</body></html>'), 'text/html')));
const canonicalB = sha256(Buffer.from(canonicalContent(Buffer.from('<html><script>nonce=xyz</script><body>Public record</body></html>'), 'text/html')));
assert('ignore script-only page churn', canonicalA === canonicalB);
assert('sanitize diagnostic secrets', !sanitizeError('HTTP 403 token=abcdefghijklmnopqrstuvwxyz0123456789SECRET').includes('SECRET'));

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-source-change-'));
for (const dir of ['data','downloads','evidence-archive']) fs.mkdirSync(path.join(fixture, dir), { recursive: true });
writeJson(path.join(fixture, 'data', 'investigation-source-registry.json'), {
  mission: 'Test public records.', rules: [], lanes: [{id:'oversight-audit',title:'Oversight'}],
  sources: [{ id:'test-source', label:'Test Official Source', lane:'oversight-audit', authority:'primary-official', frequency:['daily','weekly'], type:'html', url:'https://example.invalid/source', keywords:['audit'] }]
});
writeJson(path.join(fixture, 'data', 'investigation-source-state.json'), {
  updated:'2026-07-11T12:00:00.000Z', lastMode:'daily', sources:{'test-source':{sourceId:'test-source',status:'fetched',lastSuccess:'2026-07-11T12:00:00.000Z',bodyHash:'same-raw-hash',itemIds:['one','three'],error:''}}
});
writeJson(path.join(fixture, 'data', 'investigation-ledger.json'), {findings:[
  {id:'one',sourceId:'test-source',title:'Record One',itemUrl:'https://example.invalid/one',summary:'Audit record one'},
  {id:'three',sourceId:'test-source',title:'Record Three',itemUrl:'https://example.invalid/three.pdf',summary:'Audit record three'}
]});
writeJson(path.join(fixture, 'evidence-archive', 'manifest.json'), {version:1,sources:{'test-source':{sourceId:'test-source',status:'fetched',bodyHash:'same-raw-hash',canonicalHash:'same-canonical-hash',itemIds:['one','two'],records:[{id:'one',title:'Record One',url:'https://example.invalid/one'},{id:'two',title:'Record Two',url:'https://example.invalid/two'}]}},snapshots:[],documents:[],documentFailures:[]});
writeJson(path.join(fixture, 'data', 'investigation-source-changes.json'), {changes:[]});
writeJson(path.join(fixture, 'data', 'daily-investigation-conclusions.json'), {summary:{},strongestFindings:[]});
writeJson(path.join(fixture, 'data', 'weekly-investigation-conclusions.json'), {summary:{},strongestFindings:[]});
writeJson(path.join(fixture, 'search-index.json'), Array.from({length:100}, (_, i) => ({url:`page-${i}.html`,title:`Page ${i}`,category:'Test',layer:'test',description:'test',keywords:['test'],priority:1})));
fs.writeFileSync(path.join(fixture, 'search.html'), '<div><button class="btn alt" data-q="daily investigation conclusions wrongdoing">Daily Conclusions</button></div></section><section class="section wrap split"><div id="archive-search"></div><div id="search-results"></div><div id="search-count"></div><script src="search.js"></script>');
fs.writeFileSync(path.join(fixture, 'sitemap.xml'), '<urlset></urlset>');
fs.writeFileSync(path.join(fixture, 'llms.txt'), '# Matrix');
fs.writeFileSync(path.join(fixture, 'investigation-source-ledger.html'), '<div class="cta-row"></div></section><section class="section wrap"><h2>Registered Source Platforms</h2>');

run('preserve-investigation-sources.js', fixture, ['daily']);
run('build-source-change-page.js', fixture);
run('extend-search-with-source-changes.js', fixture);

const publicFeed = JSON.parse(fs.readFileSync(path.join(fixture, 'data', 'investigation-source-changes.json'), 'utf8'));
assert('publish meaningful source event', publicFeed.changes.length === 1 && publicFeed.changes[0].changeType === 'records-added-and-removed');
assert('publish evidence boundary', /does not by itself prove/i.test(publicFeed.changes[0].whatIsNotEstablished));
assert('do not expose archive paths in public feed', !JSON.stringify(publicFeed).includes('evidence-archive/source-pages'));
const daily = JSON.parse(fs.readFileSync(path.join(fixture, 'data', 'daily-investigation-conclusions.json'), 'utf8'));
assert('connect source change to daily conclusions', daily.summary.meaningfulSourceChanges === 1 && daily.strongestFindings.some(item => String(item.id).startsWith('source-change-')));
const page = fs.readFileSync(path.join(fixture, 'source-changes.html'), 'utf8');
assert('build clean public source change route', page.includes('SOURCE CHANGE RECORD') && page.includes('What is not established') && !page.includes('[object Object]'));
const index = JSON.parse(fs.readFileSync(path.join(fixture, 'search-index.json'), 'utf8'));
assert('index source changes in public search', index.some(item => item.url === 'source-changes.html') && index.some(item => String(item.url).startsWith('source-changes.html#change-')));
assert('add source change search shortcut', fs.readFileSync(path.join(fixture, 'search.html'), 'utf8').includes('source changes removed restored hash'));

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'downloads', 'source-change-preservation-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`SOURCE CHANGE PRESERVATION TEST FAILED: ${failures.length} failure(s)`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Source change preservation test passed: ${checks.length} checks.`);
