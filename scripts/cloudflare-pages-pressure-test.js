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
requireFile('wrangler.jsonc');
requireFile('scripts/build-cloudflare-output.js');

const redirects = exists('_redirects') ? read('_redirects') : '';
for (const route of [
  '/start-here /start-here.html 200',
  '/live-intel /live-intel.html 200',
  '/epstein /epstein-files.html 200',
  '/books /books.html 200',
  '/amazon-store /amazon-store-books.html 200',
  '/rss /feeds/main-signal.xml 200',
  '/download-center /download-center.html 200',
  '/evidence-vault /evidence-vault.html 200',
  '/search /search.html 200',
  '/forum /forum.html 200',
  '/power-atlas /power-atlas.html 200'
]) {
  if (!redirects.includes(route)) fail(`_redirects missing no-loop rewrite route: ${route}`);
}
if (/\.html\s+301/.test(redirects)) fail('_redirects still contains .html 301 redirects that can create Cloudflare loops');

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
requireIncludes('CLOUDFLARE_PAGES_SETUP.md', 'Build output directory: `_site`', 'Cloudflare output directory');
requireIncludes('CLOUDFLARE_PAGES_SETUP.md', 'Deploy command: leave blank', 'Cloudflare blank deploy command');
requireIncludes('CLOUDFLARE_PAGES_SETUP.md', 'Node version: `22`', 'Cloudflare Node version');
requireIncludes('wrangler.jsonc', '"directory": "_site"', 'Wrangler _site assets directory');
for (const marker of ['node_modules', 'copyExtensionlessHtml', 'start-here', 'epstein-files', 'live-intel']) {
  requireIncludes('scripts/build-cloudflare-output.js', marker, `Cloudflare output builder marker ${marker}`);
}

if (problems.length) {
  console.error('\nCLOUDFLARE PAGES PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('CLOUDFLARE PAGES PRESSURE TEST PASSED');
console.log('Checked Cloudflare no-loop rewrites, _headers, setup guide, _site Wrangler assets, extensionless HTML Worker assets, critical routes, and download content types.');
