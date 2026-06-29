const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function forbidIncludes(file, text, label = text) { if (!exists(file)) return; if (read(file).includes(text)) fail(`${file}: should not contain ${label}`); }

requireFile('_headers');
requireFile('package.json');
requireFile('wrangler.toml');
requireFile('src/worker.js');
requireFile('scripts/build-cloudflare-output.js');
requireFile('scripts/patch-worker-pages-origin.js');

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

requireIncludes('wrangler.toml', 'main = "src/worker.js"', 'Wrangler worker router entrypoint');
requireIncludes('wrangler.toml', 'directory = "./_site"', 'Wrangler bundled _site assets directory');
requireIncludes('wrangler.toml', 'binding = "ASSETS"', 'Wrangler ASSETS binding');

for (const marker of ['env.ASSETS.fetch', 'X-Matrix-Origin', 'worker-assets', '.html', '/index.html']) {
  requireIncludes('src/worker.js', marker, `Worker bundled asset marker ${marker}`);
}
for (const stale of ['PAGES_STATIC_ORIGIN', 'matrixreprogrammed.pages.dev', 'STATIC_ORIGIN ||', 'cacheEverything']) {
  forbidIncludes('src/worker.js', stale, `stale Pages proxy marker ${stale}`);
}

for (const marker of ['node_modules', 'copyHtmlRouteVariant', 'blockedFiles', '_redirects', 'must not be deployed', 'index.html', 'search.html']) {
  requireIncludes('scripts/build-cloudflare-output.js', marker, `Cloudflare output builder marker ${marker}`);
}
for (const marker of ['env.ASSETS.fetch', 'PAGES_STATIC_ORIGIN', 'matrixreprogrammed.pages.dev']) {
  requireIncludes('scripts/patch-worker-pages-origin.js', marker, `Worker asset patch guard ${marker}`);
}

if (exists('_redirects')) {
  const redirects = read('_redirects');
  if (/\.html\s+301/.test(redirects)) fail('repo _redirects still contains .html 301 redirects that can create loops');
}

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ASSET PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('CLOUDFLARE WORKER ASSET PRESSURE TEST PASSED');
console.log('Checked Worker-first bundled _site assets, strong headers, stale Pages-origin removal, route fallback support, and deployable Cloudflare output.');
