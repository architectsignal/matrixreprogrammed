const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const issues = [];

function p(file) { return path.join(root, file); }
function sp(file) { return path.join(site, file); }
function exists(file) { return fs.existsSync(p(file)); }
function siteExists(file) { return fs.existsSync(sp(file)); }
function read(file) { return fs.readFileSync(p(file), 'utf8'); }
function siteRead(file) { return fs.readFileSync(sp(file), 'utf8'); }
function needFile(file) { if (!exists(file)) issues.push(`missing source file: ${file}`); }
function needSiteFile(file) { if (!siteExists(file)) issues.push(`missing built asset: _site/${file}`); }
function needText(file, text, label = text) { if (exists(file) && !read(file).includes(text)) issues.push(`${file} missing ${label}`); }
function needSiteText(file, text, label = text) { if (siteExists(file) && !siteRead(file).includes(text)) issues.push(`_site/${file} missing ${label}`); }
function forbidSiteText(file, text, label = text) { if (siteExists(file) && siteRead(file).includes(text)) issues.push(`_site/${file} still contains ${label}`); }
function parseJson(file) {
  try { return JSON.parse(siteRead(file)); }
  catch (error) { issues.push(`_site/${file} invalid JSON: ${error.message}`); return null; }
}

for (const file of [
  'index.html',
  'amazon-store-books.html',
  'amazon-store-books.js',
  'data/amazon-store-visible-books.json',
  'forum.html',
  'forum.js',
  'src/worker.js',
  'wrangler.toml',
  'scripts/hide-visible-compatibility-markers.js',
  'scripts/build-cloudflare-output.js'
]) needFile(file);

for (const file of [
  'index.html',
  'index',
  'amazon-store-books.html',
  'amazon-store-books',
  'amazon-store-books.js',
  'data/amazon-store-visible-books.json',
  'forum.html',
  'forum',
  'forum.js',
  'search.html',
  'search',
  'books.html',
  'books',
  'deploy-health.html',
  'deploy-health'
]) needSiteFile(file);

for (const file of ['index.html', 'amazon-store-books.html', 'books.html', 'search.html', 'deploy-health.html']) {
  forbidSiteText(file, 'preservedaftervisiblede-duplication', 'legacy compatibility marker leak');
  forbidSiteText(file, 'new-intelligence-toolspreserved', 'legacy intelligence marker leak');
  forbidSiteText(file, 'reader-usefulness-routepreserved', 'legacy reader marker leak');
}

needSiteText('index.html', 'FOLLOW THE FILES', 'homepage hero');
needSiteText('index.html', 'READ THE SYSTEM', 'homepage hero');
needSiteText('amazon-store-books.html', 'Store Titles', 'Amazon store section');
needSiteText('amazon-store-books.js', 'fallbackBooks', 'Amazon fallback catalogue');
needSiteText('amazon-store-books.js', "cache:'no-store'", 'Amazon no-store catalogue fetch');
needSiteText('amazon-store-books.js', 'instant fallback', 'instant fallback render');

const catalogue = siteExists('data/amazon-store-visible-books.json') ? parseJson('data/amazon-store-visible-books.json') : null;
if (catalogue) {
  if (catalogue.updated !== '2026-07-01') issues.push(`Amazon catalogue updated date should be 2026-07-01, got ${catalogue.updated}`);
  if (!Array.isArray(catalogue.books) || catalogue.books.length < 20) issues.push('Amazon catalogue should contain at least 20 visible titles');
  if (!catalogue.books.some(book => book && book.title === 'As Above, So Below')) issues.push('Amazon catalogue missing As Above, So Below');
}

// Forum persistence guard: these strings must remain in the Worker/front-end. This script does not alter them.
for (const text of [
  'FORUM_POSTS',
  '/forum-health',
  '/forum-feed-main',
  '/forum-feed-speculation',
  '/forum-feed-epstein-alive',
  '/downloads/forum-posts.json',
  '/downloads/forum-posts.md',
  '/submit-main-post',
  '/submit-speculation-post',
  '/submit-epstein-alive-post',
  '/report-main-post',
  '/report-speculation-post',
  '/report-epstein-alive-post',
  'persistent: true',
  'Cloudflare KV FORUM_POSTS'
]) needText('src/worker.js', text, `forum persistence route ${text}`);

for (const text of [
  '/forum-feed-main',
  '/forum-feed-speculation',
  '/forum-feed-epstein-alive',
  '/submit-main-post',
  '/submit-speculation-post',
  '/submit-epstein-alive-post',
  'persistent !== true',
  'Signal posted live and saved persistently'
]) needText('forum.js', text, `forum frontend persistence ${text}`);

needText('wrangler.toml', 'binding = "FORUM_POSTS"', 'FORUM_POSTS KV binding');
needText('wrangler.toml', 'id = "99996d87016d4285a833707cbda5232f"', 'FORUM_POSTS KV namespace id');
needText('wrangler.toml', 'directory = "./_site"', 'Cloudflare asset output directory');
needText('wrangler.toml', 'run_worker_first = true', 'Worker-first routing');

if (fs.existsSync(path.join(site, '_redirects'))) issues.push('_site/_redirects must not exist for Worker assets deployment');

if (issues.length) {
  console.error('\nPRODUCTION DEPLOY GUARD FAILED\n');
  for (const issue of issues) console.error(`- ${issue}`);
  console.error(`\n${issues.length} issue(s) found. Deployment blocked.\n`);
  process.exit(1);
}

console.log('PRODUCTION DEPLOY GUARD PASSED');
console.log('Checked clean public pages, Amazon store fallback/data, Cloudflare _site output, Worker asset mode, and forum KV persistence routes.');
