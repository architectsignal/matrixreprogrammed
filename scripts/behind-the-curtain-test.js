const fs = require('fs');
const path = require('path');

const root = process.cwd();
const must = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${relative}`);
  return fs.readFileSync(file, 'utf8');
};
const model = JSON.parse(must('data/behind-the-curtain.json'));
const html = must('behind-the-curtain.html');
const client = must('behind-the-curtain.js');
const classifications = new Set(Object.keys(model.classificationLabels || {}));
const score = center => Math.round((Object.entries(model.weights).reduce((sum, [key, weight]) => sum + Number(center.dimensions[key]) * Number(weight), 0) / 100) * 10) / 10;
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(Object.values(model.weights).reduce((sum, value) => sum + Number(value), 0) === 100, 'Score weights must total 100');
assert(Array.isArray(model.powerCenters) && model.powerCenters.length === 10, 'The master ranking must contain exactly 10 structural power centers');
assert(new Set(model.powerCenters.map(center => center.id)).size === 10, 'Power-center IDs must be unique');
assert(new Set(model.powerCenters.map(center => center.rank)).size === 10, 'Ranks must be unique');
model.powerCenters.forEach((center, index) => {
  assert(center.rank === index + 1, `${center.id} is out of rank order`);
  assert(classifications.has(center.classification), `${center.id} has invalid classification`);
  assert(['very_high', 'high', 'moderate', 'low', 'provisional'].includes(center.confidence), `${center.id} has invalid confidence`);
  assert(Math.abs(score(center) - Number(center.structuralPowerScore)) < 0.05, `${center.id} score does not match weighted dimensions`);
  assert(Array.isArray(center.sourceIds) && center.sourceIds.length > 0, `${center.id} lacks a source ledger`);
  assert(center.strongestCounterargument, `${center.id} lacks a red-team counterargument`);
  assert(center.replacementTest, `${center.id} lacks a replacement test`);
  assert(Array.isArray(center.canStop) && center.canStop.length > 0, `${center.id} lacks a veto test`);
});
for (let index = 1; index < model.powerCenters.length; index++) {
  assert(model.powerCenters[index - 1].structuralPowerScore >= model.powerCenters[index].structuralPowerScore, 'Ranking is not score-sorted');
}
const sourceIds = new Set(model.sources.map(source => source.id));
model.sources.forEach(source => {
  assert(/^https:\/\//.test(source.url), `${source.id} must use an HTTPS source URL`);
  assert(source.establishes && source.doesNotEstablish, `${source.id} lacks evidence boundaries`);
});
model.powerCenters.forEach(center => center.sourceIds.forEach(id => assert(sourceIds.has(id), `${center.id} references missing source ${id}`)));
model.relationships.forEach(edge => {
  assert(edge.source && edge.target && edge.type, 'Every relationship must be typed');
  assert(classifications.has(edge.classification), `Relationship ${edge.source}:${edge.target} has invalid classification`);
  assert(Array.isArray(edge.sourceIds) && edge.sourceIds.length > 0, `Relationship ${edge.source}:${edge.target} lacks sources`);
});
['top-ten','curtain-map','btc-chokepoints','btc-hypotheses','btc-unsupported','btc-missing','btc-sources'].forEach(id => assert(html.includes(`id="${id}"`), `Page missing section ${id}`));
assert(html.includes('BEHIND THE CURTAIN'), 'Page title missing');
assert(client.includes("fetch(`${DATA_URL}"), 'Client does not load the evidence package');
assert(client.includes('classificationVisible'), 'Client does not enforce evidence modes');

for (const relative of ['.github/workflows/deploy.yml','.github/workflows/deploy-production.yml','.github/workflows/one-shot-controlled-production.yml']) {
  const text = must(relative).toLowerCase();
  assert(!text.includes('wrangler@latest deploy') && !text.includes('wrangler deploy'), `${relative} must remain production-frozen`);
}
console.log(`BEHIND THE CURTAIN PASS: ${model.powerCenters.length}/10 ranked power centers, ${model.sources.length} bounded sources, ${model.relationships.length} typed relationships; production deploy paths remain frozen.`);
