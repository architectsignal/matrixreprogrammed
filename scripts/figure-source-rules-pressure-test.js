'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const problems = [];

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function need(condition, message) {
  if (!condition) problems.push(message);
}
function requireFile(relative) {
  need(exists(relative), `missing required file: ${relative}`);
}
function requireIncludes(relative, marker, label = marker) {
  if (!exists(relative)) return;
  need(read(relative).includes(marker), `${relative}: missing ${label}`);
}
function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

for (const file of [
  'data/figure-source-rules.json',
  'data/sensitive-figure-policy.json',
  'data/sensitive-publication-policy.json',
  'scripts/update-site-freshness-report.js',
  'scripts/update-site-freshness-report-v4.js',
  'scripts/sensitive-figure-classification-regression-test.js',
  'package.json',
  '.github/workflows/live-intel-update.yml'
]) requireFile(file);

let rulesData = null;
if (exists('data/figure-source-rules.json')) {
  rulesData = JSON.parse(read('data/figure-source-rules.json'));
  const rules = Array.isArray(rulesData.rules) ? rulesData.rules : [];
  need(typeof rulesData.policy === 'string' && rulesData.policy.length > 20,
    'figure-source-rules.json missing policy');
  need(rulesData.defaultAction === 'flag-for-review',
    'figure-source-rules.json defaultAction should remain flag-for-review');
  need(rules.length >= 8, `expected at least 8 source rules, found ${rules.length}`);
  const policies = new Set(rules.map(rule => rule.updatePolicy));
  for (const required of [
    'auto-update-allowed',
    'manual-review-only',
    'do-not-auto-update',
    'manual-review-before-public-claim'
  ]) need(policies.has(required), `missing source update policy: ${required}`);
  for (const rule of rules) {
    for (const field of [
      'id', 'label', 'filePatterns', 'figurePatterns', 'sourceType', 'sourceFiles',
      'sourceName', 'publisher', 'sourceDatePolicy', 'scope',
      'evidenceClassification', 'updatePolicy', 'reviewNote'
    ]) need(field in rule, `source rule ${rule.id || 'unknown'} missing ${field}`);
    need(Array.isArray(rule.filePatterns) && rule.filePatterns.length > 0,
      `source rule ${rule.id || 'unknown'} needs filePatterns`);
    need(Array.isArray(rule.figurePatterns),
      `source rule ${rule.id || 'unknown'} figurePatterns must be an array`);
    need(Array.isArray(rule.sourceFiles),
      `source rule ${rule.id || 'unknown'} sourceFiles must be an array`);
  }
}

let sensitivePolicy = null;
if (exists('data/sensitive-figure-policy.json')) {
  sensitivePolicy = JSON.parse(read('data/sensitive-figure-policy.json'));
  need(Array.isArray(sensitivePolicy.requiredFields),
    'sensitive figure policy requiredFields must be an array');
  for (const field of [
    'sourceName', 'publisher', 'sourceDate', 'scope', 'evidenceClassification',
    'updatePolicy', 'publicReviewStatus'
  ]) need(sensitivePolicy.requiredFields?.includes(field),
    `sensitive figure policy missing required field ${field}`);
  const categoryIds = new Set((sensitivePolicy.categories || []).map(category => category.id));
  for (const required of [
    'epstein-victim-sensitive', 'criminal-allegation-court',
    'health-vaccine-medical', 'death-casualty-human-cost',
    'migration-crime-demographic', 'financial-market-control',
    'risk-clock-probability', 'public-policy-statistic'
  ]) need(categoryIds.has(required), `sensitive figure policy missing category ${required}`);
}

let publicationPolicy = null;
if (exists('data/sensitive-publication-policy.json')) {
  publicationPolicy = JSON.parse(read('data/sensitive-publication-policy.json'));
  need(publicationPolicy.publicationRule === 'publish-all-with-evidence-status-label',
    'publication policy does not publish all labelled items');
  need(publicationPolicy.withholdingAllowed === false,
    'publication policy still permits withholding');
  need(typeof publicationPolicy.policy === 'string' && publicationPolicy.policy.length > 120,
    'publication policy lacks a meaningful evidence boundary');
  for (const field of [
    'publicationAllowed', 'publicationStatus', 'publicLabel', 'humanReviewStatus',
    'confirmationStatus', 'evidenceStatus', 'labelRequired'
  ]) need(publicationPolicy.requiredPublicationFields?.includes(field),
    `publication policy missing required output field ${field}`);
  for (const label of [
    'noAttributableSource', 'sourceIncomplete', 'sourcedNotReviewed',
    'sourceCompleteNotReviewed', 'modelOutput', 'staticContext'
  ]) need(typeof publicationPolicy.labels?.[label] === 'string'
      && publicationPolicy.labels[label].includes('NOT HUMAN REVIEWED'),
    `publication policy missing not-human-reviewed label ${label}`);
}

requireIncludes(
  'scripts/update-site-freshness-report.js',
  "require('./update-site-freshness-report-v4.js');",
  'v4 compatibility entrypoint'
);
for (const marker of [
  'sensitive-publication-policy.json',
  'site-freshness-v4',
  'buildReviewItem',
  'publicationAllowed: true',
  "publicationStatus: 'published-with-evidence-status-label'",
  'publicLabel',
  'humanReviewStatus',
  'confirmationStatus',
  'evidenceStatus',
  'withheldFigures: 0',
  'publish-unconfirmed-no-attributable-source',
  'publish-source-incomplete-not-human-reviewed',
  'publish-model-output-not-confirmed',
  'Nothing in this queue is withheld from publication'
]) requireIncludes('scripts/update-site-freshness-report-v4.js', marker,
  `v4 scanner marker ${marker}`);
requireIncludes('scripts/update-site-freshness-report-v4.js', '%(?!\\w)',
  'percentage detector without a broken trailing word boundary');
need(!/withhold-prominent-publication|withhold-from-automated-promotion/.test(
  exists('scripts/update-site-freshness-report-v4.js')
    ? read('scripts/update-site-freshness-report-v4.js')
    : ''
), 'v4 scanner retains a withholding disposition');

if (exists('scripts/update-site-freshness-report-v4.js')) {
  const scanner = read('scripts/update-site-freshness-report-v4.js');
  need(!/fetch\s*\(|wrangler\s+(?:deploy|d1)|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(scanner),
    'freshness scanner contains a network, deploy or application-data mutation path');
}

function inspectReport(report, label) {
  need(report.reportVersion === 'site-freshness-v4', `${label}: unexpected report version`);
  need(report.publicationRule === 'publish-all-with-evidence-status-label',
    `${label}: publication rule drifted`);
  const review = report.sensitiveFigureReview;
  need(review && typeof review === 'object', `${label}: missing sensitiveFigureReview`);
  if (!review) return;
  need(review.withholdingAllowed === false, `${label}: review permits withholding`);
  need(review.withheldFigures === 0, `${label}: ${review.withheldFigures} item(s) withheld`);
  need(review.withheldFromAutomatedPromotion === 0,
    `${label}: legacy withholding count is not zero`);
  need(review.truncatedItems === 0, `${label}: review queue truncated items`);
  need(Array.isArray(review.items), `${label}: review items must be an array`);
  need(review.totalUniqueSensitiveFigures === review.items.length,
    `${label}: machine-readable queue omits sensitive items`);
  need(review.publishedSensitiveFigures === review.items.length,
    `${label}: published count does not cover every item`);
  need(review.publishedWithLabel === review.items.length,
    `${label}: not every item has a publication label`);

  const ids = new Set();
  for (const item of review.items) {
    for (const field of [
      'id', 'file', 'figureType', 'value', 'context', 'category', 'categoryLabel',
      'sensitivity', 'prominent', 'classification', 'sourceRuleIds', 'sourceFiles',
      'sourceName', 'publisher', 'sourceDate', 'scope', 'evidenceClassification',
      'updatePolicy', 'publicReviewStatus', 'humanReviewStatus', 'confirmationStatus',
      'evidenceStatus', 'publicLabel', 'publicationAllowed', 'publicationStatus',
      'labelRequired', 'missingRequiredFields', 'disposition',
      'automatedPromotionAllowed', 'confirmedPublicationAllowed', 'reviewAction'
    ]) need(field in item, `${label}: item ${item.id || 'unknown'} missing ${field}`);

    need(!ids.has(item.id), `${label}: duplicate item id ${item.id}`);
    ids.add(item.id);
    need(!String(item.file || '').startsWith('_site/'),
      `${label}: source/output duplicate prefix retained for ${item.file}`);
    need(item.publicationAllowed === true,
      `${label}: item ${item.id} is not publishable`);
    need(item.publicationStatus === 'published-with-evidence-status-label',
      `${label}: item ${item.id} has publication status ${item.publicationStatus}`);
    need(item.labelRequired === true && typeof item.publicLabel === 'string'
      && item.publicLabel.length > 10,
    `${label}: item ${item.id} lacks a public label`);
    need(item.humanReviewStatus === 'not-human-reviewed',
      `${label}: item ${item.id} has unexpected human review status`);
    need(/^publish-/.test(item.disposition),
      `${label}: item ${item.id} does not use a publish disposition`);
    need(!/^withhold-/i.test(item.disposition),
      `${label}: item ${item.id} is withheld`);
    need(item.confirmedPublicationAllowed === false,
      `${label}: unreviewed item ${item.id} is allowed as confirmed evidence`);
    need(Array.isArray(item.sourceRuleIds), `${label}: item ${item.id} sourceRuleIds invalid`);
    need(Array.isArray(item.sourceFiles), `${label}: item ${item.id} sourceFiles invalid`);
    need(Array.isArray(item.missingRequiredFields),
      `${label}: item ${item.id} missingRequiredFields invalid`);

    const expectedMissing = (review.requiredFields || []).filter(field => !item[field]);
    need(JSON.stringify(expectedMissing) === JSON.stringify(item.missingRequiredFields),
      `${label}: item ${item.id} missing-field accounting drifted`);

    if (item.automatedPromotionAllowed) {
      need(item.publicReviewStatus === 'eligible-controlled-refresh',
        `${label}: item ${item.id} is automated without eligible source status`);
      need(item.missingRequiredFields.length === 0,
        `${label}: item ${item.id} is automated with missing metadata`);
    }
    if (item.category === 'risk-clock-probability') {
      need(item.publicLabel.includes('MODEL OUTPUT')
        && item.publicLabel.includes('NOT A CONFIRMED EVENT'),
      `${label}: risk item ${item.id} lacks model-output warning`);
    }
    if (!item.sourceRuleIds.length) {
      need(item.publicLabel.includes('NO ATTRIBUTABLE SOURCE RULE')
        && item.confirmationStatus === 'unconfirmed',
      `${label}: unsourced item ${item.id} lacks unconfirmed source warning`);
    }
  }
}

if (exists('data/site-freshness-report.json')) {
  try {
    inspectReport(JSON.parse(read('data/site-freshness-report.json')), 'repository report');
  } catch (error) {
    problems.push(`repository report could not be inspected: ${error.message}`);
  }
}
if (exists('downloads/site-freshness-report.md')) {
  requireIncludes('downloads/site-freshness-report.md',
    '## Sensitive Figure Publication Labels', 'Markdown publication labels');
  requireIncludes('downloads/site-freshness-report.md',
    'Withheld figures: 0', 'Markdown zero-withholding boundary');
}
if (exists('site-freshness-report.html')) {
  requireIncludes('site-freshness-report.html',
    '<h2>Sensitive Figure Publication Labels</h2>', 'HTML publication labels');
  requireIncludes('site-freshness-report.html',
    '&gt; Withheld figures: 0', 'HTML zero-withholding boundary');
}

function runFixture() {
  if (!rulesData || !sensitivePolicy || !publicationPolicy
    || !exists('scripts/update-site-freshness-report-v4.js')) return;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-publish-labelled-'));
  try {
    fs.mkdirSync(path.join(temporaryRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(temporaryRoot, 'downloads'), { recursive: true });
    fs.mkdirSync(path.join(temporaryRoot, '_site'), { recursive: true });
    for (const [name, data] of [
      ['figure-source-rules.json', rulesData],
      ['sensitive-figure-policy.json', sensitivePolicy],
      ['sensitive-publication-policy.json', publicationPolicy]
    ]) fs.writeFileSync(path.join(temporaryRoot, 'data', name),
      `${JSON.stringify(data, null, 2)}\n`);

    const home = '<!doctype html><html><body><main><h1>Home</h1><p>Current risk clock: 93% based on a model.</p><p>Migration cases: 12,000 migrants in 2026.</p></main></body></html>';
    fs.writeFileSync(path.join(temporaryRoot, 'index.html'), home);
    fs.writeFileSync(path.join(temporaryRoot, '_site', 'index.html'), home);
    fs.writeFileSync(path.join(temporaryRoot, 'dashboard-human-cost.html'),
      '<!doctype html><html><body><main><h1>Human Cost</h1><p>There were 4,200 deaths and £12 million in vaccine payouts.</p></main></body></html>');
    fs.writeFileSync(path.join(temporaryRoot, 'epstein-files.html'),
      '<!doctype html><html><body><main><h1>Epstein</h1><p>The source watch contains 14 files and 7 victim claims.</p></main></body></html>');
    fs.writeFileSync(path.join(temporaryRoot, 'books.html'),
      '<!doctype html><html><body><main><h1>Books</h1><p>72 books and 540 pages are available. Price €3.99.</p></main></body></html>');

    const scannerPath = path.join(root, 'scripts', 'update-site-freshness-report-v4.js');
    const first = spawnSync(process.execPath, [scannerPath], {
      cwd: temporaryRoot,
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024
    });
    need(first.status === 0,
      `labelled publication fixture exited ${first.status}: ${first.stderr || first.stdout}`);
    const reportPath = path.join(temporaryRoot, 'data', 'site-freshness-report.json');
    need(fs.existsSync(reportPath), 'labelled publication fixture did not create report');
    if (!fs.existsSync(reportPath)) return;
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    inspectReport(report, 'fixture report');
    const items = report.sensitiveFigureReview?.items || [];
    need(items.some(item => item.value === '93%'
      && item.disposition === 'publish-model-output-not-confirmed'),
    'fixture did not publish the 93% model output with its label');
    need(items.some(item => item.category === 'migration-crime-demographic'),
      'fixture did not classify the migration figure');
    need(items.some(item => item.category === 'health-vaccine-medical'),
      'fixture did not classify the health figure');
    need(items.some(item => item.category === 'epstein-victim-sensitive'),
      'fixture did not classify the Epstein/victim figure');
    need(items.filter(item => item.file === 'index.html' && item.value === '93%').length === 1,
      'fixture did not deduplicate source and _site copies');
    need(!items.some(item => item.file === 'books.html' && item.value === '€3.99'),
      'fixture incorrectly queued a commercial price');
    need(items.every(item => item.publicationAllowed === true),
      'fixture withheld at least one sensitive item');

    const trackedFiles = [
      reportPath,
      path.join(temporaryRoot, 'downloads', 'site-freshness-report.md'),
      path.join(temporaryRoot, 'site-freshness-report.html')
    ];
    const firstHashes = Object.fromEntries(trackedFiles.map(file => [file, hash(file)]));
    const second = spawnSync(process.execPath, [scannerPath], {
      cwd: temporaryRoot,
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024
    });
    need(second.status === 0, `labelled publication repeat exited ${second.status}`);
    for (const file of trackedFiles) need(hash(file) === firstHashes[file],
      `labelled publication fixture is not repeat-safe for ${path.basename(file)}`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
runFixture();

if (problems.length) {
  console.error('\nFIGURE SOURCE RULES PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('FIGURE SOURCE RULES PRESSURE TEST PASSED');
console.log('All sensitive items remain published with evidence-status and not-human-reviewed labels; no withholding disposition is permitted.');
