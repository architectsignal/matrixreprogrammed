const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }

requireFile('data/ai-answer-engine.json');
requireFile('scripts/build-phase5-ai-answer-engine.js');
requireFile('answer-engine.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/cleanup-duplicates.js');
requireFile('forum.html');

const data = exists('data/ai-answer-engine.json') ? json('data/ai-answer-engine.json') : { answers: [], rules: [] };
const answers = data.answers || [];
const search = exists('search-index.json') ? json('search-index.json') : [];
if (!Array.isArray(data.rules) || data.rules.length < 7) fail('data/ai-answer-engine.json expected at least 7 answer rules');
if (answers.length < 12) fail(`data/ai-answer-engine.json expected at least 12 answers, found ${answers.length}`);

requireIncludes('answer-engine.html', 'ANSWER ENGINE', 'AI Answer Engine hero');
requireIncludes('answer-engine.html', 'AI ANSWER ENGINE STATUS', 'AI Answer Engine status terminal');
requireIncludes('answer-engine.html', 'Structured Answers', 'Structured Answers section');
requireIncludes('answer-engine.html', 'Signal Board', 'restored Signal Board nav');
requireIncludes('answer-engine.html', 'Power Atlas', 'Power Atlas route');
requireIncludes('answer-engine.html', 'Evidence Vault', 'Evidence Vault route');

for (const answer of answers) {
  const file = `answer-${answer.slug}.html`;
  requireFile(file);
  requireIncludes(file, answer.question, `answer question ${answer.question}`);
  requireIncludes(file, 'What Is Confirmed', 'confirmed section');
  requireIncludes(file, 'What Is Disputed', 'disputed section');
  requireIncludes(file, 'Evidence Boundary', 'Evidence Boundary section');
  requireIncludes(file, 'Connected Power Atlas Nodes', 'Power Atlas route section');
  requireIncludes(file, 'Connected Evidence Vault Lanes', 'Evidence Vault route section');
  requireIncludes(file, 'Book Routes', 'Book Routes section');
  requireIncludes(file, 'FAQPage', 'FAQPage schema');
  if (!Array.isArray(answer.atlasNodes) || !answer.atlasNodes.length) fail(`${answer.slug}: missing atlasNodes route`);
  if (!Array.isArray(answer.evidenceLanes) || !answer.evidenceLanes.length) fail(`${answer.slug}: missing evidenceLanes route`);
  if (!Array.isArray(answer.books) || !answer.books.length) fail(`${answer.slug}: missing books route`);
  if (!answer.shortAnswer || answer.shortAnswer.length < 80) fail(`${answer.slug}: shortAnswer too thin`);
  if (!answer.boundary || answer.boundary.length < 40) fail(`${answer.slug}: boundary too thin`);
  if (!search.some(item => item.url === file)) fail(`search-index.json missing ${file}`);
  requireIncludes('sitemap.xml', `/${file}`, `${file} sitemap entry`);
}

requireIncludes('sitemap.xml', '/answer-engine.html', 'answer-engine sitemap entry');
requireIncludes('llms.txt', '/answer-engine.html', 'answer-engine llms.txt entry');
if (!search.some(item => item.url === 'answer-engine.html')) fail('search-index.json missing answer-engine.html');

const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('build-phase5-ai-answer-engine.js')) fail('package.json build missing build-phase5-ai-answer-engine.js');
if (!build.includes('phase5-pressure-test.js')) fail('package.json build missing phase5-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase5-ai-answer-engine.js')) fail('netlify.toml missing build-phase5-ai-answer-engine.js');
if (!netlify.includes('phase5-pressure-test.js')) fail('netlify.toml missing phase5-pressure-test.js');
if (!netlify.includes('from = "/answer-engine"')) fail('netlify.toml missing /answer-engine redirect');
if (!netlify.includes('from = "/ai-answers"')) fail('netlify.toml missing /ai-answers redirect');

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseFiveFiles')) fail('cleanup script missing Phase 5 self-heal files');
if (!cleanup.includes('build-phase5-ai-answer-engine.js')) fail('cleanup script missing Phase 5 builder fallback');
if (!cleanup.includes('answer-engine.html')) fail('cleanup script master nav missing AI Answers link');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board link');

if (problems.length) {
  console.error('\nPHASE 5 AI ANSWER ENGINE PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 5 AI ANSWER ENGINE PRESSURE TEST PASSED');
console.log(`Checked ${answers.length} AI answer pages, Answer Engine hub, search index, sitemap, llms.txt, redirects, schemas, Signal Board nav, and cleanup fallback.`);
