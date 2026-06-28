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
requireFile('src/worker.js');
requireFile('scripts/build-cloudflare-output.js');
requireFile('scripts/patch-worker-pages-origin.js');

const redirects = exists('_redirects') ? read('_redirects') : '';
for (const route of [
  '/start-here /start-here.html 200',
  '/live-intel /live-intel.html 200',
  '/epstein /epstein-files.html 200',
  '/books /books.html 200',
  '/amazon-store /amazon-store-books.html 200',
  '/search /search.html 200'
]) {
  if (!redirects.includes(route)) fail(`repo _redirects missing documented rewrite route: ${route}`);
}
if (/\.html\s+301/.test(redirects)) fail('repo _redirects still contains .html 301 redirects that can create loops');

const headers = exists('_headers') ? read('_headers') : '';
for (const marker of [
  'Strict-Transport-Security',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: SAMEORIGIN',
  'max-age=31536000',
  'immutable',
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
requireIncludes('wrangler.jsonc', '"main": "src/worker.js"', 'Wrangler worker router entrypoint');
requireIncludes('wrangler.jsonc', '"binding": "ASSETS"', 'Wrangler ASSETS binding');
requireIncludes('wrangler.jsonc', '"directory": "_site"', 'Wrangler _site assets directory');
for (const marker of ['PAGES_STATIC_ORIGIN', 'https://matrixreprogrammed.pages.dev', 'new URL(pathname, env.STATIC_ORIGIN || PAGES_STATIC_ORIGIN)', 'cacheEverything', 'cacheTtlByStatus', '.html', '/index.html']) requireIncludes('src/worker.js', marker, `Worker Pages-origin proxy marker ${marker}`);
if (read('src/worker.js').includes('env.ASSETS.fetch')) fail('src/worker.js still contains stale ASSETS fetch path');
for (const marker of ['node_modules', 'copyHtmlRouteVariant', 'blockedFiles', '_redirects', 'must not be deployed']) requireIncludes('scripts/build-cloudflare-output.js', marker, `Cloudflare output builder marker ${marker}`);

if (problems.length) {
  console.error('\nCLOUDFLARE PAGES PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('CLOUDFLARE PAGES PRESSURE TEST PASSED');
console.log('Checked Cloudflare Pages setup, strong headers, Pages-origin Worker proxy, _site assets, and route fallbacks.');
