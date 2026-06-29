const fs = require('fs');
const path = require('path');

const root = process.cwd();
const issues = [];
function p(file){ return path.join(root, file); }
function exists(file){ return fs.existsSync(p(file)); }
function read(file){ return fs.readFileSync(p(file), 'utf8'); }
function needFile(file){ if(!exists(file)) issues.push(`missing file: ${file}`); }
function needText(file, text, label = text){ if(exists(file) && !read(file).includes(text)) issues.push(`${file} missing ${label}`); }
function needAnyText(file, texts, label){ if(exists(file) && !texts.some(text => read(file).includes(text))) issues.push(`${file} missing ${label}`); }
function forbidText(file, text, label = text){ if(exists(file) && read(file).includes(text)) issues.push(`${file} should not contain ${label}`); }
function parseJson(file){ try { return JSON.parse(read(file)); } catch(error){ issues.push(`${file} invalid JSON: ${error.message}`); return null; } }

const criticalFiles = [
  'index.html','search.html','search.js','search-index.json','books.html','live-intel.html','epstein-files.html','forum.html','dark-speculation-forum.html','epstein-alive-board.html','download-center.html','deploy-status.html','deploy-status.json','deploy-health.html','deploy-health.json','analytics.js','matrix.js','styles.css','fixes.css','wrangler.toml','src/worker.js','scripts/build-free-ask-matrix-search.js','scripts/build-cloudflare-output.js','scripts/site-brain-health.js'
];
criticalFiles.forEach(needFile);

// Search / Ask Matrix
needText('search.html', 'id="archive-search"', 'search input');
needText('search.html', 'id="search-results"', 'search results container');
needText('search.html', 'id="ask-answer"', 'answer status panel');
needText('search.html', '<script src="search.js"></script>', 'search script include');
needText('search.html', 'Showing the strongest entry points', 'initial search count copy');
needText('search.js', '/search-index.json', 'absolute search index fetch');
needText('search.js', "cache:'no-store'", 'no-store search fetch');
needText('search.js', 'fallbackIndex', 'fallback index');
needText('search.js', 'failSafe', 'search failsafe');
needText('search.js', 'HTML returned instead of JSON', 'HTML instead of JSON guard');
forbidText('search.js', '(b.keywords||[]).slice', 'legacy leaked keyword-slice pattern');
needText('scripts/build-free-ask-matrix-search.js', 'fallbackIndex', 'generated fallback index');
needText('scripts/free-ask-matrix-search-test.js', 'fallbackIndex', 'search test fallback guard');
needText('scripts/repair-search-system.js', 'Showing the strongest entry points', 'search repair copy guard');

// Worker / Cloudflare routes
needText('src/worker.js', 'env.ASSETS.fetch', 'Cloudflare ASSETS fetch');
needText('src/worker.js', 'routeAliases[originalPath]', 'original route alias lookup');
needText('src/worker.js', 'routeAliases[normalizedPath]', 'normalized route alias lookup');
needText('src/worker.js', '/forum-health', 'forum health route');
needText('src/worker.js', '/forum-feed-main', 'main hard board route');
needText('src/worker.js', '/forum-feed-speculation', 'speculation hard board route');
needText('src/worker.js', '/forum-feed-epstein-alive', 'epstein alive hard board route');
needText('src/worker.js', '/downloads/forum-posts.json', 'forum JSON export');
needText('src/worker.js', '/downloads/forum-posts.md', 'forum Markdown export');
needText('src/worker.js', '/submit-main-post', 'main persistent submit endpoint');
needText('src/worker.js', '/submit-speculation-post', 'speculation persistent submit endpoint');
needText('src/worker.js', '/submit-epstein-alive-post', 'epstein alive persistent submit endpoint');
needText('src/worker.js', '/report-main-post', 'main persistent report endpoint');
needText('src/worker.js', '/report-speculation-post', 'speculation persistent report endpoint');
needText('src/worker.js', '/report-epstein-alive-post', 'epstein alive persistent report endpoint');
needText('src/worker.js', 'Cloudflare KV FORUM_POSTS', 'KV persistence wording');
needText('src/worker.js', 'persistent: true', 'persistent response marker');
needText('src/worker.js', 'safeNotConfigured', 'safe missing binding response');
needText('src/worker.js', 'isHostileProbePath', 'hostile probe guard');
needText('src/worker.js', 'Worker handled failure safely', 'safe catch response');
forbidText('src/worker.js', 'matrixreprogrammed.pages.dev', 'stale Pages origin');
forbidText('src/worker.js', 'PAGES_STATIC_ORIGIN', 'stale Pages origin constant');

// Forum pages/forms
for (const file of ['forum.html','dark-speculation-forum.html','epstein-alive-board.html']) {
  needText(file, 'forum.js', `${file} forum script`);
  needText(file, 'data-board=', `${file} board marker`);
}
if (exists('forum.js')) {
  needText('forum.js', '/forum-feed-main', 'frontend main feed');
  needText('forum.js', '/forum-feed-speculation', 'frontend speculation feed');
  needText('forum.js', '/forum-feed-epstein-alive', 'frontend epstein feed');
  needText('forum.js', '/submit-main-post', 'frontend main submit');
  needText('forum.js', '/submit-speculation-post', 'frontend speculation submit');
  needText('forum.js', '/submit-epstein-alive-post', 'frontend epstein alive submit');
  needText('forum.js', '/report-main-post', 'frontend main report route');
  needText('forum.js', '/report-speculation-post', 'frontend speculation report route');
  needText('forum.js', '/report-epstein-alive-post', 'frontend epstein alive report route');
  needText('forum.js', 'postLive', 'frontend live post helper');
  needText('forum.js', 'persistent !== true', 'frontend refuses non-persistent save');
  needText('forum.js', 'Posts are not saved in this browser', 'no browser-only save warning');
  needText('forum.js', 'Signal posted live and saved persistently', 'persistent success message');
  needText('forum.js', "cache:'no-store'", 'forum no-store fetches');
  forbidText('forum.js', 'saveLocalPosts', 'browser-only post persistence');
  forbidText('forum.js', 'syncPendingLocalPosts', 'local retry sync');
  forbidText('forum.js', 'localOnly', 'local-only marker');
  forbidText('forum.js', 'Not posted live yet. Saved only on this device', 'non-persistent save message');
  forbidText('forum.js', 'Signal received. It may take a moment to appear on the live board.', 'misleading local-only post success');
}

// Downloads / machine-readable resources
for (const file of ['downloads/forum-posts.json','downloads/forum-posts.md','downloads/deploy-status.json','downloads/deploy-health.json','llms.txt','robots.txt','sitemap.xml']) needFile(file);
needText('robots.txt', 'search-index.json', 'search index allowed in robots');
needText('llms.txt', 'Ask Matrix Search', 'Ask Matrix route in llms');

// Health and deploy reports
const deployStatus = exists('deploy-status.json') ? parseJson('deploy-status.json') : null;
if (deployStatus) {
  if (!deployStatus.buildSha) issues.push('deploy-status.json missing buildSha');
  if (!deployStatus.workerScript) issues.push('deploy-status.json missing workerScript');
  if (!deployStatus.assetOutput) issues.push('deploy-status.json missing assetOutput');
}
const deployHealth = exists('deploy-health.json') ? parseJson('deploy-health.json') : null;
if (deployHealth) {
  if (!deployHealth.ok) issues.push('deploy-health.json ok should be true');
  if (!Array.isArray(deployHealth.routes) || !deployHealth.routes.includes('/forum-health')) issues.push('deploy-health.json missing /forum-health route');
}

// Search index validity
const searchIndex = exists('search-index.json') ? parseJson('search-index.json') : null;
if (searchIndex) {
  if (!Array.isArray(searchIndex) || searchIndex.length < 20) issues.push('search-index.json should contain at least 20 routes');
  const requiredRoutes = ['search.html','books.html','live-intel.html','epstein-files.html','evidence-vault.html','download-center.html','trust-center.html','authority-hub.html'];
  for (const route of requiredRoutes) if (!searchIndex.some(item => item && item.url === route)) issues.push(`search-index.json missing ${route}`);
  for (const item of searchIndex) {
    if (!item || !item.title || !item.url) issues.push('search-index.json contains item without title/url');
    if (item && /^https?:\/\//i.test(item.url || '')) issues.push(`search-index.json has external URL: ${item.url}`);
  }
}

// _site deploy output, when generated
if (exists('_site')) {
  for (const file of ['_site/index.html','_site/index','_site/search.html','_site/search','_site/search.js','_site/search-index.json','_site/forum.html','_site/forum','_site/deploy-status.html','_site/deploy-status','_site/deploy-health.html','_site/deploy-health']) needFile(file);
  if (exists('_site/_redirects')) issues.push('_site/_redirects must not be deployed with Worker assets');
}

// Public navigation sanity: require at least one discoverable path into Search and Books.
for (const file of ['index.html','search.html','books.html','live-intel.html','epstein-files.html','download-center.html']) {
  needAnyText(file, ['href="search.html"','/search','Ask Matrix','Search'], `${file} search discovery`);
  needAnyText(file, ['href="books.html"','/books','Books','Book Universe'], `${file} books discovery`);
}

if (issues.length) {
  console.error('\nSITE FUNCTION HARMONY TEST FAILED\n');
  for (const issue of issues) console.error(`- ${issue}`);
  console.error(`\n${issues.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('SITE FUNCTION HARMONY TEST PASSED');
console.log('Checked Ask Matrix search, Worker routes, three persistent Signal Boards, Cloudflare KV-only posting, downloads, deploy health, JSON feeds, _site output, critical scripts, and navigation harmony.');
