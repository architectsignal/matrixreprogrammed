const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const runtime = 'power-dossier-runtime.js';
const runtimePath = path.join(root, runtime);
const output = path.join(root, '_site');
const roots = [root, output].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const failures = [];
const files = [];
let patched = 0;
let copiedRuntime = false;

if (!fs.existsSync(runtimePath)) failures.push(`${runtime} missing`);
const runtimeSource = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : '';
if (runtimeSource) {
  for (const marker of ['DOSSIER TEMPORARILY UNAVAILABLE', "fetch('data/power-dossiers.json'", 'document.documentElement.dataset.dossierState']) {
    if (!runtimeSource.includes(marker)) failures.push(`${runtime} missing ${marker}`);
  }
}
if (fs.existsSync(output) && runtimeSource) {
  const outputRuntime = path.join(output, runtime);
  if (!fs.existsSync(outputRuntime) || fs.readFileSync(outputRuntime, 'utf8') !== runtimeSource) {
    fs.writeFileSync(outputRuntime, runtimeSource);
    copiedRuntime = true;
  }
}

function isDossierFile(base, name) {
  if (!/^dossier-[a-z0-9-]+(?:\.html)?$/i.test(name)) return false;
  const file = path.join(base, name);
  try { return fs.statSync(file).isFile(); } catch { return false; }
}
function runRequired(script) {
  const file = path.join(root, script);
  if (!fs.existsSync(file)) {
    failures.push(`${script} missing`);
    return { status: 1, stdout: '', stderr: 'missing' };
  }
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 50
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failures.push(`${script} failed with exit ${result.status}`);
  return result;
}

for (const base of roots) {
  for (const name of fs.readdirSync(base).filter(name => isDossierFile(base, name))) {
    const file = path.join(base, name);
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('id="name"') || !html.includes('id="content"') || !html.includes('data/power-dossiers.json')) continue;
    files.push(path.relative(root, file).replace(/\\/g, '/'));
    if (!html.includes(`<script src="${runtime}"></script>`)) {
      if (html.includes('</body>')) html = html.replace('</body>', `<script src="${runtime}"></script></body>`);
      else html += `<script src="${runtime}"></script>`;
      fs.writeFileSync(file, html);
      patched++;
    }
    const after = fs.readFileSync(file, 'utf8');
    if (!after.includes(`<script src="${runtime}"></script>`)) failures.push(`${path.relative(root, file)} missing resilient dossier runtime`);
  }
}

if (fs.existsSync(output) && !fs.existsSync(path.join(output, runtime))) failures.push(`_site/${runtime} missing from Cloudflare output`);

const officialWaveMerge = runRequired('scripts/merge-predators-official-wave4.js');
const engineBuild = failures.length ? { status: 1, stdout: '', stderr: 'skipped after official wave failure' } : runRequired('scripts/build-criminal-conduct-engine.js');
const engineAliasSync = failures.length ? { status: 1, stdout: '', stderr: 'skipped after engine build failure' } : runRequired('scripts/sync-criminal-conduct-extensionless.js');
const engineTest = failures.length ? { status: 1, stdout: '', stderr: 'skipped after engine or alias failure' } : runRequired('scripts/criminal-conduct-engine-pressure-test.js');
const predatorsBuild = failures.length ? { status: 1, stdout: '', stderr: 'skipped after criminal conduct engine failure' } : runRequired('scripts/build-predators-in-power.js');
const predatorsRumorPatch = failures.length ? { status: 1, stdout: '', stderr: 'skipped after Predators in Power build failure' } : runRequired('scripts/patch-predators-rumor-ledger.js');
const predatorsExpansionBuild = failures.length ? { status: 1, stdout: '', stderr: 'skipped after rumor-ledger patch failure' } : runRequired('scripts/expand-predators-in-power.js');
const predatorsExpansionDom = failures.length ? { status: 1, stdout: '', stderr: 'skipped after Predators expansion build failure' } : runRequired('scripts/fix-predators-expansion-dom-ready.js');
const predatorsConductLinks = failures.length ? { status: 1, stdout: '', stderr: 'skipped after Predators in Power expansion failure' } : runRequired('scripts/link-predators-in-power-from-conduct-engine.js');
const predatorsSync = failures.length ? { status: 1, stdout: '', stderr: 'skipped after Predators in Power conduct-link failure' } : runRequired('scripts/sync-predators-in-power-output.js');
const predatorsTest = failures.length ? { status: 1, stdout: '', stderr: 'skipped after Predators in Power output failure' } : runRequired('scripts/predators-in-power-pressure-test.js');
const predatorsExpansionTest = failures.length ? { status: 1, stdout: '', stderr: 'skipped after base Predators pressure test failure' } : runRequired('scripts/predators-in-power-expansion-test.js');
const universalCoverage = failures.length ? { status: 1, stdout: '', stderr: 'skipped after core dossier engines failed' } : runRequired('scripts/enforce-universal-criminal-dossier-coverage.js');
const universalCoverageTest = failures.length ? { status: 1, stdout: '', stderr: 'skipped after universal coverage build failure' } : runRequired('scripts/universal-criminal-dossier-coverage-test.js');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  roots: roots.map(value => path.relative(root, value) || '.'),
  dossierPagesFound: files.length,
  dossierPagesPatched: patched,
  runtime,
  copiedRuntime,
  criminalConductEngine: {
    officialWaveMergeStatus: officialWaveMerge.status,
    officialWaveReport: 'downloads/predators-in-power-official-wave4-merge.json',
    buildStatus: engineBuild.status,
    extensionlessSyncStatus: engineAliasSync.status,
    pressureTestStatus: engineTest.status,
    report: 'downloads/criminal-conduct-engine-report.json',
    extensionlessReport: 'downloads/criminal-conduct-extensionless-sync.json',
    reviewQueue: 'downloads/criminal-conduct-review-queue.json',
    pressureTest: 'downloads/criminal-conduct-engine-pressure-test.json'
  },
  predatorsInPower: {
    buildStatus: predatorsBuild.status,
    rumorLedgerPatchStatus: predatorsRumorPatch.status,
    expansionBuildStatus: predatorsExpansionBuild.status,
    expansionDomStatus: predatorsExpansionDom.status,
    conductLinkStatus: predatorsConductLinks.status,
    outputSyncStatus: predatorsSync.status,
    pressureTestStatus: predatorsTest.status,
    expansionPressureTestStatus: predatorsExpansionTest.status,
    page: 'predators-in-power.html',
    data: 'data/predators-in-power.json',
    buildReport: 'downloads/predators-in-power-build-report.json',
    expansionReport: 'downloads/predators-in-power-expansion-report.json',
    currentPowerData: 'downloads/predators-in-power-current-power.json',
    childFocusData: 'downloads/predators-in-power-child-focus.json',
    claimsReviewData: 'downloads/predators-in-power-claims-review.json',
    expandedCsv: 'downloads/predators-in-power-expanded.csv',
    conductLinksReport: 'downloads/predators-in-power-conduct-links.json',
    outputReport: 'downloads/predators-in-power-output-sync.json',
    pressureTest: 'downloads/predators-in-power-pressure-test.json',
    expansionPressureTest: 'downloads/predators-in-power-expansion-test.json',
    contract: 'Every approved child-focused conduct record with a separately sourced power role must appear. Every relevant rumor or speculation record must enter the separate public ledger: named when publicly attributable, redacted when anonymous or untraceable. Rumors carry zero verified-evidence or guilt weight.'
  },
  universalCriminalDossierCoverage: {
    buildStatus: universalCoverage.status,
    pressureTestStatus: universalCoverageTest.status,
    report: 'downloads/universal-criminal-dossier-coverage.json',
    pressureTest: 'downloads/universal-criminal-dossier-coverage-test.json',
    contract: 'Every qualifying dossier is independently detected and contains either editorially approved records or an explicit no-verified-match boundary.'
  },
  files,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-dossier-runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`POWER DOSSIER RUNTIME FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Power dossier runtime wired across source and Cloudflare output: ${files.length} legacy power-dossier page(s), ${patched} newly patched, runtime copy ${copiedRuntime ? 'updated' : 'current'}; official 2026 Predators wave, Criminal Conduct & Allegations, public rumor/speculation ledger, expanded Predators in Power and universal every-dossier coverage built, cross-linked, synchronized and independently pressure-tested.`);
