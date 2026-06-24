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

requireFile('data/books.json');
requireFile('book-universe.html');
requireFile('books.html');
requireFile('search-index.json');
requireFile('sitemap.xml');
requireFile('llms.txt');
requireFile('netlify.toml');
requireFile('scripts/build-phase4-book-universe.js');
requireFile('scripts/cleanup-duplicates.js');
requireFile('forum.html');

const books = exists('data/books.json') ? json('data/books.json').books.filter(book => book.status !== 'planned' && book.status !== 'unpublished') : [];
const search = exists('search-index.json') ? json('search-index.json') : [];
const coreNavPages = ['index.html', 'start-here.html', 'books.html', 'book-universe.html', 'power-atlas.html', 'evidence-vault.html', 'news.html', 'search.html', 'timers.html'];

requireIncludes('book-universe.html', 'BOOKS THAT ROUTE INTO THE MACHINE', 'Book Universe hero');
requireIncludes('book-universe.html', 'BOOK UNIVERSE STATUS', 'Book Universe status terminal');
requireIncludes('book-universe.html', 'Power Atlas', 'Power Atlas routing language');
requireIncludes('book-universe.html', 'Evidence Vault', 'Evidence Vault routing language');
requireIncludes('book-universe.html', 'Black File', 'Black File funnel language');
requireIncludes('book-universe.html', 'Signal Board', 'restored Signal Board nav');

for (const file of coreNavPages) {
  requireIncludes(file, 'forum.html', 'Signal Board nav link');
  requireIncludes(file, 'book-universe.html', 'Book Universe nav/link');
}

for (const book of books) {
  const file = book.generatedUrl || book.localUrl;
  if (!file || !file.endsWith('.html')) continue;
  requireFile(file);
  requireIncludes(file, 'id="phase-four-book-universe"', 'Phase 4 book route section');
  requireIncludes(file, 'Book Universe Route', 'Book Universe Route heading');
  requireIncludes(file, 'Connected Power Atlas Nodes', 'Connected Power Atlas Nodes section');
  requireIncludes(file, 'Connected Evidence Vault Lanes', 'Connected Evidence Vault Lanes section');
  requireIncludes(file, 'Evidence Boundary', 'Evidence Boundary card');
  requireIncludes(file, 'Black File', 'Black File funnel link');
}

requireIncludes('sitemap.xml', '/book-universe.html', 'Book Universe sitemap entry');
requireIncludes('llms.txt', '/book-universe.html', 'Book Universe llms.txt entry');
if (!search.some(item => item.url === 'book-universe.html')) fail('search-index.json missing book-universe.html');

const packageJson = exists('package.json') ? json('package.json') : { scripts: {} };
const build = packageJson.scripts && packageJson.scripts.build || '';
if (!build.includes('build-phase4-book-universe.js')) fail('package.json build missing build-phase4-book-universe.js');
if (!build.includes('phase4-pressure-test.js')) fail('package.json build missing phase4-pressure-test.js');
const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
if (!netlify.includes('build-phase4-book-universe.js')) fail('netlify.toml missing build-phase4-book-universe.js');
if (!netlify.includes('phase4-pressure-test.js')) fail('netlify.toml missing phase4-pressure-test.js');
if (!netlify.includes('from = "/book-universe"')) fail('netlify.toml missing /book-universe redirect');
if (!netlify.includes('from = "/forum"')) fail('netlify.toml missing /forum redirect');

const cleanup = exists('scripts/cleanup-duplicates.js') ? read('scripts/cleanup-duplicates.js') : '';
if (!cleanup.includes('phaseFourFiles')) fail('cleanup script missing Phase 4 self-heal files');
if (!cleanup.includes('build-phase4-book-universe.js')) fail('cleanup script missing Phase 4 builder fallback');
if (!cleanup.includes('forum.html')) fail('cleanup script master nav missing Signal Board/forum link');

if (problems.length) {
  console.error('\nPHASE 4 BOOK UNIVERSE PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 4 BOOK UNIVERSE PRESSURE TEST PASSED');
console.log(`Checked ${books.length} live book pages, Book Universe hub, Signal Board nav, sitemap, llms.txt, search index, redirects, and cleanup fallback.`);
