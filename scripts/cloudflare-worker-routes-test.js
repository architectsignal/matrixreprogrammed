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
  'src/worker.js','wrangler.toml','_headers','scripts/build-cloudflare-output.js','scripts/build-deploy-status.js','scripts/build-board-split.js','scripts/apply-hard-board-split.js','scripts/patch-worker-pages-origin.js','scripts/build-newsletter-system.js','scripts/newsletter-system-test.js','scripts/build-cloudflare-error-hardening.js','scripts/cloudflare-error-hardening-test.js','scripts/forum-board-split-test.js','data/forum-board-split.json','forum.html','dark-speculation-forum.html','epstein-alive-board.html','newsletter.html','newsletter.js','deploy-status.html','deploy-status.json','downloads/deploy-status.json','downloads/forum-posts.json','downloads/forum-posts.md','downloads/weekly-newsletter-latest.json','downloads/weekly-newsletter-latest.md','analytics.js','welcome-gate.js','welcome-gate.css','package.json'
];
requiredFiles.forEach(requireFile);

const requiredAliases = {
  '/deploy-status': '/deploy-status.html', '/epstein': '/epstein-files.html', '/epstein-files': '/epstein-files.html', '/live-intel': '/live-intel.html', '/intel-desk': '/news.html', '/evidence-vault': '/evidence-vault.html', '/power-atlas': '/power-atlas.html', '/book-universe': '/book-universe.html', '/answer-engine': '/answer-engine.html', '/offer-center': '/offer-center.html', '/opt-in': '/optin-center.html', '/rss': '/feed-center.html', '/forum': '/forum.html', '/signal-board': '/forum.html', '/main-board': '/forum.html', '/speculation-board': '/dark-speculation-forum.html', '/dark-speculation-board': '/dark-speculation-forum.html', '/epstein-alive-board': '/epstein-alive-board.html', '/epstein-sighting-board': '/epstein-alive-board.html', '/epstein-sightings-board': '/epstein-alive-board.html', '/newsletter': '/newsletter.html', '/black-file-index': '/black-file-index.html', '/answer-index': '/answer-index.html', '/atlas-index': '/atlas-index.html', '/evidence-vault-index': '/evidence-vault-index.html', '/secret-societies-hub': '/authority-secret-societies.html', '/intelligence-hub': '/authority-intelligence-network.html', '/crime-hub': '/authority-crime-state-overlap.html', '/war-conflict-hub': '/authority-war-machine.html', '/dashboard-human-cost': '/news.html', '/dashboard-conflict': '/news.html', '/dashboard-economy': '/news.html', '/migration': '/migration-flow.html', '/amazon-store': '/amazon-store-books.html'
};
const hardBoardRoutes = ['/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive','/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post','/report-main-post','/report-speculation-post','/report-epstein-alive-post'];
const newsletterRoutes = ['/newsletter-signup','/newsletter-health','/newsletter-subscribers.json','/newsletter-send-weekly'];

if (exists('src/worker.js')) {
  const worker = read('src/worker.js');
  requireIncludes('src/worker.js', 'const routeAliases = {', 'routeAliases map');
  requireIncludes('src/worker.js', 'routeAliases[originalPath]', 'original route alias lookup');
  requireIncludes('src/worker.js', 'routeAliases[normalizedPath]', 'normalized route alias lookup');
  requireIncludes('src/worker.js', 'PAGES_STATIC_ORIGIN', 'Pages static origin constant');
  requireIncludes('src/worker.js', 'https://matrixreprogrammed.pages.dev', 'Pages static origin URL');
  requireIncludes('src/worker.js', 'new URL(pathname, env.STATIC_ORIGIN || PAGES_STATIC_ORIGIN)', 'Pages origin asset URL builder');
  requireIncludes('src/worker.js', 'cacheEverything', 'Cloudflare edge cache for proxied Pages assets');
  forbidIncludes('src/worker.js', 'env.ASSETS.fetch', 'empty standalone Worker ASSETS fetch');
  requireIncludes('src/worker.js', 'isHostileProbePath', 'hostile probe classifier');
  requireIncludes('src/worker.js', 'hardenResponse', 'cache/security response hardener');
  requireIncludes('src/worker.js', 'safeNotConfigured', 'safe configured-false response');
  requireIncludes('src/worker.js', 'Worker handled failure safely', 'safe Worker catch response');
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
  requireIncludes('src/worker.js', 'boardFromRoutePath', 'hard board route resolver');
  for (const route of hardBoardRoutes) requireIncludes('src/worker.js', route, `hard board route ${route}`);
  requireIncludes('src/worker.js', 'handleNewsletterSignup', 'newsletter signup handler');
  requireIncludes('src/worker.js', 'newsletter:index', 'newsletter subscriber index');
  requireIncludes('src/worker.js', 'newsletter:subscriber:', 'newsletter subscriber record prefix');
  for (const route of newsletterRoutes) requireIncludes('src/worker.js', route, `newsletter route ${route}`);
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
  for (const [from, to] of Object.entries(requiredAliases)) if (!worker.includes(`'${from}': '${to}'`)) fail(`src/worker.js missing Cloudflare alias ${from} -> ${to}`);
}
if (exists('_headers')) { requireIncludes('_headers', 'Strict-Transport-Security', 'HSTS header'); requireIncludes('_headers', 'immutable', 'immutable cache headers'); requireIncludes('_headers', '/downloads/*.pdf', 'PDF download header'); }
if (exists('forum.html')) requireIncludes('forum.html', 'data-board="main"', 'main board marker');
if (exists('dark-speculation-forum.html')) requireIncludes('dark-speculation-forum.html', 'data-board="speculation"', 'speculation board marker');
if (exists('epstein-alive-board.html')) requireIncludes('epstein-alive-board.html', 'data-board="epstein-alive"', 'sighting board marker');
if (exists('scripts/harden-public-html.js')) { requireIncludes('scripts/harden-public-html.js', 'build-board-split.js', 'board split builder in hardening step'); requireIncludes('scripts/harden-public-html.js', 'apply-hard-board-split.js', 'hard board split in hardening step'); requireIncludes('scripts/harden-public-html.js', 'build-newsletter-system.js', 'newsletter builder in hardening step'); requireIncludes('scripts/harden-public-html.js', 'build-cloudflare-error-hardening.js', 'Cloudflare error hardening in hardening step'); }
if (exists('forum.js')) { requireIncludes('forum.js', 'boardFromPath', 'frontend board from path fallback'); requireIncludes('forum.js', 'lockFormToBoard', 'frontend form board lock'); for (const route of hardBoardRoutes.slice(0, 6)) requireIncludes('forum.js', route, `frontend route ${route}`); }
if (exists('newsletter.js')) { requireIncludes('newsletter.js', '/newsletter-signup', 'newsletter signup endpoint'); requireIncludes('newsletter.js', 'type="email"', 'email input capture'); }
if (exists('newsletter.html')) { requireIncludes('newsletter.html', 'Weekly Signal Drop', 'newsletter page copy'); requireIncludes('newsletter.html', 'newsletter.js', 'newsletter client script'); }
if (exists('llms.txt')) requireIncludes('llms.txt', '/newsletter-signup', 'newsletter llms route');
if (exists('wrangler.toml')) { requireIncludes('wrangler.toml', 'main = "src/worker.js"', 'Cloudflare worker entrypoint'); requireIncludes('wrangler.toml', 'directory = "./_site"', 'Cloudflare asset directory'); requireIncludes('wrangler.toml', 'FORUM_POSTS', 'FORUM_POSTS KV binding'); requireIncludes('wrangler.toml', '99996d87016d4285a833707cbda5232f', 'persistent FORUM_POSTS namespace id'); }
requireIncludes('package.json', 'patch-worker-pages-origin.js', 'Pages origin proxy patch in npm build');
requireIncludes('package.json', 'build-deploy-status.js', 'deploy-status builder in npm build');
requireIncludes('package.json', 'cloudflare-worker-routes-test.js', 'Cloudflare Worker route test in npm build');

if (problems.length) { console.error('\nCLOUDFLARE WORKER ROUTES TEST FAILED\n'); for (const problem of problems) console.error(`- ${problem}`); console.error(`\n${problems.length} issue(s) found.\n`); process.exit(1); }
try { require('./forum-board-split-test.js'); } catch (error) { console.error(error.message); process.exit(1); }
try { require('./newsletter-system-test.js'); } catch (error) { console.error(error.message); process.exit(1); }
try { require('./cloudflare-error-hardening-test.js'); } catch (error) { console.error(error.message); process.exit(1); }
console.log('CLOUDFLARE WORKER ROUTES TEST PASSED');
console.log('Checked Worker alias map, Pages-origin static proxy, hard three-board Signal Board split, Cloudflare newsletter capture, Cloudflare error hardening, persistent FORUM_POSTS KV namespace, dynamic forum/newsletter routes, ElevenLabs intro voice endpoint, analytics endpoint, wrangler config, deploy-status aliases, and npm build wiring.');
