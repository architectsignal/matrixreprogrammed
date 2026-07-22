const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const corePath = path.join(root, 'data', 'behind-the-curtain.json');
const intakePath = path.join(root, 'data', 'behind-the-curtain-source-intake.json');
const optionalInputs = [
  'data/entity-registry.json',
  'data/relationship-registry.json',
  'data/money-overlap-graph.json',
  'data/epstein-relationship-public.json',
  'data/investigation-knowledge-graph.json'
];
const allowedClassifications = new Set([
  'documented_fact', 'official_allegation', 'strongly_supported_assessment',
  'plausible_structural_inference', 'speculative_hypothesis', 'disputed',
  'unsupported', 'rejected'
]);

function readJson(relative, fallback = null) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return fallback;
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return fallback;
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${relative} contains invalid JSON: ${error.message}`); }
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value))); }
function calculate(center, weights) {
  return Math.round((Object.entries(weights).reduce((sum, [key, weight]) => sum + clamp(center.dimensions[key]) * Number(weight), 0) / 100) * 10) / 10;
}
function mentionCount(payload, center) {
  if (payload == null) return 0;
  const text = JSON.stringify(payload).toLowerCase();
  const terms = [center.name, center.shortName].filter(Boolean).map(value => String(value).toLowerCase());
  return terms.reduce((count, term) => count + (text.split(term).length - 1), 0);
}
function applyApprovedIntake(model, intake) {
  const centers = new Map(model.powerCenters.map(center => [center.id, center]));
  let approved = 0;
  for (const entry of intake.entries || []) {
    if (entry.reviewStatus !== 'approved') continue;
    const center = centers.get(entry.entityId);
    if (!center) throw new Error(`Approved intake references unknown entityId: ${entry.entityId}`);
    if (!allowedClassifications.has(entry.classification)) throw new Error(`Approved intake has invalid classification: ${entry.classification}`);
    if (!entry.source || !/^https:\/\//.test(entry.source.url || '')) throw new Error(`Approved intake for ${entry.entityId} requires an HTTPS source`);
    const sourceId = entry.source.id || `intake-${hash(entry.source).slice(0, 12)}`;
    if (!model.sources.some(source => source.id === sourceId)) {
      model.sources.push({
        id: sourceId,
        tier: entry.source.tier || 'C',
        publisher: entry.source.publisher || 'Source under review',
        title: entry.source.title || 'Reviewed structural-power evidence',
        url: entry.source.url,
        date: entry.source.date || model.asOf,
        establishes: entry.source.establishes || entry.summary || 'A reviewed evidence signal relevant to the named power mechanism.',
        doesNotEstablish: entry.source.doesNotEstablish || 'This record alone does not prove unified command, criminality or comprehensive control.'
      });
    }
    if (!center.sourceIds.includes(sourceId)) center.sourceIds.push(sourceId);
    for (const [dimension, delta] of Object.entries(entry.dimensionAdjustments || {})) {
      if (!(dimension in model.weights)) throw new Error(`Unknown score dimension in approved intake: ${dimension}`);
      const boundedDelta = Math.max(-5, Math.min(5, Number(delta)));
      center.dimensions[dimension] = clamp(Number(center.dimensions[dimension]) + boundedDelta);
    }
    if (entry.classification) center.classification = entry.classification;
    if (entry.confidence) center.confidence = entry.confidence;
    if (entry.summary) center.strongestEvidence = [...new Set([...(center.strongestEvidence || []), entry.summary])];
    approved++;
  }
  return approved;
}

if (!fs.existsSync(corePath)) {
  const seeded = spawnSync(process.execPath, [path.join(root, 'scripts', 'seed-behind-the-curtain-data.js')], { cwd: root, stdio: 'inherit' });
  if (seeded.status !== 0 || !fs.existsSync(corePath)) throw new Error('Unable to seed data/behind-the-curtain.json');
}
const model = readJson('data/behind-the-curtain.json');
const intake = readJson('data/behind-the-curtain-source-intake.json', { entries: [] });
const weightTotal = Object.values(model.weights || {}).reduce((sum, value) => sum + Number(value), 0);
if (weightTotal !== 100) throw new Error(`Structural Power Score weights total ${weightTotal}, expected 100`);

const previousRanks = new Map((model.powerCenters || []).map(center => [center.id, center.rank]));
const approvedIntakeEntries = applyApprovedIntake(model, intake);
const inputPayloads = optionalInputs.map(relative => ({ relative, data: readJson(relative, null) }));
let filesRead = 0;
for (const { data } of inputPayloads) if (data != null) filesRead++;
for (const center of model.powerCenters || []) {
  center.siteSignals = inputPayloads.reduce((sum, item) => sum + mentionCount(item.data, center), 0);
  center.structuralPowerScore = calculate(center, model.weights);
  center.lastReviewed = model.asOf;
}
model.powerCenters.sort((a, b) => b.structuralPowerScore - a.structuralPowerScore || a.name.localeCompare(b.name));
model.powerCenters.forEach((center, index) => {
  center.rank = index + 1;
  const prior = previousRanks.get(center.id);
  center.previousRank = prior ?? null;
  center.movement = prior == null ? 'new' : prior === center.rank ? 'stable' : prior > center.rank ? 'up' : 'down';
});

const inputHash = hash({
  core: { ...model, build: undefined, changeLog: undefined },
  intake,
  optionalInputs: inputPayloads.map(item => ({ path: item.relative, data: item.data }))
});
const previousHash = model.build?.inputHash || null;
const lastCalculatedAt = previousHash === inputHash
  ? model.build?.lastCalculatedAt || `${model.asOf}T00:00:00.000Z`
  : new Date().toISOString();
model.build = { inputHash, lastCalculatedAt, siteSignalFilesRead: filesRead, approvedIntakeEntries };

fs.mkdirSync(path.dirname(corePath), { recursive: true });
fs.writeFileSync(corePath, `${JSON.stringify(model, null, 2)}\n`);
const patch = spawnSync(process.execPath, [path.join(root, 'scripts', 'patch-behind-the-curtain-links.js')], { cwd: root, stdio: 'inherit' });
if (patch.status !== 0) process.exit(patch.status || 1);
console.log(`Behind the Curtain rebuilt: ${model.powerCenters.length} power centers, ${model.relationships.length} relationships, ${model.sources.length} sources, ${approvedIntakeEntries} approved intake entries.`);
