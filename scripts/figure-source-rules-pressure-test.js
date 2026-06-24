const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }

requireFile('data/figure-source-rules.json');
requireFile('scripts/update-site-freshness-report.js');
requireFile('package.json');
requireFile('.github/workflows/live-intel-update.yml');

if (exists('data/figure-source-rules.json')) {
  const rulesData = JSON.parse(read('data/figure-source-rules.json'));
  const rules = rulesData.rules || [];
  if (!rulesData.policy) fail('figure-source-rules.json missing policy');
  if (rulesData.defaultAction !== 'flag-for-review') fail('figure-source-rules.json defaultAction should be flag-for-review');
  if (rules.length < 8) fail(`expected at least 8 figure source rules, found ${rules.length}`);
  const policies = new Set(rules.map(r => r.updatePolicy));
  for (const required of ['auto-update-allowed', 'manual-review-only', 'do-not-auto-update', 'manual-review-before-public-claim']) {
    if (!policies.has(required)) fail(`missing update policy: ${required}`);
  }
  for (const rule of rules) {
    for (const field of ['id', 'label', 'filePatterns', 'figurePatterns', 'sourceType', 'sourceFiles', 'updatePolicy', 'reviewNote']) {
      if (!(field in rule)) fail(`rule ${rule.id || 'unknown'} missing ${field}`);
    }
    if (!Array.isArray(rule.filePatterns) || !rule.filePatterns.length) fail(`rule ${rule.id || 'unknown'} needs filePatterns`);
    if (!Array.isArray(rule.figurePatterns)) fail(`rule ${rule.id || 'unknown'} figurePatterns must be an array`);
  }
}

for (const marker of ['figure-source-rules.json', 'classifyFigure', 'autoUpdateEligibleFigures', 'manualReviewFigures', 'missingRuleFigures', 'Source Rules']) {
  requireIncludes('scripts/update-site-freshness-report.js', marker, `freshness scanner marker ${marker}`);
}
requireIncludes('package.json', 'figure-source-rules-pressure-test.js', 'npm figure rules pressure test wiring');
requireIncludes('.github/workflows/live-intel-update.yml', 'update-site-freshness-report.js', 'weekly freshness scanner wiring');

if (problems.length) {
  console.error('\nFIGURE SOURCE RULES PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('FIGURE SOURCE RULES PRESSURE TEST PASSED');
console.log('Checked figure source-rule registry, update policies, rule completeness, freshness scanner classification, npm wiring, and weekly workflow wiring.');
