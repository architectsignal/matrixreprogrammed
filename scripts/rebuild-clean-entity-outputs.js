const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const placeholder = /\[object Object\]|\bobject Object\b/;
function run(relative) {
  const result = spawnSync(process.execPath, [path.join(root, relative)], { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${relative} failed:\n${result.stderr || result.stdout}`);
  process.stdout.write(result.stdout || '');
}
function removeMalformed(directory) {
  const full = path.join(root, directory);
  if (!fs.existsSync(full)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const file = path.join(full, entry.name);
    if (placeholder.test(fs.readFileSync(file, 'utf8'))) {
      fs.unlinkSync(file);
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
  if (placeholder.test(fs.readFileSync(full, 'utf8'))) residual.push(relative.replace(/\\/g, '/'));
}

run('scripts/repair-entity-exposure-object-names.js');
const removed = [
  ...removeMalformed('entity-briefs'),
  ...removeMalformed('entity-exposure')
];
run('scripts/build-entity-daily-briefs.js');
run('scripts/build-entity-exposure-index.js');

const residual = [];
for (const target of [
  'data/entity-daily-briefs.json',
  'data/entity-exposure-index.json',
  'entity-daily-briefs.html',
  'entity-exposure-index.html',
  'entity-briefs',
  'entity-exposure',
  'downloads/entity-daily-briefs.md',
  'downloads/entity-exposure-index.md'
]) scan(target, residual);

const report = {
  ok: residual.length === 0,
  generatedAt: new Date().toISOString(),
  removedStaleMalformedPages: removed,
  residual,
  boundary: 'Object-valued upstream fields must resolve to a meaningful entity label or be excluded. A placeholder is never a valid entity.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'recovery-entity-output-rebuild.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Entity output placeholders remain: ${residual.join(', ')}`);
console.log(`Clean entity outputs rebuilt; removed ${removed.length} stale malformed page(s).`);
