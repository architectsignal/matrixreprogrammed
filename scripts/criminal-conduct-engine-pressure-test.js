const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-engine-report.json');
const queuePath = path.join(root, 'downloads', 'criminal-conduct-review-queue.json');
const outputPath = path.join(root, 'downloads', 'criminal-conduct-engine-pressure-test.json');
const failures = [];

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required criminal-conduct artifact: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function fail(message) { failures.push(message); }
function count(text, token) { return String(text).split(token).length - 1; }

const registry = readJson(registryPath);
const report = readJson(reportPath);
const queue = readJson(queuePath);
const categories = Object.keys(registry.categories || {});

if (registry.schemaVersion !== 1) fail('registry schemaVersion must be 1');
if (categories.length !== 8) fail(`expected 8 criminal-conduct categories, found ${categories.length}`);
for (const required of ['conviction_final_judgment', 'charge_indictment_complaint', 'investigation_inquiry', 'civil_regulatory_action', 'substantiated_allegation', 'suspected_conduct', 'rumor_speculation', 'exculpatory_disposition']) {
  if (!categories.includes(required)) fail(`missing registry category ${required}`);
}
if (!Array.isArray(registry.rules) || registry.rules.length < 8) fail('registry requires at least 8 editorial and legal boundary rules');
if (!String(registry.publicationRule || '').includes('publicationStatus=approved')) fail('registry must explicitly require editorial approval');
if (!report.ok || !Array.isArray(report.surfaces) || report.counts?.source < 1) fail('engine report has no source dossier surfaces');
if (queue.publicationStatus !== 'requires-editorial-review') fail('machine candidate queue must remain editorial-review-only');
if ((queue.candidates || []).some(item => item.publicationStatus === 'approved')) fail('machine candidate queue contains an automatically approved record');

const ids = new Set();
for (const [subjectKey, subject] of Object.entries(registry.subjects || {})) {
  for (const record of subject.records || []) {
    if (record.publicationStatus !== 'approved') continue;
    if (ids.has(record.id)) fail(`duplicate approved record id ${record.id}`);
    ids.add(record.id);
    for (const field of ['id', 'category', 'title', 'summary', 'sourceLabel', 'sourceUrl', 'date', 'status', 'evidenceGrade', 'lastChecked', 'boundary']) {
      if (!String(record[field] || '').trim()) fail(`${subjectKey}/${record.id || '(no id)'} missing ${field}`);
    }
    if (!categories.includes(record.category)) fail(`${subjectKey}/${record.id} has invalid category ${record.category}`);
    if (!/^https?:\/\//i.test(String(record.sourceUrl || ''))) fail(`${subjectKey}/${record.id} source URL is not absolute`);
    if (record.category === 'conviction_final_judgment' && !/(adjudicated|convicted|guilty|final judgment|sentenced)/i.test(`${record.status || ''} ${record.outcome || ''}`)) fail(`${subjectKey}/${record.id} improperly uses conviction category without adjudicated outcome`);
    if (record.category === 'rumor_speculation') {
      for (const field of ['rightOfReply', 'counterEvidence', 'proofNeeded']) if (!String(record[field] || '').trim()) fail(`${subjectKey}/${record.id} rumor/speculation missing ${field}`);
    }
  }
}

for (const surface of report.surfaces || []) {
  const base = surface.scope === 'built' ? path.join(root, '_site') : root;
  const file = path.join(base, surface.route);
  if (!fs.existsSync(file)) { fail(`${surface.scope}/${surface.route} missing after engine build`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  if (count(html, '<!-- criminal-conduct-engine:start -->') !== 1) fail(`${surface.scope}/${surface.route} must contain exactly one engine start marker`);
  if (count(html, '<!-- criminal-conduct-engine:end -->') !== 1) fail(`${surface.scope}/${surface.route} must contain exactly one engine end marker`);
  if (!html.includes('<details class="criminal-conduct-engine">')) fail(`${surface.scope}/${surface.route} missing dropdown details element`);
  if (!html.includes('Criminal Conduct &amp; Allegations')) fail(`${surface.scope}/${surface.route} missing dropdown title`);
  if (!html.includes('Charges and investigations are not proof of guilt.')) fail(`${surface.scope}/${surface.route} missing presumption-of-innocence boundary`);
  if (!html.includes('Association is not wrongdoing.')) fail(`${surface.scope}/${surface.route} missing guilt-by-association boundary`);
  if (!html.includes('Rumors / Speculation')) fail(`${surface.scope}/${surface.route} missing separate rumor/speculation lane`);
  if (!html.includes('Acquittals / Dismissals / Reversals / Responses')) fail(`${surface.scope}/${surface.route} missing exculpatory/outcome lane`);
  if (/\[object Object\]/.test(html)) fail(`${surface.scope}/${surface.route} contains literal object placeholder`);
  if (/class="criminal-conduct-record"/.test(html)) {
    for (const marker of ['Open cited source:', 'Right of reply / response:', 'Counter-evidence / limitation:', 'Proof needed:', 'Last checked']) {
      if (!html.includes(marker)) fail(`${surface.scope}/${surface.route} record output missing ${marker}`);
    }
  }
}

const result = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  sourceSurfaces: report.counts?.source || 0,
  builtSurfaces: report.counts?.built || 0,
  approvedRecords: ids.size,
  reviewCandidates: (queue.candidates || []).length,
  categories,
  failures
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) {
  console.error('CRIMINAL CONDUCT ENGINE PRESSURE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Criminal Conduct Engine pressure test passed: ${result.sourceSurfaces} source dossier surfaces, ${result.builtSurfaces} built surfaces, ${result.approvedRecords} approved records, ${result.reviewCandidates} review-only candidates.`);
