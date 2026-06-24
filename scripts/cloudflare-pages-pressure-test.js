const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }

requireFile('_redirects');
requireFile('_headers');
requireFile('CLOUDFLARE_PAGES_SETUP.md');
requireFile('package.json');

const redirects = exists('_redirects') ? read('_redirects') : '';
for (const route of [
  '/live-intel /live-intel.html 200',
  '/epstein /epstein-files.html 301',
  '/books /books.html 200',
  '/amazon-store /amazon-store-books.html 200',
  '/rss /feeds/main-signal.xml 301',
  '/download-center /download-center.html 301',
  '/evidence-vault /evidence-vault.html 301',
  '/search /search.html 301',
  '/forum /forum.html 200',
  '/power-atlas /power-atlas.html 301'
]) {
  if (!redirects.includes(route)) fail(`_redirects missing critical route: ${route}`);
}

const headers = exists('_headers') ? read('_headers') : '';
for (const marker of [
  'Referrer-Policy: strict-origin-when-cross-origin',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: SAMEORIGIN',
  '/downloads/*.pdf',
  'Content-Type: application/pdf',
  '/downloads/*.json',
  'Content-Type: application/json',
  '/downloads/*.md',
  'Content-Type: text/markdown',
  '/feeds/*.xml',
  'Content-Type: application/xml'
]) {
  if (!headers.includes(marker)) fail(`_headers missing marker: ${marker}`);
}

requireIncludes('CLOUDFLARE_PAGES_SETUP.md', 'Build command: `npm run build`', 'Cloudflare build command');
requireIncludes('CLOUDFLARE_PAGES_SETUP.md', 'Build output directory: `.`', 'Cloudflare output directory');
requireIncludes('CLOUDFLARE_PAGES_SETUP.md', 'Node version: `22`', 'Cloudflare Node version');

if (problems.length) {
  console.error('\nCLOUDFLARE PAGES PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('CLOUDFLARE PAGES PRESSURE TEST PASSED');
console.log('Checked Cloudflare _redirects, _headers, setup guide, critical routes, download content types, and build instructions.');
