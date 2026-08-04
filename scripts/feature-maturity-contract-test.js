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
  const bodyState = html.match(/<body\b[^>]*data-feature-maturity=["']([^"']+)["'][^>]*>/i)?.[1] || '';
  return {
    blockHash: crypto.createHash('sha256').update(block).digest('hex'),
    blockBytes: Buffer.byteLength(block),
    markerStarts: count(html, /<!-- feature-maturity:start -->/gi),
    markerEnds: count(html, /<!-- feature-maturity:end -->/gi),
    maturitySections: count(html, /<section\b[^>]*class=["'][^"']*\bfeature-maturity\b[^"']*["']/gi),
    styleBlocks: count(html, /id=["']feature-maturity-style["']/gi),
    bodyState,
    h1Count: count(html, /<h1\b/gi),
    mainCount: count(html, /<main\b/gi)
  };
}
function navText(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return '';
  const html = fs.readFileSync(file, 'utf8');
  return (html.match(/<nav\b[\s\S]*?<\/nav>/gi) || []).join('\n');
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
  need(second.markerStarts === 1 && second.markerEnds === 1, `${relative} does not contain exactly one maturity marker pair`);
  need(second.maturitySections === 1, `${relative} does not contain exactly one maturity section`);
  need(second.styleBlocks === 1, `${relative} does not contain exactly one maturity style block`);
  need(second.h1Count >= 1 && second.mainCount === 1, `${relative} lost its reader page structure`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'feature-maturity.json'), 'utf8'));
need(manifest.ok === true, 'Feature maturity manifest is not healthy');
need(Array.isArray(manifest.features) && manifest.features.length === 4, `Expected four classified features; found ${manifest.features?.length || 0}`);
need(Array.isArray(manifest.primaryPromotionWithheld) && manifest.primaryPromotionWithheld.length === 4, 'All four current pilot systems should be withheld from primary promotion');

for (const feature of manifest.features || []) {
  need(expected[feature.id] === feature.stage, `${feature.id} has unexpected maturity stage ${feature.stage}`);
  need(feature.primaryPromotion === false, `${feature.id} is promoted without its defining verified output`);
  need(Number(feature.verifiedOutputCount) === 0, `${feature.id} invents a verified public output`);
  need(Number(feature.patchedSurfaces) >= 1, `${feature.id} did not patch a public surface`);
  need(typeof feature.activationRule === 'string' && feature.activationRule.length > 60, `${feature.id} lacks a concrete activation rule`);
  const html = fs.readFileSync(path.join(root, feature.route), 'utf8');
  need(html.includes(`data-feature-id="${feature.id}"`), `${feature.route} lacks the feature maturity block`);
  need(html.includes(`data-feature-maturity="${feature.stage}"`), `${feature.route} lacks the expected maturity state`);
  need(html.includes('data-primary-promotion="false"'), `${feature.route} does not disclose withheld primary promotion`);
  need(html.includes('Activation rule:'), `${feature.route} lacks the activation rule`);
}

const answerData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'public-answer-clocks.json'), 'utf8'));
const receiptData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'lived-consequence-receipts.json'), 'utf8'));
const halfLifeData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'evidence-half-life.json'), 'utf8'));
const diffData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'power-diff.json'), 'utf8'));
need(Number(answerData.runningCount) === 0, 'Fixture changed: Public Answer Clock now has a verified running clock and should be reclassified');
need(Number(receiptData.count) === 0, 'Fixture changed: reviewed public receipts now exist and should be reclassified');
need(Number(halfLifeData.recallCount) === 0, 'Fixture changed: active recall notices now exist and should be reclassified');
need(diffData.baselineAvailable === false && Number(diffData.materialDiffCount) === 0, 'Fixture changed: a genuine prior baseline or material diff now exists and should be reclassified');

for (const relative of ['index.html', 'start-here.html']) {
  const nav = navText(relative);
  for (const feature of manifest.features || []) {
    need(!nav.includes(feature.route), `${relative} primary navigation promotes immature ${feature.id}`);
  }
}

const aliasOwner = fs.readFileSync(path.join(root, 'scripts', 'finalize-public-route-aliases.js'), 'utf8');
need(aliasOwner.includes("require('./finalize-feature-maturity.js')"), 'Final route owner does not reapply feature maturity after legacy generators');
need(aliasOwner.indexOf("require('./finalize-feature-maturity.js')") < aliasOwner.indexOf("require('./finalize-clean-public-search.js')"), 'Search is finalized before feature maturity copy and navigation state');

const finalizerSource = fs.readFileSync(finalizerPath, 'utf8');
for (const forbidden of ['clockRunning = true', 'receiptData.count =', 'recallCount =', 'baselineAvailable = true', 'materialDiffCount =']) {
  need(!finalizerSource.includes(forbidden), `Feature maturity finalizer contains synthetic output mutation: ${forbidden}`);
}
need(!/fetch\s*\(|d1\s+execute|wrangler\s+deploy|method:\s*['"](?:POST|DELETE|PUT|PATCH)/i.test(finalizerSource), 'Feature maturity finalizer contains a network or application-data mutation path');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  classifiedFeatures: manifest.features?.length || 0,
  primaryPromotionWithheld: manifest.primaryPromotionWithheld || [],
  stages: Object.fromEntries((manifest.features || []).map(feature => [feature.id, feature.stage])),
  repeatSafety: secondStates,
  boundary: 'Pilot systems stay publicly inspectable for transparency or intake, but primary promotion remains withheld until the defining verified output actually exists. Repeat safety means one stable maturity block, body state and style block without duplicated sections or reader-content loss. The finalizer never creates clocks, receipts, recalls, historical baselines or material differences.',
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('FEATURE MATURITY CONTRACT FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('FEATURE MATURITY CONTRACT PASSED: four pilot systems receive honest empty/baseline states, semantic repeat safety, no synthetic output and no primary-navigation promotion.');
