'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const failures = [];
const warnings = [];

const file = (relative, base = root) => path.join(base, relative);
const exists = (relative, base = root) => fs.existsSync(file(relative, base));
const read = (relative, base = root) => {
  if (!exists(relative, base)) throw new Error(`Missing ${path.relative(root, file(relative, base))}`);
  return fs.readFileSync(file(relative, base), 'utf8');
};
const json = (relative, base = root) => JSON.parse(read(relative, base));
const array = value => Array.isArray(value) ? value : [];
const clean = value => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const fail = message => failures.push(message);
const warn = message => warnings.push(message);

const required = [
  'index.html',
  'accountability-home.css',
  'accountability-home.js',
  'search-query-handoff.js',
  'search.html',
  'search-index.json',
  'data/cinematic-hit-list.json',
  'data/accountability-question-ledger.json',
  'downloads/search-first-accountability-home-report.json',
  'downloads/accountability-question-ledger-refinement.json',
  'scripts/finalize-search-first-accountability-home.js',
  'scripts/refine-accountability-question-ledger.js'
];
for (const relative of required) if (!exists(relative)) fail(`Missing required output ${relative}`);

function checkSyntax(relative) {
  if (!exists(relative)) return;
  const result = spawnSync(process.execPath, ['--check', file(relative)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`${relative} syntax failed: ${result.stderr || result.stdout}`);
}
for (const relative of ['accountability-home.js','search-query-handoff.js','scripts/finalize-search-first-accountability-home.js','scripts/refine-accountability-question-ledger.js','scripts/search-first-accountability-home-pressure-test.js']) checkSyntax(relative);

function checkHomepage(base = root) {
  const label = path.relative(root, base) || '.';
  if (!exists('index.html', base)) return fail(`${label} missing index.html`);
  const html = read('index.html', base);
  for (const marker of [
    'POWER SHOULD HAVE',
    'id="accountability-search"',
    'id="accountability-search-results"',
    'THE ACCOUNTABILITY HIT LIST',
    'THE OPEN QUESTION LEDGER',
    'data/accountability-question-ledger.json',
    'Search → understand → follow → return',
    'accountability-home.css',
    'accountability-home.js',
    'My Watchlist',
    'Submit evidence or a correction'
  ]) if (!html.includes(marker)) fail(`${label}/index.html missing marker: ${marker}`);
  for (const stale of ['MAP THE STRUCTURE','READ THE SIGNALS','Live Intel · Books · Source Trails','homepage-command-surface']) if (html.includes(stale)) fail(`${label}/index.html still exposes old homepage marker: ${stale}`);
  if ((html.match(/class="accountability-hit-card/g) || []).length !== 3) fail(`${label}/index.html must contain exactly three fallback Hit List lanes`);
  if (!/<meta name="viewport"/i.test(html)) fail(`${label}/index.html lacks responsive viewport`);
  if (!/role="search"/i.test(html) || !/aria-live="polite"/i.test(html)) fail(`${label}/index.html lacks accessible search status`);
  if (/\bonly site\b|no other site/i.test(html)) fail(`${label}/index.html makes an unverified uniqueness claim`);
}

if (!failures.length) {
  checkHomepage(root);
  const searchHtml = read('search.html');
  if (!searchHtml.includes('search-query-handoff.js')) fail('search.html does not preserve homepage query parameters');
  if (!read('accountability-home.js').includes('/api/member/follows')) fail('Homepage follow buttons are not connected to the member follow API');
  if (!read('accountability-home.js').includes('matrixPendingAccountabilityFollow')) fail('Homepage lacks authenticated pending-follow handoff');
  if (!read('accountability-home.js').includes('homepage_search')) fail('Homepage search analytics event is missing');
  if (!read('accountability-home.js').includes('record_follow')) fail('Record follow analytics event is missing');

  const searchIndex = json('search-index.json');
  if (!array(searchIndex).length) fail('Search index is empty');
  const hit = json('data/cinematic-hit-list.json');
  if (!array(hit.entries).length) fail('Hit List data is empty');
  const ledger = json('data/accountability-question-ledger.json');
  if (ledger.count !== array(ledger.questions).length) fail('Open Question Ledger count mismatch');
  if (!ledger.count) fail('Open Question Ledger is empty');
  if (!clean(ledger.proposition).includes('public list of the questions')) fail('Open Question Ledger proposition is missing');
  if (!clean(ledger.questionQualityRule).includes('grammatical')) fail('Open Question Ledger quality rule is missing');
  const ids = new Set();
  for (const question of array(ledger.questions)) {
    if (!clean(question.id)) fail('Question missing id');
    if (ids.has(question.id)) fail(`Duplicate question id ${question.id}`);
    ids.add(question.id);
    for (const field of ['subjectId','subject','question','status','evidenceClassification','whatIsKnown','responseStatus','lastReviewed']) if (!clean(question[field])) fail(`${question.id || 'question'} missing ${field}`);
    if (!array(question.whatIsNotProven).length) fail(`${question.id} missing what-is-not-proven boundary`);
    if (!/[?]$/.test(clean(question.question))) fail(`${question.id} does not end as a question`);
    if (/\.\?$|;\?$|,\?$/.test(clean(question.question))) fail(`${question.id} contains malformed trailing punctuation`);
    if (/:\s*(?:maintain|obtain|verify|restore|request|secure|publish|locate|identify|confirm|authenticate|collect|compare|trace|review|document|find|add|attach|preserve|release|check|establish)\b/i.test(clean(question.question))) fail(`${question.id} still exposes an instruction fragment as a question`);
    const actionRoutes = [...array(question.dossierRoutes), ...array(question.sourceRoutes), ...array(question.timerRoutes)];
    if (!actionRoutes.length) warn(`${question.id} has no dossier, source or timer route`);
  }

  const report = json('downloads/search-first-accountability-home-report.json');
  if (!report.ok) fail('Homepage finalizer report is not OK');
  if (Number(report.accountabilityQuestions || 0) !== ledger.count) fail('Homepage report question count mismatch');
  const refinement = json('downloads/accountability-question-ledger-refinement.json');
  if (!refinement.ok || Number(refinement.questions || 0) !== ledger.count) fail('Question refinement report mismatch');
}

if (exists('_site')) {
  for (const relative of ['index.html','accountability-home.css','accountability-home.js','search-query-handoff.js','data/accountability-question-ledger.json']) if (!exists(relative, outputRoot)) fail(`Cloudflare output missing ${relative}`);
  if (exists('index.html', outputRoot)) checkHomepage(outputRoot);
  if (exists('search.html', outputRoot) && !read('search.html', outputRoot).includes('search-query-handoff.js')) fail('Cloudflare search.html lacks query handoff');
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  warnings,
  checks: {
    minimalistSearchGateway: failures.every(item => !/homepage|search/i.test(item)),
    threeLaneHitList: failures.every(item => !/three fallback Hit List/i.test(item)),
    openQuestionLedger: failures.every(item => !/Question Ledger|question/i.test(item)),
    authenticatedFollowHandoff: failures.every(item => !/follow/i.test(item)),
    cloudflareParity: failures.every(item => !/Cloudflare/i.test(item))
  }
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'search-first-accountability-home-pressure-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (exists('_site')) {
  fs.mkdirSync(path.join(outputRoot, 'downloads'), { recursive: true });
  fs.copyFileSync(path.join(root, 'downloads', 'search-first-accountability-home-pressure-test.json'), path.join(outputRoot, 'downloads', 'search-first-accountability-home-pressure-test.json'));
}

if (failures.length) {
  console.error('SEARCH-FIRST ACCOUNTABILITY HOME PRESSURE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Search-first accountability homepage pressure test passed with ${warnings.length} warning(s).`);
