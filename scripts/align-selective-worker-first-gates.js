const fs = require('fs');
const path = require('path');

const root = process.cwd();
const wranglerFile = path.join(root, 'wrangler.toml');
const wrangler = fs.readFileSync(wranglerFile, 'utf8');

if (!/^run_worker_first\s*=\s*\[/m.test(wrangler)) {
  throw new Error('wrangler.toml does not use the required selective run_worker_first route array');
}
if (/^run_worker_first\s*=\s*true\s*$/m.test(wrangler)) {
  throw new Error('wrangler.toml still sends all static traffic through the Worker');
}

const patches = [
  {
    file: 'scripts/build-production-health.js',
    from: "'run_worker_first = true'",
    to: "'run_worker_first = ['"
  },
  {
    file: 'scripts/production-deploy-guard.js',
    from: "'run_worker_first = true','keep_vars = true'",
    to: "'run_worker_first = [','keep_vars = true'"
  }
];

const changed = [];
for (const patch of patches) {
  const file = path.join(root, patch.file);
  if (!fs.existsSync(file)) throw new Error(`Selective Worker-first gate target missing: ${patch.file}`);
  const before = fs.readFileSync(file, 'utf8');
  const occurrences = before.split(patch.from).length - 1;
  if (occurrences > 1) throw new Error(`${patch.file} contains ${occurrences} obsolete Worker-first assertions; expected at most one`);
  const after = before.includes(patch.from) ? before.replace(patch.from, patch.to) : before;
  if (!after.includes(patch.to)) throw new Error(`${patch.file} does not verify the selective Worker-first array`);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(patch.file);
  }
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  routingMode: 'selective-worker-first-array',
  staticAssetsBypassWorker: true,
  protectedAndDynamicRoutesUseWorker: true,
  changed,
  checked: patches.map(item => item.file)
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'selective-worker-first-gate-alignment.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Selective Worker-first release gates aligned: ${changed.length} file(s) updated.`);
