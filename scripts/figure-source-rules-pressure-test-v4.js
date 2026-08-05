'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const at = relative => path.join(root, relative);
const exists = relative => fs.existsSync(at(relative));
const read = relative => fs.readFileSync(at(relative), 'utf8');
const need = (condition, message) => { if (!condition) failures.push(message); };
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const requiredFiles = [
  'data/figure-source-rules.json',
  'data/sensitive-figure-policy.json',
  'data/sensitive-publication-policy.json',
  'scripts/update-site-freshness-report.js',
  'scripts/update-site-freshness-report-v4.js',
  'scripts/sensitive-figure-classification-regression-test.js',
  '.github/workflows/p1-sensitive-figure-review.yml',
  '.github/workflows/live-intel-update.yml',
  'package.json'
];
for (const file of requiredFiles) need(exists(file), `missing required file: ${file}`);
if (failures.length) finish();

const sourceRules = JSON.parse(read('data/figure-source-rules.json'));
const figurePolicy = JSON.parse(read('data/sensitive-figure-policy.json'));
const publicationPolicy = JSON.parse(read('data/sensitive-publication-policy.json'));
const scanner = read('scripts/update-site-freshness-report-v4.js');
const workflow = read('.github/workflows/p1-sensitive-figure-review.yml');

need(sourceRules.defaultAction === 'flag-for-review',
  'source-rule default action must remain flag-for-review');
need(Array.isArray(sourceRules.rules) && sourceRules.rules.length >= 8,
  'at least eight source rules are required');
for (const policy of [
  'auto-update-allowed',
  'manual-review-only',
  'do-not-auto-update',
  'manual-review-before-public-claim'
]) need(sourceRules.rules.some(rule => rule.updatePolicy === policy),
  `missing update policy: ${policy}`);
for (const rule of sourceRules.rules || []) {
  for (const field of [
    'id', 'label', 'filePatterns', 'figurePatterns', 'sourceType', 'sourceFiles',
    'sourceName', 'publisher', 'sourceDatePolicy', 'scope',
    'evidenceClassification', 'updatePolicy', 'reviewNote'
  ]) need(Object.prototype.hasOwnProperty.call(rule, field),
    `source rule ${rule.id || 'unknown'} missing ${field}`);
}

for (const field of [
  'sourceName', 'publisher', 'sourceDate', 'scope', 'evidenceClassification',
  'updatePolicy', 'publicReviewStatus'
]) need(figurePolicy.requiredFields?.includes(field),
  `sensitive figure policy missing ${field}`);
for (const category of [
  'epstein-victim-sensitive',
  'criminal-allegation-court',
  'health-vaccine-medical',
  'death-casualty-human-cost',
  'migration-crime-demographic',
  'financial-market-control',
  'risk-clock-probability',
  'public-policy-statistic'
]) need((figurePolicy.categories || []).some(item => item.id === category),
  `sensitive figure policy missing category ${category}`);

need(publicationPolicy.publicationRule === 'publish-all-with-evidence-status-label',
  'publication policy does not use publish-all-with-evidence-status-label');
need(publicationPolicy.withholdingAllowed === false,
  'publication policy permits withholding');
for (const field of [
  'publicationAllowed', 'publicationStatus', 'publicLabel', 'humanReviewStatus',
  'confirmationStatus', 'evidenceStatus', 'labelRequired'
]) need(publicationPolicy.requiredPublicationFields?.includes(field),
  `publication policy missing required field ${field}`);
for (const label of Object.values(publicationPolicy.labels || {})) {
  need(typeof label === 'string' && label.includes('NOT HUMAN REVIEWED'),
    `publication label lacks NOT HUMAN REVIEWED: ${String(label)}`);
}

need(read('scripts/update-site-freshness-report.js')
  .includes("require('./update-site-freshness-report-v4.js');"),
'legacy scanner entrypoint does not delegate to v4');
for (const marker of [
  'site-freshness-v4',
  'publicationAllowed: true',
  "publicationStatus: 'published-with-evidence-status-label'",
  'publish-unconfirmed-no-attributable-source',
  'publish-source-incomplete-not-human-reviewed',
  'publish-model-output-not-confirmed',
  'withheldFigures: 0',
  'Nothing in this queue is withheld from publication'
]) need(scanner.includes(marker), `v4 scanner missing marker: ${marker}`);
need(scanner.includes('%(?!\\w)'), 'percentage detector lost exact percentage handling');
need(!/disposition\s*[:=]\s*['"]withhold-/i.test(scanner),
  'v4 scanner assigns a withholding disposition');
need(!/fetch\s*\(|wrangler\s+(?:deploy|d1)|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(scanner),
  'v4 scanner contains a network, deployment or application-data mutation path');
need(workflow.includes('Publish every sensitive figure with an evidence-status label'),
  'focused workflow does not enforce publish-all labels');
need(workflow.includes('Reject any retired withholding status'),
  'focused workflow does not reject retired withholding output');
need(read('package.json').includes('figure-source-rules-pressure-test.js'),
  'package build no longer runs the source-rule pressure test');
need(read('.github/workflows/live-intel-update.yml').includes('update-site-freshness-report.js'),
  'scheduled intelligence workflow no longer runs the freshness scanner');

const scannerRun = spawnSync(process.execPath, [at('scripts/update-site-freshness-report.js')], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024
});
need(scannerRun.status === 0,
  `repository-wide scanner exited ${scannerRun.status}: ${scannerRun.stderr || scannerRun.stdout}`);

const generatedFiles = [
  at('data/site-freshness-report.json'),
  at('downloads/site-freshness-report.md'),
  at('site-freshness-report.html')
];
for (const file of generatedFiles) need(fs.existsSync(file),
  `missing generated publication proof: ${path.relative(root, file)}`);
if (failures.length) finish();

const report = JSON.parse(fs.readFileSync(generatedFiles[0], 'utf8'));
const review = report.sensitiveFigureReview || {};
const items = Array.isArray(review.items) ? review.items : [];
need(report.reportVersion === 'site-freshness-v4',
  `unexpected report version: ${report.reportVersion}`);
need(report.publicationRule === 'publish-all-with-evidence-status-label',
  `unexpected report publication rule: ${report.publicationRule}`);
need(review.withholdingAllowed === false, 'generated review permits withholding');
need(review.withheldFigures === 0,
  `generated review withholds ${review.withheldFigures} item(s)`);
need(review.withheldFromAutomatedPromotion === 0,
  'legacy withholding count is not zero');
need(review.truncatedItems === 0, `generated review truncated ${review.truncatedItems} item(s)`);
need(review.totalUniqueSensitiveFigures === items.length,
  'machine-readable output omits sensitive items');
need(review.publishedSensitiveFigures === items.length,
  'not every sensitive item is published');
need(review.publishedWithLabel === items.length,
  'not every sensitive item has an evidence-status label');

const ids = new Set();
for (const item of items) {
  for (const field of [
    'id', 'file', 'figureType', 'value', 'context', 'category', 'categoryLabel',
    'sensitivity', 'classification', 'sourceRuleIds', 'sourceFiles',
    'sourceName', 'publisher', 'sourceDate', 'scope', 'evidenceClassification',
    'updatePolicy', 'publicReviewStatus', 'humanReviewStatus', 'confirmationStatus',
    'evidenceStatus', 'publicLabel', 'publicationAllowed', 'publicationStatus',
    'labelRequired', 'missingRequiredFields', 'disposition',
    'automatedPromotionAllowed', 'confirmedPublicationAllowed', 'reviewAction'
  ]) need(Object.prototype.hasOwnProperty.call(item, field),
    `item ${item.id || 'unknown'} missing ${field}`);

  need(!ids.has(item.id), `duplicate item id ${item.id}`);
  ids.add(item.id);
  need(!String(item.file || '').startsWith('_site/'),
    `source/output duplicate retained for ${item.file}`);
  need(item.publicationAllowed === true,
    `item ${item.id} is not publishable`);
  need(item.publicationStatus === 'published-with-evidence-status-label',
    `item ${item.id} has publication status ${item.publicationStatus}`);
  need(item.labelRequired === true && typeof item.publicLabel === 'string'
    && item.publicLabel.includes('NOT HUMAN REVIEWED'),
  `item ${item.id} lacks its not-human-reviewed public label`);
  need(item.humanReviewStatus === 'not-human-reviewed',
    `item ${item.id} has human review status ${item.humanReviewStatus}`);
  need(/^publish-/.test(item.disposition) && !/^withhold-/i.test(item.disposition),
    `item ${item.id} has non-publication disposition ${item.disposition}`);
  need(item.confirmedPublicationAllowed === false,
    `unreviewed item ${item.id} is allowed as confirmed evidence`);
  need(Array.isArray(item.sourceRuleIds), `item ${item.id} sourceRuleIds invalid`);
  need(Array.isArray(item.sourceFiles), `item ${item.id} sourceFiles invalid`);
  need(Array.isArray(item.missingRequiredFields),
    `item ${item.id} missingRequiredFields invalid`);

  const expectedMissing = (review.requiredFields || []).filter(field => !item[field]);
  need(JSON.stringify(expectedMissing) === JSON.stringify(item.missingRequiredFields),
    `item ${item.id} missing-field accounting drifted`);

  if (item.automatedPromotionAllowed) {
    need(item.publicReviewStatus === 'eligible-controlled-refresh',
      `item ${item.id} is automated without eligible source status`);
    need(item.missingRequiredFields.length === 0,
      `item ${item.id} is automated with missing metadata`);
  }

  if (item.category === 'risk-clock-probability') {
    need(item.publicLabel.includes('MODEL OUTPUT')
      && item.publicLabel.includes('NOT A CONFIRMED EVENT')
      && item.confirmationStatus === 'not-confirmed',
    `risk item ${item.id} lacks the model-output boundary`);
  } else if (!item.sourceRuleIds.length) {
    need(item.publicLabel.includes('NO ATTRIBUTABLE SOURCE RULE')
      && item.confirmationStatus === 'unconfirmed',
    `unsourced item ${item.id} lacks the unconfirmed-source boundary`);
  }
}

const rendered = `${fs.readFileSync(generatedFiles[1], 'utf8')}\n${fs.readFileSync(generatedFiles[2], 'utf8')}`;
need(rendered.includes('Withheld figures: 0'),
  'rendered publication report does not prove zero withholding');
need(!/withhold-prominent-publication|withhold-from-automated-promotion/i.test(rendered),
  'rendered publication report contains a retired withholding status');

const firstHashes = Object.fromEntries(generatedFiles.map(file => [file, digest(file)]));
const repeat = spawnSync(process.execPath, [at('scripts/update-site-freshness-report.js')], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024
});
need(repeat.status === 0,
  `repeat scanner exited ${repeat.status}: ${repeat.stderr || repeat.stdout}`);
for (const file of generatedFiles) need(digest(file) === firstHashes[file],
  `generated publication proof is not repeat-safe: ${path.relative(root, file)}`);

finish();

function finish() {
  if (failures.length) {
    console.error('\nFIGURE SOURCE RULES PRESSURE TEST FAILED\n');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`\n${failures.length} issue(s) found.\n`);
    process.exit(1);
  }
  console.log('FIGURE SOURCE RULES PRESSURE TEST PASSED');
  console.log(`All ${items.length} sensitive items are published with explicit evidence and not-human-reviewed labels; zero are withheld.`);
}
