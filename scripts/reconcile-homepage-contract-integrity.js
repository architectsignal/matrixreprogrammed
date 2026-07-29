'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const owner = path.join(root, 'scripts', 'reconcile-release-homepage-order.js');

if (!fs.existsSync(owner)) throw new Error('Canonical release homepage reconciler is missing');
const result = spawnSync(process.execPath, [owner], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 50 * 1024 * 1024
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error('Canonical release homepage reconciliation failed');

const repaired = [];
const checked = [];
function reconcile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(
    /<article\s+id=(['"])(consequence-[^'"]+)\1\s+class=(['"])consequence-contract-card compact\3/g,
    '<article data-contract-id="$2" class="consequence-contract-card compact"'
  );
  if (after !== before) {
    fs.writeFileSync(file, after);
    repaired.push(path.relative(root, file));
  }
  const text = after;
  const ids = [...text.matchAll(/\bid\s*=\s*(['"])([^'"]+)\1/gi)].map(match => match[2]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) throw new Error(`${path.relative(root, file)} still contains duplicate IDs: ${duplicates.join(', ')}`);
  if (!text.includes('href="live-intel.html"') || !text.includes('live-intel-machine-route')) {
    throw new Error(`${path.relative(root, file)} is missing the canonical Live Intel route contract`);
  }
  checked.push(path.relative(root, file));
}

reconcile(path.join(root, 'index.html'));
reconcile(path.join(outputRoot, 'index.html'));
reconcile(path.join(outputRoot, 'index'));

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  checked,
  repaired,
  rule: 'Full consequence-contract pages own anchor IDs. Compact homepage previews use data-contract-id, and the canonical Live Intel route is restored after every late release mutator.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-contract-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(outputRoot)) {
  fs.mkdirSync(path.join(outputRoot, 'downloads'), { recursive: true });
  fs.copyFileSync(path.join(root, 'downloads', 'homepage-contract-integrity.json'), path.join(outputRoot, 'downloads', 'homepage-contract-integrity.json'));
}
console.log(`Homepage contract integrity reconciled: ${repaired.length} compact preview file(s) repaired; Live Intel route preserved.`);
