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
  'scripts/build-board-split.js',
  'scripts/forum-board-split-test.js',
  'data/forum-board-split.json',
  'forum.html',
  'dark-speculation-forum.html',
  'epstein-alive-board.html',
  'deploy-status.html',
  'deploy-status.json',
  'downloads/deploy-status.json',
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  'analytics.js',
  'welcome-gate.js',
  'welcome-gate.css',
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
  '/main-board': '/forum.html',
  '/speculation-board': '/dark-speculation-forum.html',
  '/dark-speculation-board': '/dark-speculation-forum.html',
  '/epstein-alive-board': '/epstein-alive-board.html',
  '/epstein-sighting-board': '/epstein-alive-board.html',
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
  requireIncludes('src/worker.js', 'posts:index', 'forum posts index key');
  requireIncludes('src/worker.js', "prefix: 'post:'", 'durable forum post prefix scan');
  requireIncludes('src/worker.js', 'listStoredPosts', 'forum post self-heal scanner');
  requireIncludes('src/worker.js', 'savePostRecord', 'durable post record writer');
  requireIncludes('src/worker.js', 'selfHealingIndex', 'forum self-healing index response');
  requireIncludes('src/worker.js', 'handleForumPostsJson', 'forum posts JSON download handler');
  requireIncludes('src/worker.js', 'handleForumPostsMarkdown', 'forum posts Markdown download handler');
  requireIncludes('src/worker.js', "originalPath === '/downloads/forum-posts.json'", 'dynamic forum posts JSON route');
  requireIncludes('src/worker.js', "originalPath === '/downloads/forum-posts.md'", 'dynamic forum posts Markdown route');
  requireIncludes('src/worker.js', 'boardLabels', 'board labels');
  requireIncludes('src/worker.js', 'boardAware: true', 'board aware health marker');
  requireIncludes('src/worker.js', 'filterPostsByBoard', 'board feed filter');
  requireIncludes('src/worker.js', '/forum-feed?board=main', 'main board feed');
  requireIncludes('src/worker.js', '/forum-feed?board=speculation', 'speculation board feed');
  requireIncludes('src/worker.js', '/forum-feed?board=epstein-alive', 'sighting board feed');
  requireIncludes('src/worker.js', 'handleIntroVoice', 'ElevenLabs intro voice handler');
  requireIncludes('src/worker.js', "originalPath === '/intro-voice'", 'intro voice route');
  requireIncludes('src/worker.js', 'ELEVENLABS_API_KEY', 'ElevenLabs secret usage');
  requireIncludes('src/worker.js', 'ELEVENLABS_VOICE_ID', 'ElevenLabs voice id override');
  requireIncludes('src/worker.js', 'https://api.elevenlabs.io/v1/text-to-speech/', 'ElevenLabs TTS endpoint');
  requireIncludes('src/worker.js', 'xi-api-key', 'ElevenLabs API key header');
  requireIncludes('src/worker.js', 'audio/mpeg', 'intro voice audio response');
  requireIncludes('src/worker.js', 'handleTrackEvent', 'analytics event handler');
  requireIncludes('src/worker.js', "originalPath === '/track-event'", 'Cloudflare track-event route');
  requireIncludes('src/worker.js', 'analytics:${event.id}', 'analytics KV event key');
  for (const [from, to] of Object.entries(requiredAliases)) {
    if (!worker.includes(`'${from}': '${to}'`)) fail(`src/worker.js missing Cloudflare alias ${from} -> ${to}`);
  }
}

if (exists('forum.html')) requireIncludes('forum.html', 'data-board="main"', 'main board marker');
if (exists('dark-speculation-forum.html')) requireIncludes('dark-speculation-forum.html', 'data-board="speculation"', 'speculation board marker');
if (exists('epstein-alive-board.html')) requireIncludes('epstein-alive-board.html', 'data-board="epstein-alive"', 'sighting board marker');
if (exists('scripts/harden-public-html.js')) requireIncludes('scripts/harden-public-html.js', 'build-board-split.js', 'board split builder in hardening step');

if (exists('welcome-gate.js')) {
  requireIncludes('welcome-gate.js', '/intro-voice', 'welcome gate intro voice endpoint call');
  requireIncludes('welcome-gate.js', 'speechSynthesis', 'browser voice fallback');
  requireIncludes('welcome-gate.js', 'data-gate-voice', 'voice intro button');
  requireIncludes('welcome-gate.js', 'Voice Intro', 'Voice Intro label');
  requireIncludes('welcome-gate.js', 'ElevenLabs Voice', 'ElevenLabs active label');
}
if (exists('welcome-gate.css')) {
  requireIncludes('welcome-gate.css', '.gate-voice', 'gate voice button styles');
  requireIncludes('welcome-gate.css', '.gate-voice.is-speaking', 'gate voice speaking state');
}

if (exists('analytics.js')) {
  requireIncludes('analytics.js', "navigator.sendBeacon('/track-event'", 'analytics sendBeacon uses /track-event');
  requireIncludes('analytics.js', "fetch('/track-event'", 'analytics fetch fallback uses /track-event');
}

if (exists('wrangler.toml')) {
  requireIncludes('wrangler.toml', 'main = "src/worker.js"', 'Cloudflare worker entrypoint');
  requireIncludes('wrangler.toml', 'directory = "./_site"', 'Cloudflare asset directory');
  requireIncludes('wrangler.toml', 'FORUM_POSTS', 'FORUM_POSTS KV binding');
  requireIncludes('wrangler.toml', '99996d87016d4285a833707cbda5232f', 'persistent FORUM_POSTS namespace id');
}

if (exists('downloads/forum-posts.json')) {
  requireIncludes('downloads/forum-posts.json', 'Cloudflare Worker /downloads/forum-posts.json reads FORUM_POSTS KV', 'audit-safe forum posts JSON placeholder');
}
if (exists('downloads/forum-posts.md')) {
  requireIncludes('downloads/forum-posts.md', 'persistent FORUM_POSTS KV namespace', 'audit-safe forum posts Markdown placeholder');
}

if (exists('scripts/build-cloudflare-output.js')) {
  requireIncludes('scripts/build-cloudflare-output.js', '_site', 'Cloudflare output directory');
  requireIncludes('scripts/build-cloudflare-output.js', 'netlify.toml', 'legacy manifest excluded from _site');
}

if (exists('deploy-status.html')) {
  const deployStatus = read('deploy-status.html');
  requireIncludes('deploy-status.html', 'DEPLOY STATUS.', 'deploy-status hero');
  requireIncludes('deploy-status.html', 'Cloudflare Deploy Verification', 'Cloudflare deploy verification label');
  requireIncludes('deploy-status.html', 'FOLLOW THE FILES.', 'homepage proof marker');
  requireIncludes('deploy-status.html', '/epstein', 'Epstein alias proof');
  requireIncludes('deploy-status.html', 'forum.html', 'audit-safe Signal Board link');
  requireIncludes('deploy-status.html', 'Required aliases:', 'visible required alias count');
  if (/href=["']forum-health["']/i.test(deployStatus)) fail('deploy-status.html must not link to dynamic forum-health as a static page');
}
if (exists('deploy-status.json')) {
  const status = JSON.parse(read('deploy-status.json'));
  if (!status.workerScript || status.workerScript !== 'src/worker.js') fail('deploy-status.json missing workerScript src/worker.js');
  if (!status.assetOutput || status.assetOutput !== '_site') fail('deploy-status.json missing assetOutput _site');
  if (!Array.isArray(status.aliases) || status.aliases.length < Object.keys(requiredAliases).length) fail('deploy-status.json missing aliases array');
  if (!Array.isArray(status.requiredAliases) || status.requiredAliases.length < Object.keys(requiredAliases).length) fail('deploy-status.json missing required alias list');
  for (const [from, to] of Object.entries(requiredAliases)) {
    const alias = (status.aliases || []).find(item => item.route === from && item.target === to);
    if (!alias) fail(`deploy-status.json aliases missing ${from} -> ${to}`);
    if (alias && alias.present !== true) fail(`deploy-status.json alias not marked present: ${from} -> ${to}`);
  }
  if (!status.requiredAliasMap || Object.keys(status.requiredAliasMap).length < Object.keys(requiredAliases).length) fail('deploy-status.json missing requiredAliasMap');
  if (!status.liveProof || status.liveProof.forumHealthEndpoint !== '/forum-health') fail('deploy-status.json missing dynamic forum health endpoint note');
}

requireIncludes('package.json', 'build-deploy-status.js', 'deploy-status builder in npm build');
requireIncludes('package.json', 'cloudflare-worker-routes-test.js', 'Cloudflare Worker route test in npm build');

if (problems.length) {
  console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
try { require('./forum-board-split-test.js'); } catch (error) { console.error(error.message); process.exit(1); }
console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked Worker alias map, three-board Signal Board split, persistent FORUM_POSTS KV namespace, durable post:* scan, self-healing forum index, dynamic forum downloads, ElevenLabs intro voice endpoint, analytics /track-event endpoint, wrangler config, and npm build wiring.');
