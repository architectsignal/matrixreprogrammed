const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtimeDir = path.join(root, 'runtime');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(runtimeDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`Release metadata source missing: ${rel}`);
  const raw = fs.readFileSync(full, 'utf8');
  return { raw, data: JSON.parse(raw) };
}

const manifest = readJson('deploy-manifest.json');
const health = readJson('deploy-health.json');
if (!manifest.data.ok || !/^[a-f0-9]{40}$/i.test(String(manifest.data.commitSha || ''))) {
  throw new Error('deploy-manifest.json is not bound to a full commit SHA');
}
if (!health.data.ok || health.data.buildSha !== manifest.data.commitSha || health.data.manifestSha !== manifest.data.commitSha || health.data.manifestMatches !== true) {
  throw new Error('deploy-health.json does not match the current deployment manifest');
}
if (health.data.workerScript !== 'src/worker-production.js') {
  throw new Error('deploy-health.json does not identify the strict production Worker');
}

const outputs = {
  'runtime/deploy-manifest-current.json': manifest.raw.endsWith('\n') ? manifest.raw : `${manifest.raw}\n`,
  'runtime/deploy-health-current.json': health.raw.endsWith('\n') ? health.raw : `${health.raw}\n`
};
for (const [rel, value] of Object.entries(outputs)) fs.writeFileSync(path.join(root, rel), value);

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  commitSha: manifest.data.commitSha,
  manifestAsset: 'runtime/deploy-manifest-current.json',
  healthAsset: 'runtime/deploy-health-current.json',
  exactCopies: true,
  boundary: 'Versioned release metadata aliases are generated after the final health owner and are served through explicit no-store Worker routes.'
};
fs.writeFileSync(path.join(downloadsDir, 'release-metadata-assets.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Versioned release metadata assets published for ${manifest.data.commitSha.slice(0, 12)}.`);
