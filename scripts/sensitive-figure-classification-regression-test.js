'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const scanner = path.join(repositoryRoot, 'scripts', 'update-site-freshness-report.js');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-sensitive-classification-'));

function copy(relative) {
  const source = path.join(repositoryRoot, relative);
  const destination = path.join(temporaryRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
function write(relative, content) {
  const file = path.join(temporaryRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function runScanner() {
  const result = spawnSync(process.execPath, [scanner], {
    cwd: temporaryRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Sensitive figure scanner exited ${result.status}.`);
}

try {
  copy('data/figure-source-rules.json');
  copy('data/sensitive-figure-policy.json');
  fs.mkdirSync(path.join(temporaryRoot, 'downloads'), { recursive: true });

  write('evidence-reader.html', '<!doctype html><html><body><main><h1>Evidence Reader</h1><p>Previous Page of — Next Zoom 80% 100% 125% 150% 200% Find Copy Page Link Open PDF</p></main></body></html>');
  write('evidence-graph.html', '<!doctype html><html><body><main><h1>Evidence Graph</h1><p>BlackRock asset manager route. Latest public watch: about $13.46T reported for Q3 2025; verify against the latest filing before quoting.</p><p>Investment Management asset manager route. Latest public watch: about $5.4T AUM reported for Q3 2025; custody and administration must remain separate.</p></main></body></html>');

  runScanner();

  const reportPath = path.join(temporaryRoot, 'data', 'site-freshness-report.json');
  const markdownPath = path.join(temporaryRoot, 'downloads', 'site-freshness-report.md');
  const htmlPath = path.join(temporaryRoot, 'site-freshness-report.html');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const review = report.sensitiveFigureReview;
  const items = review.items || [];

  assert(review.truncatedItems === 0, `Review queue truncated ${review.truncatedItems} item(s).`);
  assert(review.totalUniqueSensitiveFigures === items.length, 'Machine queue does not contain every unique sensitive figure.');
  assert(!items.some(item => item.file === 'evidence-reader.html'), 'PDF zoom controls entered the sensitive figure queue.');

  const financial = items.filter(item => item.file === 'evidence-graph.html');
  assert(financial.length === 2, `Expected two evidence-graph financial figures; found ${financial.length}.`);
  for (const item of financial) {
    assert(item.category === 'financial-market-control', `${item.value} was classified as ${item.category}.`);
    assert(item.sourceRuleIds.includes('financial-filing-figures'), `${item.value} lacks the financial filing source rule.`);
    assert(item.publicReviewStatus === 'verification-pending', `${item.value} has review status ${item.publicReviewStatus}.`);
    assert(item.disposition === 'withhold-from-automated-promotion', `${item.value} has disposition ${item.disposition}.`);
    assert(item.missingRequiredFields.includes('sourceDate'), `${item.value} does not disclose its missing source date.`);
    assert(item.automatedPromotionAllowed === false, `${item.value} is eligible for automated promotion.`);
  }

  const firstHashes = new Map([
    [reportPath, hash(reportPath)],
    [markdownPath, hash(markdownPath)],
    [htmlPath, hash(htmlPath)]
  ]);
  runScanner();
  for (const [file, expected] of firstHashes) {
    assert(hash(file) === expected, `${path.basename(file)} changed across repeated scanning.`);
  }

  console.log('SENSITIVE FIGURE CLASSIFICATION REGRESSION PASSED');
  console.log('PDF zoom controls remain excluded; financial watch figures require dated filings and stay withheld from automated promotion.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
