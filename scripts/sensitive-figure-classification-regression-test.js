'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const scanner = path.join(repositoryRoot, 'scripts', 'update-site-freshness-report-v4.js');
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
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Sensitive figure scanner exited ${result.status}.`);
}

try {
  copy('data/figure-source-rules.json');
  copy('data/sensitive-figure-policy.json');
  copy('data/sensitive-publication-policy.json');
  fs.mkdirSync(path.join(temporaryRoot, 'downloads'), { recursive: true });

  write(
    'evidence-reader.html',
    '<!doctype html><html><body><main><h1>Evidence Reader</h1>'
    + '<p>Previous Page of — Next Zoom 80% 100% 125% 150% 200% Find Copy Page Link Open PDF</p>'
    + '</main></body></html>'
  );
  write(
    'evidence-graph.html',
    '<!doctype html><html><body><main><h1>Evidence Graph</h1>'
    + '<p>BlackRock asset manager route. Latest public watch: about $13.46T reported for Q3 2025; '
    + 'verify against the latest filing before quoting.</p>'
    + '<p>Investment Management asset manager route. Latest public watch: about $5.4T AUM reported '
    + 'for Q3 2025; custody and administration must remain separate.</p>'
    + '</main></body></html>'
  );
  write(
    'timers.html',
    '<!doctype html><html><body><main><h1>Timers</h1>'
    + '<p>The current model score is 93% risk. It is an analytical estimate.</p>'
    + '</main></body></html>'
  );
  write(
    'epstein-files.html',
    '<!doctype html><html><body><main><h1>Epstein Files</h1>'
    + '<p>An unverified upload alleges 7 claims involving alleged victims without an attributable source record.</p>'
    + '</main></body></html>'
  );

  runScanner();

  const reportPath = path.join(temporaryRoot, 'data', 'site-freshness-report.json');
  const markdownPath = path.join(temporaryRoot, 'downloads', 'site-freshness-report.md');
  const htmlPath = path.join(temporaryRoot, 'site-freshness-report.html');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const review = report.sensitiveFigureReview;
  const items = review.items || [];

  assert(report.reportVersion === 'site-freshness-v4', `Unexpected version ${report.reportVersion}.`);
  assert(report.publicationRule === 'publish-all-with-evidence-status-label',
    `Unexpected publication rule ${report.publicationRule}.`);
  assert(review.truncatedItems === 0, `Review output truncated ${review.truncatedItems} item(s).`);
  assert(review.totalUniqueSensitiveFigures === items.length,
    'Machine-readable output does not contain every unique sensitive figure.');
  assert(review.publishedSensitiveFigures === items.length,
    'Not every sensitive figure is published.');
  assert(review.withheldFigures === 0, `${review.withheldFigures} sensitive figure(s) remain withheld.`);
  assert(items.every(item => item.publicationAllowed === true
    && item.publicationStatus === 'published-with-evidence-status-label'
    && item.labelRequired === true
    && item.humanReviewStatus === 'not-human-reviewed'),
  'At least one sensitive item lacks the required publication label boundary.');
  assert(!items.some(item => /^withhold-/i.test(item.disposition)),
    'A withholding disposition remains.');
  assert(!items.some(item => item.file === 'evidence-reader.html'),
    'PDF zoom controls entered the sensitive figure queue.');

  const financial = items.filter(item => item.file === 'evidence-graph.html');
  assert(financial.length === 2,
    `Expected two evidence-graph financial figures; found ${financial.length}.`);
  for (const item of financial) {
    assert(item.category === 'financial-market-control',
      `${item.value} was classified as ${item.category}.`);
    assert(item.sourceRuleIds.includes('financial-filing-figures'),
      `${item.value} lacks the financial filing source rule.`);
    assert(item.publicReviewStatus === 'not-human-reviewed-source-incomplete',
      `${item.value} has review status ${item.publicReviewStatus}.`);
    assert(item.disposition === 'publish-source-incomplete-not-human-reviewed',
      `${item.value} has disposition ${item.disposition}.`);
    assert(item.publicLabel.includes('SOURCE METADATA INCOMPLETE')
      && item.publicLabel.includes('NOT HUMAN REVIEWED'),
    `${item.value} lacks the source-incomplete label.`);
    assert(item.missingRequiredFields.includes('sourceDate'),
      `${item.value} does not disclose its missing source date.`);
    assert(item.publicationAllowed === true, `${item.value} is not published.`);
    assert(item.automatedPromotionAllowed === false,
      `${item.value} is incorrectly eligible for automated promotion.`);
    assert(item.confirmedPublicationAllowed === false,
      `${item.value} is incorrectly allowed as confirmed evidence.`);
  }

  const risk = items.find(item => item.file === 'timers.html' && item.value === '93%');
  assert(risk, 'Risk-clock figure was not found.');
  assert(risk.disposition === 'publish-model-output-not-confirmed',
    `Risk-clock disposition is ${risk?.disposition}.`);
  assert(risk.publicLabel.includes('MODEL OUTPUT')
    && risk.publicLabel.includes('NOT A CONFIRMED EVENT')
    && risk.publicLabel.includes('NOT HUMAN REVIEWED'),
  'Risk-clock label does not state its model and review boundaries.');
  assert(risk.publicationAllowed === true, 'Risk-clock figure is withheld.');

  const unsourced = items.find(item => item.file === 'epstein-files.html'
    && item.category === 'epstein-victim-sensitive');
  assert(unsourced, 'Unsourced Epstein/victim figure was not found.');
  assert(unsourced.disposition === 'publish-unconfirmed-no-attributable-source',
    `Unsourced figure disposition is ${unsourced?.disposition}.`);
  assert(unsourced.publicLabel.includes('UNCONFIRMED')
    && unsourced.publicLabel.includes('NO ATTRIBUTABLE SOURCE RULE')
    && unsourced.publicLabel.includes('NOT HUMAN REVIEWED'),
  'Unsourced sensitive figure lacks the required public warning.');
  assert(unsourced.publicationAllowed === true, 'Unsourced sensitive figure is withheld.');
  assert(unsourced.automatedPromotionAllowed === false,
    'Unsourced sensitive figure is automatically promoted.');

  const rendered = `${fs.readFileSync(markdownPath, 'utf8')}\n${fs.readFileSync(htmlPath, 'utf8')}`;
  assert(rendered.includes('Withheld figures: 0'), 'Rendered report does not prove zero withholding.');
  assert(!/withhold-prominent-publication|withhold-from-automated-promotion/i.test(rendered),
    'Rendered report contains a retired withholding disposition.');

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
  console.log('Controls stay excluded; financial, model and unsourced figures remain public with explicit not-human-reviewed evidence labels.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
