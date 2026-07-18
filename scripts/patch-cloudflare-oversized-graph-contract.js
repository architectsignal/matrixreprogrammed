const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const target = path.join(root, 'scripts', 'build-cloudflare-output.js');
const reportPath = path.join(root, 'downloads', 'cloudflare-oversized-graph-contract-patch.json');
if (!fs.existsSync(target)) throw new Error('scripts/build-cloudflare-output.js is missing');

const before = fs.readFileSync(target, 'utf8');
let after = before;
const oversizedRequired = "'data/investigation-knowledge-graph.json',";
if (after.includes(oversizedRequired)) after = after.replace(oversizedRequired, '');

const privateAnchor = "'downloads/public-data-lab-build.json','downloads/public-data-lab-test.json','downloads/public-data-lab-output-test.json'";
const privateReplacement = "'downloads/public-data-lab-build.json','downloads/public-data-lab-test.json','downloads/public-data-lab-output-test.json',\n  'data/investigation-knowledge-graph.json'";
if (!after.includes("'data/investigation-knowledge-graph.json'")) {
  if (!after.includes(privateAnchor)) throw new Error('Cloudflare private-path anchor is missing');
  after = after.replace(privateAnchor, privateReplacement);
}

for (const marker of [
  "'data/evidence-network-map.json'",
  "'search-index.json'",
  "'data/entity-registry.json'",
  "'data/relationship-registry.json'"
]) if (!after.includes(marker)) throw new Error(`Deployment-safe graph contract missing ${marker}`);
if (after.includes(oversizedRequired)) throw new Error('Oversized source graph remains a required Cloudflare asset');

if (after !== before) fs.writeFileSync(target, after);
const syntax = spawnSync(process.execPath, ['--check', target], { cwd: root, encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Cloudflare output builder syntax failed: ${syntax.stderr || syntax.stdout}`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: after !== before,
  excludedSourceAsset: 'data/investigation-knowledge-graph.json',
  reason: 'Source graph exceeds the 25 MiB Cloudflare static-asset ceiling.',
  deployedGraphArtifacts: ['data/evidence-network-map.json','data/entity-registry.json','data/relationship-registry.json','search-index.json','data/search-facets.json'],
  boundary: 'The full source graph remains in repository build data; public Cloudflare delivery uses the compact evidence graph, registries and deployment-safe search index.',
  syntaxChecked: true
}, null, 2));
console.log(`Cloudflare graph contract patched: oversized source graph excluded; deployment-safe graph and search artifacts remain required.`);
