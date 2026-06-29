const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function forbidIncludes(file, text, label = text){ if(!exists(file)) return; if(read(file).includes(text)) fail(`${file}: should not contain ${label}`); }

const requiredFiles = [
  'src/worker.js',
  'wrangler.toml',
  '_headers',
  'scripts/build-cloudflare-output.js',
  'scripts/build-deploy-status.js',
  'scripts/patch-worker-pages-origin.js',
  'deploy-status.html',
  'deploy-status.json',
  'downloads/deploy-status.json',
  'package.json'
];
requiredFiles.forEach(requireFile);

const directStaticRoutes = [
  'index.html',
  'index',
  'search.html',
  'search',
  'books.html',
  'books',
  'live-intel.html',
  'live-intel',
  'epstein-files.html',
  'epstein-files',
  'evidence-vault.html',
  'evidence-vault',
  'amazon-store-books.html',
  'amazon-store-books',
  'forum.html',
  'forum'
];

const routeAliases = {
  '/home': '/index.html',
  '/start': '/start-here.html',
  '/ask-matrix': '/search.html',
  '/signal-board': '/forum.html',
  '/epstein': '/epstein-files.html',
  '/amazon-store': '/amazon-store-books.html',
  '/opt-in': '/optin-center.html',
  '/rss': '/feed-center.html',
  '/deploy-status': '/deploy-status.html'
};

if (exists('src/worker.js')) {
  const worker = read('src/worker.js');
  requireIncludes('src/worker.js', 'const routeAliases = {', 'routeAliases map');
  requireIncludes('src/worker.js', 'routeAliases[originalPath]', 'original route alias lookup');
  requireIncludes('src/worker.js', 'routeAliases[normalizedPath]', 'normalized route alias lookup');
  requireIncludes('src/worker.js', 'env.ASSETS.fetch', 'bundled Cloudflare Worker asset fetch');
  requireIncludes('src/worker.js', "X-Matrix-Origin', 'worker-assets", 'worker asset origin header');
  requireIncludes('src/worker.js', '/forum-health', 'forum health endpoint');
  requireIncludes('src/worker.js', '/forum-feed', 'forum feed endpoint');
  requireIncludes('src/worker.js', '/submit-forum-post', 'forum submit endpoint');
  requireIncludes('src/worker.js', '/report-forum-post', 'forum report endpoint');
  requireIncludes('src/worker.js', '/downloads/forum-posts.json', 'forum JSON export endpoint');
  requireIncludes('src/worker.js', '/downloads/forum-posts.md', 'forum Markdown export endpoint');
  requireIncludes('src/worker.js', '/track-event', 'analytics endpoint');
  requireIncludes('src/worker.js', '/intro-voice', 'intro voice endpoint');
  requireIncludes('src/worker.js', 'FORUM_POSTS', 'FORUM_POSTS KV binding usage');
  requireIncludes('src/worker.js', 'ELEVENLABS_API_KEY', 'ElevenLabs secret usage');
  forbidIncludes('src/worker.js', 'PAGES_STATIC_ORIGIN', 'stale Pages origin constant');
  forbidIncludes('src/worker.js', 'matrixreprogrammed.pages.dev', 'stale Pages origin URL');
  forbidIncludes('src/worker.js', 'STATIC_ORIGIN ||', 'runtime Pages origin override');
  forbidIncludes('src/worker.js', 'cacheEverything', 'Pages-origin fetch caching path');
  for (const [from, to] of Object.entries(routeAliases)) {
    if (!worker.includes(`'${from}': '${to}'`)) fail(`src/worker.js missing Worker alias ${from} -> ${to}`);
  }
}

if (exists('wrangler.toml')) {
  requireIncludes('wrangler.toml', 'main = "src/worker.js"', 'Cloudflare worker entrypoint');
  requireIncludes('wrangler.toml', 'directory = "./_site"', 'Cloudflare asset directory');
  requireIncludes('wrangler.toml', 'binding = "ASSETS"', 'ASSETS binding');
  requireIncludes('wrangler.toml', 'FORUM_POSTS', 'FORUM_POSTS KV binding');
}

if (exists('_headers')) {
  requireIncludes('_headers', 'Strict-Transport-Security', 'HSTS header');
  requireIncludes('_headers', 'immutable', 'immutable cache headers');
  requireIncludes('_headers', '/downloads/*.pdf', 'PDF download header');
}

if (exists('scripts/build-cloudflare-output.js')) {
  requireIncludes('scripts/build-cloudflare-output.js', 'copyHtmlRouteVariant', 'extensionless HTML route copier');
  requireIncludes('scripts/build-cloudflare-output.js', '_redirects', 'redirect exclusion');
  for (const route of directStaticRoutes) requireIncludes('scripts/build-cloudflare-output.js', route, `_site route ${route}`);
}
requireIncludes('package.json', 'patch-worker-pages-origin.js', 'Worker asset patch in npm build');
requireIncludes('package.json', 'build-cloudflare-output.js', 'Cloudflare output builder in npm build');
requireIncludes('package.json', 'cloudflare-worker-routes-test.js', 'Cloudflare Worker route test in npm build');

if (exists('scripts/forum-board-split-test.js')) {
  try { require('./forum-board-split-test.js'); } catch (error) { fail(error.message); }
}
if (exists('scripts/newsletter-system-test.js')) {
  try { require('./newsletter-system-test.js'); } catch (error) { fail(error.message); }
}
if (exists('scripts/cloudflare-error-hardening-test.js')) {
  try { require('./cloudflare-error-hardening-test.js'); } catch (error) { fail(error.message); }
}

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked Worker-first bundled asset serving, essential aliases, direct _site routes, KV-backed forum endpoints, intro voice, analytics, headers, wrangler config, and Cloudflare output wiring.');
