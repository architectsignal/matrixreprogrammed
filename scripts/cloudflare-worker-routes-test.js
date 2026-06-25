const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }

const requiredFiles = [
  'src/worker.js',
  'wrangler.toml',
  'scripts/build-cloudflare-output.js',
  'scripts/build-deploy-status.js',
  'deploy-status.html',
  'deploy-status.json',
  'downloads/deploy-status.json',
  'package.json'
];
requiredFiles.forEach(requireFile);

const requiredAliases = {
  '/deploy-status': '/deploy-status.html',
  '/epstein': '/epstein-files.html',
  '/live-intel': '/live-intel.html',
  '/evidence-vault': '/evidence-vault.html',
  '/power-atlas': '/power-atlas.html',
  '/book-universe': '/book-universe.html',
  '/answer-engine': '/answer-engine.html',
  '/offer-center': '/offer-center.html',
  '/opt-in': '/optin-center.html',
  '/rss': '/feed-center.html',
  '/forum': '/forum.html',
  '/amazon-store': '/amazon-store-books.html'
};

if (exists('src/worker.js')) {
  const worker = read('src/worker.js');
  requireIncludes('src/worker.js', 'const routeAliases = {', 'routeAliases map');
  requireIncludes('src/worker.js', 'routeAliases[originalPath]', 'original route alias lookup');
  requireIncludes('src/worker.js', 'routeAliases[normalizedPath]', 'normalized route alias lookup');
  requireIncludes('src/worker.js', 'env.ASSETS.fetch', 'Cloudflare ASSETS fetch');
  requireIncludes('src/worker.js', '/forum-health', 'forum health endpoint');
  requireIncludes('src/worker.js', 'FORUM_POSTS', 'FORUM_POSTS KV binding usage');
  for (const [from, to] of Object.entries(requiredAliases)) {
    if (!worker.includes(`'${from}': '${to}'`)) fail(`src/worker.js missing Cloudflare alias ${from} -> ${to}`);
  }
}

if (exists('wrangler.toml')) {
  requireIncludes('wrangler.toml', 'main = "src/worker.js"', 'Cloudflare worker entrypoint');
  requireIncludes('wrangler.toml', 'directory = "./_site"', 'Cloudflare asset directory');
  requireIncludes('wrangler.toml', 'FORUM_POSTS', 'FORUM_POSTS KV binding');
}

if (exists('scripts/build-cloudflare-output.js')) {
  requireIncludes('scripts/build-cloudflare-output.js', '_site', 'Cloudflare output directory');
  requireIncludes('scripts/build-cloudflare-output.js', 'netlify.toml', 'legacy manifest excluded from _site');
}

if (exists('deploy-status.html')) {
  requireIncludes('deploy-status.html', 'DEPLOY STATUS.', 'deploy-status hero');
  requireIncludes('deploy-status.html', 'Cloudflare Deploy Verification', 'Cloudflare deploy verification label');
  requireIncludes('deploy-status.html', 'FOLLOW THE FILES.', 'homepage proof marker');
  requireIncludes('deploy-status.html', '/epstein', 'Epstein alias proof');
}
if (exists('deploy-status.json')) {
  const status = JSON.parse(read('deploy-status.json'));
  if (!status.workerScript || status.workerScript !== 'src/worker.js') fail('deploy-status.json missing workerScript src/worker.js');
  if (!status.assetOutput || status.assetOutput !== '_site') fail('deploy-status.json missing assetOutput _site');
  if (!Array.isArray(status.requiredAliases) || status.requiredAliases.length < Object.keys(requiredAliases).length) fail('deploy-status.json missing required alias list');
}

requireIncludes('package.json', 'build-deploy-status.js', 'deploy-status builder in npm build');
requireIncludes('package.json', 'cloudflare-worker-routes-test.js', 'Cloudflare Worker route test in npm build');

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked Worker alias map, FORUM_POSTS KV use, Cloudflare ASSETS routing, deploy-status outputs, wrangler config, and npm build wiring.');
