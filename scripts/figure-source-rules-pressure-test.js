const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(message) { problems.push(message); }
function need(condition, message) { if (!condition) fail(message); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) {
  if (!exists(file)) return;
  if (!read(file).includes(text)) fail(`${file}: missing ${label}`);
}
function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

requireFile('data/figure-source-rules.json');
requireFile('data/sensitive-figure-policy.json');
requireFile('scripts/update-site-freshness-report.js');
requireFile('package.json');
requireFile('.github/workflows/live-intel-update.yml');

let rulesData = null;
if (exists('data/figure-source-rules.json')) {
  rulesData = JSON.parse(read('data/figure-source-rules.json'));
  const rules = rulesData.rules || [];
  if (!rulesData.policy) fail('figure-source-rules.json missing policy');
  if (rulesData.defaultAction !== 'flag-for-review') {
    fail('figure-source-rules.json defaultAction should be flag-for-review');
  }
  if (rules.length < 8) fail(`expected at least 8 figure source rules, found ${rules.length}`);
  const policies = new Set(rules.map(rule => rule.updatePolicy));
  for (const required of [
    'auto-update-allowed',
    'manual-review-only',
    'do-not-auto-update',
    'manual-review-before-public-claim'
  ]) {
    if (!policies.has(required)) fail(`missing update policy: ${required}`);
  }
  for (const rule of rules) {
    for (const field of [
      'id', 'label', 'filePatterns', 'figurePatterns', 'sourceType', 'sourceFiles',
      'sourceName', 'publisher', 'sourceDatePolicy', 'scope',
      'evidenceClassification', 'updatePolicy', 'reviewNote'
    ]) {
      if (!(field in rule)) fail(`rule ${rule.id || 'unknown'} missing ${field}`);
    }
    if (!Array.isArray(rule.filePatterns) || !rule.filePatterns.length) {
      fail(`rule ${rule.id || 'unknown'} needs filePatterns`);
    }
    if (!Array.isArray(rule.figurePatterns)) {
      fail(`rule ${rule.id || 'unknown'} figurePatterns must be an array`);
    }
    if (!Array.isArray(rule.sourceFiles)) {
      fail(`rule ${rule.id || 'unknown'} sourceFiles must be an array`);
    }
    for (const field of ['sourceName', 'publisher', 'sourceDatePolicy', 'scope', 'evidenceClassification']) {
      if (typeof rule[field] !== 'string' || rule[field].trim().length < 3) {
        fail(`rule ${rule.id || 'unknown'} has invalid ${field}`);
      }
    }
  }
}

let sensitivePolicy = null;
if (exists('data/sensitive-figure-policy.json')) {
  sensitivePolicy = JSON.parse(read('data/sensitive-figure-policy.json'));
  need(typeof sensitivePolicy.policy === 'string' && sensitivePolicy.policy.length > 100,
    'sensitive figure policy lacks a meaningful boundary');
  need(Array.isArray(sensitivePolicy.requiredFields),
    'sensitive figure policy requiredFields must be an array');
  for (const field of [
    'sourceName', 'publisher', 'sourceDate', 'scope', 'evidenceClassification',
    'updatePolicy', 'publicReviewStatus'
  ]) {
    need(sensitivePolicy.requiredFields?.includes(field),
      `sensitive figure policy missing required field ${field}`);
  }
  need(Array.isArray(sensitivePolicy.prominentFilePatterns)
    && sensitivePolicy.prominentFilePatterns.length >= 8,
  'sensitive figure policy needs prominent route patterns');
  need(Array.isArray(sensitivePolicy.categories) && sensitivePolicy.categories.length >= 8,
    'sensitive figure policy needs at least eight categories');
  const categoryIds = new Set((sensitivePolicy.categories || []).map(category => category.id));
  for (const required of [
    'epstein-victim-sensitive', 'criminal-allegation-court',
    'health-vaccine-medical', 'death-casualty-human-cost',
    'migration-crime-demographic', 'financial-market-control',
    'risk-clock-probability', 'public-policy-statistic'
  ]) {
    need(categoryIds.has(required), `sensitive figure policy missing category ${required}`);
  }
  for (const category of sensitivePolicy.categories || []) {
    for (const field of [
      'id', 'label', 'sensitivity', 'priority', 'queue', 'filePatterns',
      'figureTypes', 'contextTerms', 'scope', 'defaultEvidenceClassification'
    ]) {
      if (!(field in category)) fail(`sensitive category ${category.id || 'unknown'} missing ${field}`);
    }
    need(Array.isArray(category.filePatterns), `${category.id} filePatterns must be an array`);
    need(Array.isArray(category.figureTypes), `${category.id} figureTypes must be an array`);
    need(Array.isArray(category.contextTerms), `${category.id} contextTerms must be an array`);
  }
}

for (const marker of [
  'figure-source-rules.json',
  'sensitive-figure-policy.json',
  'classifyFigure',
  'buildReviewItem',
  'sensitiveFigureReview',
  'withhold-prominent-publication',
  'automatedPromotionAllowed',
  'autoUpdateEligibleFigures',
  'manualReviewFigures',
  'missingRuleFigures',
  'Sensitive Figure Review Queue'
]) {
  requireIncludes('scripts/update-site-freshness-report.js', marker,
    `freshness scanner marker ${marker}`);
}
requireIncludes('scripts/update-site-freshness-report.js', '%(?!\\w)',
  'percentage detector without the broken trailing word boundary');
requireIncludes('package.json', 'figure-source-rules-pressure-test.js',
  'npm figure rules pressure test wiring');
requireIncludes('.github/workflows/live-intel-update.yml', 'update-site-freshness-report.js',
  'weekly freshness scanner wiring');

if (exists('scripts/update-site-freshness-report.js')) {
  const scanner = read('scripts/update-site-freshness-report.js');
  if (/fetch\s*\(|wrangler\s+(?:deploy|d1)|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(scanner)) {
    fail('freshness scanner contains a network, deploy or application-data mutation path');
  }
}

function inspectReport(report, label) {
  need(report.reportVersion === 'site-freshness-v3', `${label}: unexpected report version`);
  const review = report.sensitiveFigureReview;
  need(review && typeof review === 'object', `${label}: missing sensitiveFigureReview`);
  if (!review) return;
  need(Array.isArray(review.items), `${label}: review items must be an array`);
  need(Number(review.totalUniqueSensitiveFigures) >= review.items.length,
    `${label}: queue total is smaller than visible items`);
  need(Number(review.truncatedItems) >= 0, `${label}: invalid truncated item count`);
  const ids = new Set();
  for (const item of review.items) {
    for (const field of [
      'id', 'file', 'figureType', 'value', 'context', 'category', 'categoryLabel',
      'sensitivity', 'prominent', 'classification', 'sourceRuleIds', 'sourceFiles',
      'sourceName', 'publisher', 'sourceDate', 'scope', 'evidenceClassification',
      'updatePolicy', 'publicReviewStatus', 'missingRequiredFields', 'disposition',
      'automatedPromotionAllowed', 'reviewAction'
    ]) {
      if (!(field in item)) fail(`${label}: queue item ${item.id || 'unknown'} missing ${field}`);
    }
    need(!ids.has(item.id), `${label}: duplicate queue item id ${item.id}`);
    ids.add(item.id);
    need(!String(item.file || '').startsWith('_site/'),
      `${label}: queue retains source/output duplicate prefix for ${item.file}`);
    need(Array.isArray(item.sourceRuleIds), `${label}: ${item.id} sourceRuleIds must be an array`);
    need(Array.isArray(item.sourceFiles), `${label}: ${item.id} sourceFiles must be an array`);
    need(Array.isArray(item.missingRequiredFields),
      `${label}: ${item.id} missingRequiredFields must be an array`);
    const expectedMissing = (review.requiredFields || [])
      .filter(field => !item[field]);
    need(JSON.stringify(expectedMissing) === JSON.stringify(item.missingRequiredFields),
      `${label}: ${item.id} missing-field accounting drifted`);
    if (item.automatedPromotionAllowed) {
      need(item.disposition === 'eligible-controlled-refresh',
        `${label}: ${item.id} is promoted with disposition ${item.disposition}`);
      need(item.publicReviewStatus === 'eligible-controlled-refresh',
        `${label}: ${item.id} is promoted without eligible review status`);
      need(item.missingRequiredFields.length === 0,
        `${label}: ${item.id} is promoted with missing metadata`);
    }
    if (['critical', 'high'].includes(item.sensitivity)
      && item.missingRequiredFields.length > 0) {
      need(item.automatedPromotionAllowed === false,
        `${label}: high-stakes item ${item.id} is automatically promoted`);
      need(/^withhold-/.test(item.disposition),
        `${label}: high-stakes incomplete item ${item.id} is not withheld`);
    }
    if (item.disposition === 'withhold-prominent-publication') {
      need(item.prominent === true,
        `${label}: non-prominent item ${item.id} has prominent-withhold status`);
    }
  }
}

if (exists('data/site-freshness-report.json')) {
  try {
    inspectReport(JSON.parse(read('data/site-freshness-report.json')), 'repository report');
  } catch (error) {
    fail(`repository report could not be inspected: ${error.message}`);
  }
}
if (exists('downloads/site-freshness-report.md')) {
  requireIncludes('downloads/site-freshness-report.md', '## Sensitive Figure Review Queue',
    'Markdown sensitive figure queue');
}
if (exists('site-freshness-report.html')) {
  requireIncludes('site-freshness-report.html', '<h2>Sensitive Figure Review Queue</h2>',
    'HTML sensitive figure queue');
}

function runFixture() {
  if (!rulesData || !sensitivePolicy || !exists('scripts/update-site-freshness-report.js')) return;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-sensitive-figures-'));
  try {
    fs.mkdirSync(path.join(temporaryRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(temporaryRoot, 'downloads'), { recursive: true });
    fs.mkdirSync(path.join(temporaryRoot, '_site'), { recursive: true });
    fs.writeFileSync(path.join(temporaryRoot, 'data', 'figure-source-rules.json'),
      `${JSON.stringify(rulesData, null, 2)}\n`);
    fs.writeFileSync(path.join(temporaryRoot, 'data', 'sensitive-figure-policy.json'),
      `${JSON.stringify(sensitivePolicy, null, 2)}\n`);
    const home = '<!doctype html><html><body><main><h1>Home</h1><p>Current risk clock: 93% based on a model.</p><p>Migration cases: 12,000 migrants in 2026.</p></main></body></html>';
    fs.writeFileSync(path.join(temporaryRoot, 'index.html'), home);
    fs.writeFileSync(path.join(temporaryRoot, '_site', 'index.html'), home);
    fs.writeFileSync(path.join(temporaryRoot, 'dashboard-human-cost.html'),
      '<!doctype html><html><body><main><h1>Human Cost</h1><p>There were 4,200 deaths and £12 million in vaccine payouts.</p></main></body></html>');
    fs.writeFileSync(path.join(temporaryRoot, 'epstein-files.html'),
      '<!doctype html><html><body><main><h1>Epstein</h1><p>The source watch contains 14 files and 7 victim claims.</p></main></body></html>');
    fs.writeFileSync(path.join(temporaryRoot, 'books.html'),
      '<!doctype html><html><body><main><h1>Books</h1><p>72 books and 540 pages are available. Price €3.99.</p></main></body></html>');

    const scannerPath = path.join(root, 'scripts', 'update-site-freshness-report.js');
    const first = spawnSync(process.execPath, [scannerPath], {
      cwd: temporaryRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
    need(first.status === 0,
      `sensitive figure fixture scanner exited ${first.status}: ${first.stderr || first.stdout}`);
    const reportPath = path.join(temporaryRoot, 'data', 'site-freshness-report.json');
    need(fs.existsSync(reportPath), 'sensitive figure fixture did not create its report');
    if (!fs.existsSync(reportPath)) return;
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    inspectReport(report, 'fixture report');
    const items = report.sensitiveFigureReview?.items || [];
    need(items.some(item => item.value === '93%' && item.category === 'risk-clock-probability'),
      'fixture did not detect the 93% risk-clock figure');
    need(items.some(item => item.category === 'migration-crime-demographic'),
      'fixture did not classify the migration figure');
    need(items.some(item => item.category === 'health-vaccine-medical'),
      'fixture did not classify the health figure');
    need(items.some(item => item.category === 'epstein-victim-sensitive'),
      'fixture did not classify the Epstein/victim figure');
    need(items.filter(item => item.file === 'index.html' && item.value === '93%').length === 1,
      'fixture did not deduplicate source and _site copies');
    need(!items.some(item => item.file === 'books.html' && item.value === '€3.99'),
      'fixture incorrectly queued a commercial product price');

    const trackedFiles = [
      reportPath,
      path.join(temporaryRoot, 'downloads', 'site-freshness-report.md'),
      path.join(temporaryRoot, 'site-freshness-report.html')
    ];
    const firstHashes = Object.fromEntries(trackedFiles.map(file => [file, hash(file)]));
    const second = spawnSync(process.execPath, [scannerPath], {
      cwd: temporaryRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
    need(second.status === 0, `sensitive figure fixture repeat exited ${second.status}`);
    for (const file of trackedFiles) {
      need(hash(file) === firstHashes[file],
        `sensitive figure fixture is not repeat-safe for ${path.basename(file)}`);
    }
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
console.log('Checked source-rule metadata, sensitive categories, exact percentage detection, source/output deduplication, publication dispositions, repeat safety, npm wiring and weekly workflow wiring.');
