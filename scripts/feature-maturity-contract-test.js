'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const finalizerPath = path.join(root, 'scripts', 'finalize-feature-maturity.js');
const reportPath = path.join(root, 'downloads', 'feature-maturity-contract-test.json');
const pages = [
  'public-answer-clock.html',
  'lived-consequence-receipts.html',
  'evidence-half-life.html',
  'power-diff.html'
];
const expected = {
  'public-answer-clock': 'pilot-awaiting-verified-delivery',
  'lived-consequence-receipts': 'private-intake-no-reviewed-public-receipts',
  'evidence-half-life': 'monitoring-no-active-recalls',
  'power-diff': 'baseline-building-no-material-diff'
};
const failures = [];
const need = (condition, message) => { if (!condition) failures.push(message); };

function runFinalizer() {
  const result = spawnSync(process.execPath, [finalizerPath], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  need(result.status === 0, `Feature maturity finalizer exited ${result.status}`);
}
function count(text, expression) { return (String(text || '').match(expression) || []).length; }
function semanticState(relative) {
  const html = fs.readFileSync(path.join(root, relative), 'utf8');
  const block = html.match(/<!-- feature-maturity:start -->[\s\S]*?<!-- feature-maturity:end -->/i)?.[0] || '';
  return {
    blockHash: crypto.createHash('sha256').update(block).digest('hex'),
    markerStarts: count(html, /<!-- feature-maturity:start -->/gi),
    markerEnds: count(html, /<!-- feature-maturity:end -->/gi),
    maturitySections: count(html, /<section\b[^>]*class=["'][^"']*\bfeature-maturity\b[^"']*["']/gi),
    styleBlocks: count(html, /id=["']feature-maturity-style["']/gi),
    h1Count: count(html, /<h1\b/gi),
    mainCount: count(html, /<main\b/gi),
    publicLabels: count(html, /data-publication-visibility=["']public["']/gi),
    withheldWords: count(block, /\bwithheld?\b/gi)
  };
}

need(fs.existsSync(finalizerPath), 'Feature maturity finalizer is missing');
const syntax = spawnSync(process.execPath, ['--check', finalizerPath], { cwd: root, encoding: 'utf8' });
need(syntax.status === 0, `Feature maturity syntax failed: ${syntax.stderr || syntax.stdout || syntax.status}`);

runFinalizer();
const firstStates = Object.fromEntries(pages.map(relative => [relative, semanticState(relative)]));
runFinalizer();
const secondStates = Object.fromEntries(pages.map(relative => [relative, semanticState(relative)]));
for (const relative of pages) {
  const first = firstStates[relative];
  const second = secondStates[relative];
  need(JSON.stringify(second) === JSON.stringify(first), `${relative} maturity semantics changed across repeated finalization`);
  need(second.markerStarts === 1 && second.markerEnds === 1, `${relative} lacks exactly one maturity marker pair`);
  need(second.maturitySections === 1, `${relative} lacks exactly one maturity section`);
  need(second.styleBlocks === 1, `${relative} lacks exactly one maturity style block`);
  need(second.h1Count >= 1 && second.mainCount === 1, `${relative} lost reader-page structure`);
  need(second.publicLabels === 1, `${relative} is not explicitly public`);
  need(second.withheldWords === 0, `${relative} uses withholding language`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'feature-maturity.json'), 'utf8'));
need(manifest.ok === true, 'Feature maturity manifest is not healthy');
need(manifest.publicationRule === 'publish-and-label-all-feature-states', 'Feature publication rule drifted');
need(manifest.withholdingAllowed === false, 'Feature manifest permits withholding');
need(Array.isArray(manifest.withheldRoutes) && manifest.withheldRoutes.length === 0, 'A feature route is withheld');
need(Array.isArray(manifest.publicRoutes) && manifest.publicRoutes.length === 4, 'All four feature routes are not public');
need(Array.isArray(manifest.features) && manifest.features.length === 4, `Expected four classified features; found ${manifest.features?.length || 0}`);

for (const feature of manifest.features || []) {
  need(expected[feature.id] === feature.stage, `${feature.id} has unexpected stage ${feature.stage}`);
  need(feature.publicationVisibility === 'public', `${feature.id} is not public`);
  need(feature.labelRequired === true, `${feature.id} does not require a maturity label`);
  need(Number(feature.verifiedOutputCount) === 0, `${feature.id} invents verified output`);
  need(feature.verifiedOutputAvailable === false, `${feature.id} claims verified output`);
  need(feature.primaryRecommendationEligible === false, `${feature.id} is described as a verified recommendation`);
  need(Number(feature.patchedSurfaces) >= 1, `${feature.id} did not patch a public surface`);
  need(typeof feature.activationRule === 'string' && feature.activationRule.length > 60, `${feature.id} lacks a verification rule`);
  const html = fs.readFileSync(path.join(root, feature.route), 'utf8');
  need(html.includes(`data-feature-id="${feature.id}"`), `${feature.route} lacks its maturity block`);
  need(html.includes('data-publication-visibility="public"'), `${feature.route} lacks its public label`);
  need(html.includes('PILOT · NO VERIFIED OUTPUT YET'), `${feature.route} lacks the honest pilot label`);
  need(html.includes('Verification rule:'), `${feature.route} lacks its verification rule`);
}

const answerData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'public-answer-clocks.json'), 'utf8'));
const receiptData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'lived-consequence-receipts.json'), 'utf8'));
const halfLifeData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'evidence-half-life.json'), 'utf8'));
const diffData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'power-diff.json'), 'utf8'));
need(Number(answerData.runningCount) === 0, 'Fixture changed: a verified running clock now exists');
need(Number(receiptData.count) === 0, 'Fixture changed: a reviewed public receipt now exists');
need(Number(halfLifeData.recallCount) === 0, 'Fixture changed: an active recall notice now exists');
need(diffData.baselineAvailable === false && Number(diffData.materialDiffCount) === 0, 'Fixture changed: a prior baseline or material difference now exists');

const aliasOwner = fs.readFileSync(path.join(root, 'scripts', 'finalize-public-route-aliases.js'), 'utf8');
need(aliasOwner.includes("require('./finalize-feature-maturity.js')"), 'Final route owner does not reapply feature maturity');
need(aliasOwner.indexOf("require('./finalize-feature-maturity.js')") < aliasOwner.indexOf("require('./finalize-clean-public-search.js')"), 'Search is finalized before maturity labels');

const finalizerSource = fs.readFileSync(finalizerPath, 'utf8');
for (const forbidden of [
  'removePrimaryNavPromotions',
  'withheldRoutes = features',
  'clockRunning = true',
  'receiptData.count =',
  'recallCount =',
  'baselineAvailable = true',
  'materialDiffCount ='
]) need(!finalizerSource.includes(forbidden), `Feature maturity contains forbidden behavior: ${forbidden}`);
need(!/fetch\s*\(|d1\s+execute|wrangler\s+deploy|method:\s*['"](?:POST|DELETE|PUT|PATCH)/i.test(finalizerSource), 'Feature maturity contains a network or application-data mutation path');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  classifiedFeatures: manifest.features?.length || 0,
  publicRoutes: manifest.publicRoutes || [],
  withheldRoutes: manifest.withheldRoutes || [],
  stages: Object.fromEntries((manifest.features || []).map(feature => [feature.id, feature.stage])),
  repeatSafety: secondStates,
  boundary: 'All four systems remain public. Empty or baseline-building output is labelled visibly and never converted into synthetic activity, a confirmed event or a verified recommendation.',
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('FEATURE MATURITY CONTRACT FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('FEATURE MATURITY CONTRACT PASSED: four public pilot systems are honestly labelled; zero routes withheld and zero synthetic output.');
