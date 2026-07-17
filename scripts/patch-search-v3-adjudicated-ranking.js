const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtimePath = path.join(root, 'scripts', 'search-v3-runtime-template.js');
const qualityPath = path.join(root, 'scripts', 'search-v3-quality-test.js');
const reportPath = path.join(root, 'downloads', 'search-v3-adjudicated-ranking-patch.json');

for (const file of [runtimePath, qualityPath]) if (!fs.existsSync(file)) throw new Error(`Missing Search V3 file: ${path.relative(root, file)}`);

let runtime = fs.readFileSync(runtimePath, 'utf8');
let quality = fs.readFileSync(qualityPath, 'utf8');
let runtimeChanged = false;
let qualityChanged = false;

const runtimeOld = "  if(tokens.some(function(token){return ['conviction','guilty','judgment','proven','established','order'].indexOf(token)>=0;})&&item.statusClass==='established')value+=42;";
const runtimeNew = "  const adjudicatedIntent=tokens.some(function(token){return ['conviction','guilty','judgment','proven','established','order'].indexOf(token)>=0;});\n  if(adjudicatedIntent&&item.statusClass==='established')value+=88;\n  if(adjudicatedIntent&&['investigation-finding','court-record','document-extraction'].indexOf(String(item.sourceType||''))>=0)value+=36;\n  if(adjudicatedIntent&&item.resultKind==='relationship'&&item.statusClass!=='established')value-=72;";
if (!runtime.includes(runtimeNew)) {
  if (!runtime.includes(runtimeOld)) throw new Error('Search V3 runtime adjudicated-ranking target not found');
  runtime = runtime.replace(runtimeOld, runtimeNew);
  runtimeChanged = true;
}

const qualityOld = "  if (tokens.some(token => ['conviction','guilty','judgment','proven','established','order'].includes(token)) && item.statusClass === 'established') value += 42;";
const qualityNew = "  const adjudicatedIntent = tokens.some(token => ['conviction','guilty','judgment','proven','established','order'].includes(token));\n  if (adjudicatedIntent && item.statusClass === 'established') value += 88;\n  if (adjudicatedIntent && ['investigation-finding','court-record','document-extraction'].includes(String(item.sourceType || ''))) value += 36;\n  if (adjudicatedIntent && item.resultKind === 'relationship' && item.statusClass !== 'established') value -= 72;";
if (!quality.includes(qualityNew)) {
  if (!quality.includes(qualityOld)) throw new Error('Search V3 quality adjudicated-ranking target not found');
  quality = quality.replace(qualityOld, qualityNew);
  qualityChanged = true;
}

for (const [label, text] of [['runtime', runtime], ['quality', quality]]) {
  for (const marker of ['adjudicatedIntent', "item.resultKind==='relationship'", 'value+=88']) {
    const normalized = label === 'quality' && marker === "item.resultKind==='relationship'" ? "item.resultKind === 'relationship'" : marker;
    if (!text.includes(normalized)) throw new Error(`Search V3 ${label} ranking marker missing: ${normalized}`);
  }
}

if (runtimeChanged) fs.writeFileSync(runtimePath, runtime);
if (qualityChanged) fs.writeFileSync(qualityPath, quality);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  runtimeChanged,
  qualityChanged,
  policy: {
    establishedAdjudicatedBoost: 88,
    courtInvestigationSourceBoost: 36,
    genericRelationshipPenalty: -72
  },
  boundary: 'Queries seeking convictions, judgments or established findings prioritize adjudicated court, investigation and document records. Generic relationship rows remain searchable but cannot crowd out stronger evidence.'
}, null, 2)}\n`);
console.log(`Search V3 adjudicated ranking ${runtimeChanged || qualityChanged ? 'updated' : 'already current'}.`);
