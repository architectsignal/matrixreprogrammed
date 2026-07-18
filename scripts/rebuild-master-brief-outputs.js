const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const placeholder = /\[object Object\]|\bobject Object\b|(?:^|[\/-])object-object(?:\.html)?(?:$|[?#])/im;
const intentionalPolicy = /No\s+\[object Object\]\s+visible in public pages\.?/gi;

function hasMalformed(text) {
  return placeholder.test(String(text || '').replace(intentionalPolicy, ''));
}
function run(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`${relative} is missing`);
  const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) throw new Error(`${relative} failed with status ${result.status}`);
}
function removeMalformed(directory) {
  const full = path.join(root, directory);
  if (!fs.existsSync(full)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const file = path.join(full, entry.name);
    if (entry.isDirectory()) {
      removed.push(...removeMalformed(path.relative(root, file)));
      continue;
    }
    if (!/\.(?:html|json|md)$/i.test(entry.name)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/object-object/i.test(entry.name) || hasMalformed(text)) {
      fs.rmSync(file, { force: true });
      removed.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
  return removed;
}
function scan(relative, residual) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(full)) scan(path.join(relative, entry), residual);
    return;
  }
  if (!/\.(?:html|json|md)$/i.test(relative)) return;
  if (hasMalformed(fs.readFileSync(full, 'utf8'))) residual.push(relative.replace(/\\/g, '/'));
}

run('scripts/sanitize-machine-entity-inputs.js');
const removed = [
  ...removeMalformed('entity-timelines'),
  ...removeMalformed('institution-briefs'),
  ...removeMalformed('subject-briefs'),
  ...removeMalformed('reports')
];

run('scripts/build-master-brief-engine.js');
run('scripts/build-elite-report-writer.js');
run('scripts/build-information-gathering-conclusion-system.js');
run('scripts/sanitize-machine-entity-outputs.js');

for (const generated of ['data/site-freshness-report.json', 'site-freshness-report.html']) {
  const file = path.join(root, generated);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}
run('scripts/update-site-freshness-report.js');

const targets = [
  'daily-missing-records.html',
  'entity-timelines',
  'information-gathering-system.html',
  'institution-briefs',
  'machine-digest.html',
  'reports',
  'site-freshness-report.html',
  'subject-briefs',
  'data/missing-records.json',
  'data/entity-timelines.json',
  'data/institution-control-index.json',
  'data/subject-briefs.json',
  'data/information-gathering-system.json',
  'data/conclusion-engine.json'
];
const residual = [];
targets.forEach(target => scan(target, residual));

const report = {
  ok: residual.length === 0,
  generatedAt: new Date().toISOString(),
  removedStaleMalformedOutputs: [...new Set(removed)],
  residual: [...new Set(residual)],
  ignoredIntentionalPolicyText: 'No [object Object] visible in public pages.',
  boundary: 'Master briefs, subject reports, institution pages, timelines, machine digest, conclusion pages and freshness reports must be generated only from scalar-normalized inputs.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'recovery-master-output-rebuild.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Master output placeholders remain: ${report.residual.join(', ')}`);
console.log(`Master outputs rebuilt cleanly; removed ${report.removedStaleMalformedOutputs.length} stale malformed output(s).`);
