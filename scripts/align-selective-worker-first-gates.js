const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const wranglerFile = path.join(root, 'wrangler.toml');
const wrangler = fs.readFileSync(wranglerFile, 'utf8');

if (!/^run_worker_first\s*=\s*\[/m.test(wrangler)) {
  throw new Error('wrangler.toml does not use the required selective run_worker_first route array');
}
if (/^run_worker_first\s*=\s*true\s*$/m.test(wrangler)) {
  throw new Error('wrangler.toml still sends all static traffic through the Worker');
}

const targets = [
  {
    file: 'scripts/build-production-health.js',
    obsolete: ["'run_worker_first = true'"],
    verify(source) {
      return source.includes('const selectiveWorkerRoutingReady')
        && source.includes('/^run_worker_first\\s*=\\s*\\[/m.test(wranglerToml)')
        && source.includes('!/^run_worker_first\\s*=\\s*true\\s*$/m.test(wranglerToml)')
        && source.includes('selectiveWorkerRoutingReady');
    }
  },
  {
    file: 'scripts/production-deploy-guard.js',
    obsolete: ["'run_worker_first = true','keep_vars = true'", "'run_worker_first = true'"],
    verify(source) {
      return source.includes('const selectiveWorkerRoutingReady')
        && source.includes('/^run_worker_first\\s*=\\s*\\[/m.test(wranglerToml)')
        && source.includes('!/^run_worker_first\\s*=\\s*true\\s*$/m.test(wranglerToml)')
        && source.includes("hard.push('wrangler.toml must use selective run_worker_first route protection");
    }
  }
];

const changed = [];
for (const target of targets) {
  const file = path.join(root, target.file);
  if (!fs.existsSync(file)) throw new Error(`Selective Worker-first gate target missing: ${target.file}`);
  const before = fs.readFileSync(file, 'utf8');
  let after = before;

  for (const obsolete of target.obsolete) {
    const occurrences = after.split(obsolete).length - 1;
    if (occurrences > 1) throw new Error(`${target.file} contains ${occurrences} obsolete Worker-first assertions for ${obsolete}; expected at most one`);
    if (occurrences === 1) {
      if (obsolete === "'run_worker_first = true','keep_vars = true'") {
        after = after.replace(obsolete, "'run_worker_first = [','keep_vars = true'");
      } else {
        after = after.replace(obsolete, "'run_worker_first = ['");
      }
    }
  }

  if (!target.verify(after)) {
    throw new Error(`${target.file} does not semantically verify the selective Worker-first array`);
  }
  if (/^run_worker_first\s*=\s*true\s*$/m.test(after)) {
    throw new Error(`${target.file} still accepts global Worker-first routing`);
  }
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(target.file);
  }
}

// This script is the last pre-manifest reconciliation point in the production
// release chain. Reapply the canonical homepage only after broad generators,
// then let the deploy manifest hash that exact source/output state.
const homepageOwner = path.join(root, 'scripts', 'reconcile-release-homepage-order.js');
if (!fs.existsSync(homepageOwner)) throw new Error('Canonical release homepage reconciler is missing');
const homepageResult = spawnSync(process.execPath, [homepageOwner], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 1024 * 1024 * 50
});
if (homepageResult.stdout) process.stdout.write(homepageResult.stdout);
if (homepageResult.stderr) process.stderr.write(homepageResult.stderr);
if (homepageResult.status !== 0) throw new Error('Canonical release homepage reconciliation failed');

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  routingMode: 'selective-worker-first-array',
  validationMode: 'semantic-contract',
  staticAssetsBypassWorker: true,
  protectedAndDynamicRoutesUseWorker: true,
  homepageOwnerReconciledBeforeManifest: true,
  changed,
  checked: targets.map(item => item.file)
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'selective-worker-first-gate-alignment.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Selective Worker-first release gates aligned semantically: ${changed.length} file(s) updated; canonical homepage owner reconciled before manifest hashing.`);
