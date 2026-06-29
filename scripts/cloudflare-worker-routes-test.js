const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
const exists = file => fs.existsSync(path.join(root, file));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = msg => problems.push(msg);
const requireFile = file => { if (!exists(file)) fail(`missing required file: ${file}`); };
const requireIncludes = (file, text, label = text) => {
  if (!exists(file)) return;
  if (!read(file).includes(text)) fail(`${file}: missing ${label}`);
};
const forbidIncludes = (file, text, label = text) => {
  if (!exists(file)) return;
  if (read(file).includes(text)) fail(`${file}: should not contain ${label}`);
};

[
  'src/worker.js',
  'wrangler.toml',
  '_headers',
  'scripts/build-cloudflare-output.js',
  'scripts/patch-worker-pages-origin.js',
  'package.json',
  '_site/index.html',
  '_site/index',
  '_site/search.html',
  '_site/search',
  '_site/books.html',
  '_site/books',
  '_site/live-intel.html',
  '_site/live-intel',
  '_site/epstein-files.html',
  '_site/epstein-files',
  '_site/forum.html',
  '_site/forum',
  '_site/deploy-status.html',
  '_site/deploy-status'
].forEach(requireFile);

if (exists('_site/_redirects')) fail('_site/_redirects must not be deployed with Worker assets');

requireIncludes('src/worker.js', 'const routeAliases = {', 'routeAliases map');
requireIncludes('src/worker.js', 'routeAliases[originalPath]', 'original route alias lookup');
requireIncludes('src/worker.js', 'routeAliases[normalizedPath]', 'normalized route alias lookup');
requireIncludes('src/worker.js', 'env.ASSETS.fetch', 'bundled Worker asset fetch');
requireIncludes('src/worker.js', "X-Matrix-Origin', 'worker-assets", 'worker asset origin header');
requireIncludes('src/worker.js', '/forum-health', 'forum health endpoint');
requireIncludes('src/worker.js', '/forum-feed', 'forum feed endpoint');
requireIncludes('src/worker.js', '/submit-forum-post', 'forum submit endpoint');
requireIncludes('src/worker.js', '/report-forum-post', 'forum report endpoint');
requireIncludes('src/worker.js', '/downloads/forum-posts.json', 'forum JSON export');
requireIncludes('src/worker.js', '/downloads/forum-posts.md', 'forum Markdown export');
requireIncludes('src/worker.js', '/track-event', 'analytics endpoint');
requireIncludes('src/worker.js', '/intro-voice', 'intro voice endpoint');
requireIncludes('src/worker.js', 'FORUM_POSTS', 'FORUM_POSTS binding usage');
requireIncludes('src/worker.js', 'ELEVENLABS_API_KEY', 'ElevenLabs secret usage');

forbidIncludes('src/worker.js', 'PAGES_STATIC_ORIGIN', 'stale Pages origin constant');
forbidIncludes('src/worker.js', 'matrixreprogrammed.pages.dev', 'stale Pages origin URL');
forbidIncludes('src/worker.js', 'STATIC_ORIGIN ||', 'stale origin override');
forbidIncludes('src/worker.js', 'cacheEverything', 'stale origin cache path');

requireIncludes('wrangler.toml', 'main = "src/worker.js"', 'Worker entrypoint');
requireIncludes('wrangler.toml', 'directory = "./_site"', 'asset directory');
requireIncludes('wrangler.toml', 'binding = "ASSETS"', 'ASSETS binding');
requireIncludes('wrangler.toml', 'FORUM_POSTS', 'FORUM_POSTS KV binding');
requireIncludes('_headers', 'Strict-Transport-Security', 'HSTS header');
requireIncludes('_headers', 'immutable', 'immutable cache header');
requireIncludes('scripts/build-cloudflare-output.js', 'copyHtmlRouteVariant', 'extensionless route copier');
requireIncludes('scripts/build-cloudflare-output.js', 'Cloudflare output ready', 'output success marker');
requireIncludes('package.json', 'patch-worker-pages-origin.js', 'Worker asset patch in build');
requireIncludes('package.json', 'build-cloudflare-output.js', 'Cloudflare output builder in build');
requireIncludes('package.json', 'cloudflare-worker-routes-test.js', 'Cloudflare route test in build');

for (const testFile of ['forum-board-split-test.js', 'newsletter-system-test.js', 'cloudflare-error-hardening-test.js']) {
  const testPath = path.join(root, 'scripts', testFile);
  if (!fs.existsSync(testPath)) continue;
  try { require(testPath); } catch (error) { fail(`${testFile}: ${error.message}`); }
}

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}

console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked Worker asset serving, generated _site routes, forum endpoints, voice endpoint, analytics, headers, wrangler config, and build wiring.');
