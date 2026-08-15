'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

for (const relative of [
  'package.json',
  'scripts/reconcile-public-audit-boundaries.js',
  'scripts/finalize-black-file-postbuild.js',
  'scripts/finalize-black-file-public-hero.js',
  'scripts/finalize-public-route-aliases.js',
  'scripts/patch-release-metadata-routing.js',
  'scripts/exhaustive-public-site-audit-v2.js'
]) {
  need(fs.existsSync(path.join(root, relative)), `Missing required owner: ${relative}`);
}

if (!problems.length) {
  const pkg = JSON.parse(read('package.json'));
  const postbuild = String(pkg.scripts?.postbuild || '');
  const reconciliation = read('scripts/reconcile-public-audit-boundaries.js');
  const recoveryFinalizer = read('scripts/finalize-black-file-postbuild.js');
  const finalizer = read('scripts/finalize-black-file-public-hero.js');
  const deployBoundary = read('scripts/patch-release-metadata-routing.js');
  const auditBoundary = read('scripts/exhaustive-public-site-audit-v2.js');

  need(postbuild.includes('reconcile-public-audit-boundaries.js'),
    'npm postbuild does not invoke the public-audit reconciliation owner');
  need(reconciliation.includes("require('./finalize-black-file-postbuild.js')"),
    'postbuild reconciliation does not invoke the Black File recovery and hero owner');
  need(reconciliation.includes("require('./finalize-public-route-aliases.js')"),
    'postbuild reconciliation does not invoke the final alias owner');
  need(reconciliation.indexOf("require('./finalize-black-file-postbuild.js')")
    < reconciliation.indexOf("require('./finalize-public-route-aliases.js')"),
  'Black File hero is finalized after deployable alias synchronization');
  need(reconciliation.includes('blackFileHeroFinalized'),
    'postbuild report does not expose Black File hero completion');
  need(reconciliation.includes('blackFileHeroSurfaces'),
    'postbuild report does not expose finalized Black File surfaces');
  need(finalizer.includes('...report'),
    'Black File finalizer does not export its success report to postbuild owners');
  need(recoveryFinalizer.includes('recoverCanonicalSource()'),
    'Black File postbuild owner does not recover a canonical HTML sibling before strict hero finalization');
  need(deployBoundary.includes("require('./finalize-black-file-public-hero.js')"),
    'deploy-guard boundary does not reassert the Black File hero');
  need(auditBoundary.includes("require('./finalize-black-file-public-hero.js')"),
    'exhaustive-audit boundary does not reassert the Black File hero');
  need(!/fetch\s*\(|wrangler\s+(?:deploy|d1)|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(`${recoveryFinalizer}\n${finalizer}`),
    'Black File recovery/finalizer contains a network, deploy or application-data mutation path');
}

const report = {
  ok: problems.length === 0,
  generatedAt: new Date().toISOString(),
  owners: {
    normalBuild: 'scripts/reconcile-public-audit-boundaries.js',
    canonicalHero: 'scripts/finalize-black-file-postbuild.js',
    deployGuard: 'scripts/patch-release-metadata-routing.js',
    exhaustiveAudit: 'scripts/exhaustive-public-site-audit-v2.js'
  },
  boundary: 'The canonical Black File hero must run through the sibling-recovery wrapper during ordinary npm postbuild before alias synchronization, and it must be reasserted at deploy and exhaustive-audit boundaries. The owner is local, deterministic and non-networked.',
  problems
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'black-file-postbuild-contract-test.json'), `${JSON.stringify(report, null, 2)}\n`);

if (problems.length) {
  console.error('BLACK FILE POSTBUILD CONTRACT FAILED');
  problems.forEach(problem => console.error(`- ${problem}`));
  process.exit(1);
}
console.log('BLACK FILE POSTBUILD CONTRACT PASSED');
console.log('Canonical hero ordering is enforced across normal build, deploy guard and exhaustive audit boundaries.');
