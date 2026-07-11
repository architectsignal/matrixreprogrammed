const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const checks = [];
function pass(name, detail = '') { checks.push({ name, ok: true, detail }); }
function fail(name, detail = '') { checks.push({ name, ok: false, detail }); failures.push(`${name}: ${detail}`); }
function assert(name, condition, detail = '') { condition ? pass(name, detail) : fail(name, detail || 'assertion failed'); }
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; } }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

const graph = readJson('data/evidence-network-map.json', {});
const nodes = graph.elements?.nodes || [];
const edges = graph.elements?.edges || [];
const nodeIds = new Set(nodes.map(node => node?.data?.id).filter(Boolean));
assert('graph schema version', graph.schemaVersion === '2.0.0', graph.schemaVersion || 'missing');
assert('graph evidence boundary', /does not convert|does not.*guilt|not.*guilt/i.test(graph.boundary || ''), graph.boundary || 'missing');
assert('substantial entity graph', nodes.length >= 100, `${nodes.length} nodes`);
assert('substantial relationship graph', edges.length >= 100, `${edges.length} edges`);
assert('relationship totals agree', graph.totals?.relationships === edges.length, `${graph.totals?.relationships} / ${edges.length}`);
assert('entity totals agree', graph.totals?.entities === nodes.length, `${graph.totals?.entities} / ${nodes.length}`);

let orphaned = 0;
let missingEvidence = 0;
let weakBoundaryFailures = 0;
let unsafeProvenLanguage = 0;
for (const edge of edges) {
  const data = edge?.data || {};
  if (!nodeIds.has(data.source) || !nodeIds.has(data.target)) orphaned += 1;
  const required = ['id','source','target','relationshipType','sourceTitle','sourceUrl','date','grade','factualStatus','establishes','doesNotEstablish','reviewStatus','extractionMethod','confidence','route'];
  if (required.some(key => data[key] === undefined || data[key] === null || String(data[key]).trim() === '')) missingEvidence += 1;
  if (data.weakMention && !/does not establish|textual mention/i.test(data.doesNotEstablish || '')) weakBoundaryFailures += 1;
  if (data.grade !== 'A' && /proven criminal|proved criminal|is guilty|guilty of/i.test(`${data.establishes} ${data.factualStatus}`)) unsafeProvenLanguage += 1;
}
assert('no orphan relationships', orphaned === 0, `${orphaned} orphan edges`);
assert('every relationship carries complete evidence fields', missingEvidence === 0, `${missingEvidence} incomplete edges`);
assert('weak mentions keep explicit limitations', weakBoundaryFailures === 0, `${weakBoundaryFailures} failures`);
assert('lower grades are not described as proven criminal wrongdoing', unsafeProvenLanguage === 0, `${unsafeProvenLanguage} failures`);
assert('core view exists', edges.some(edge => edge.data?.core), `${edges.filter(edge => edge.data?.core).length} core edges`);
assert('official view exists', edges.some(edge => edge.data?.official), `${edges.filter(edge => edge.data?.official).length} official edges`);
assert('weak mentions are separated', edges.some(edge => edge.data?.weakMention), `${edges.filter(edge => edge.data?.weakMention).length} weak mentions`);
assert('relationship filter metadata', Array.isArray(graph.filters?.relationshipTypes) && graph.filters.relationshipTypes.length > 2, `${graph.filters?.relationshipTypes?.length || 0} types`);
assert('entity filter metadata', Array.isArray(graph.filters?.entityTypes) && graph.filters.entityTypes.length > 2, `${graph.filters?.entityTypes?.length || 0} types`);

for (const file of ['evidence-network-map.html','evidence-network-map.js','downloads/evidence-network-map.csv','downloads/evidence-network-map-build.json']) {
  assert(`output ${file}`, fs.existsSync(path.join(root, file)), fs.existsSync(path.join(root, file)) ? 'present' : 'missing');
}
if (fs.existsSync(path.join(root, 'evidence-network-map.js'))) {
  const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'evidence-network-map.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  assert('runtime syntax', syntax.status === 0, syntax.stderr || syntax.stdout || 'valid');
  const js = read('evidence-network-map.js');
  for (const marker of ['relationshipType','doesNotEstablish','sourceUrl','pathStart','aStar','URLSearchParams','navigator.clipboard','map-visible-relationships']) assert(`runtime marker ${marker}`, js.includes(marker), marker);
}
if (fs.existsSync(path.join(root, 'evidence-network-map.html'))) {
  const html = read('evidence-network-map.html');
  for (const marker of ['id="map-mode"','id="map-relationship"','id="map-factual-status"','id="map-entity-type"','id="map-review"','id="map-confidence"','id="map-date-from"','id="map-date-to"','id="map-share"','id="map-clear-path"','Textual mentions']) assert(`page marker ${marker}`, html.includes(marker), marker);
  assert('page explains established fact field', /what the record establishes/i.test(html), 'what the record establishes');
  assert('mobile presentation', html.includes('@media(max-width:600px)') && html.includes('@media(max-width:420px)'), 'responsive breakpoints');
  assert('public correction and audit routes', html.includes('relationship-registry.html') && html.includes('downloads/evidence-network-map.csv'), 'registry and CSV');
}
if (fs.existsSync(path.join(root, 'downloads/evidence-network-map.csv'))) {
  const header = read('downloads/evidence-network-map.csv').split(/\r?\n/, 1)[0];
  for (const column of ['relationship_id','source_url','evidence_grade','factual_status','what_is_established','what_is_not_established']) assert(`CSV column ${column}`, header.includes(column), header);
}
const relationshipPage = fs.existsSync(path.join(root, 'relationship-registry.html')) ? read('relationship-registry.html') : '';
if (relationshipPage) assert('stable relationship anchors', relationshipPage.includes('id="relationship-'), 'relationship anchors present');

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), totals: graph.totals || {}, checks, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads/public-network-map-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`PUBLIC NETWORK MAP TEST FAILED: ${failures.length} failure(s)`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Public network map test passed: ${checks.length} checks across ${nodes.length} entities and ${edges.length} sourced relationships.`);
