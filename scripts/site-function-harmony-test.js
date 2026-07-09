const fs = require('fs');
const path = require('path');

const root = process.cwd();
const hard = [];
const soft = [];
function p(file){ return path.join(root, file); }
function exists(file){ return fs.existsSync(p(file)); }
function read(file){ return fs.readFileSync(p(file), 'utf8'); }
function needFile(file){ if(!exists(file)) hard.push(`missing file: ${file}`); }
function needSoftFile(file){ if(!exists(file)) soft.push(`missing optional/legacy file: ${file}`); }
function needText(file, text, label = text){ if(exists(file) && !read(file).includes(text)) hard.push(`${file} missing ${label}`); }
function needSoftText(file, text, label = text){ if(exists(file) && !read(file).includes(text)) soft.push(`${file} missing ${label}`); }
function needAnyText(file, texts, label){ if(exists(file) && !texts.some(text => read(file).includes(text))) soft.push(`${file} missing ${label}`); }
function forbidSoftText(file, text, label = text){ if(exists(file) && read(file).includes(text)) soft.push(`${file} still contains ${label}`); }
function parseJson(file, required = true){
  try { return JSON.parse(read(file)); }
  catch(error){ (required ? hard : soft).push(`${file} invalid JSON: ${error.message}`); return null; }
}

const criticalFiles = [
  'index.html','search.html','search.js','search-index.json','books.html','live-intel.html','epstein-files.html','forum.html','download-center.html','deploy-status.html','deploy-status.json','deploy-health.html','deploy-health.json','matrix.js','styles.css','fixes.css','wrangler.toml','src/worker.js','scripts/build-free-ask-matrix-search.js','scripts/build-cloudflare-output.js','scripts/site-brain-health.js'
];
criticalFiles.forEach(needFile);

// Search / Ask Matrix: keep deploy-breaking search items hard.
needText('search.html', 'id="archive-search"', 'search input');
needText('search.html', 'id="search-results"', 'search results container');
needText('search.html', '<script src="search.js"></script>', 'search script include');
needText('search.js', '/search-index.json', 'absolute search index fetch');
needText('search.js', "cache:'no-store'", 'no-store search fetch');
needText('search.js', 'fallbackIndex', 'fallback index');
needText('search.js', 'HTML returned instead of JSON', 'HTML instead of JSON guard');
needSoftText('search.html', 'id="ask-answer"', 'answer status panel');
needSoftText('search.html', 'Showing the strongest entry points', 'initial search count copy');
forbidSoftText('search.js', '(b.keywords||[]).slice', 'legacy leaked keyword-slice pattern');
needSoftText('scripts/build-free-ask-matrix-search.js', 'fallbackIndex', 'generated fallback index');
needSoftText('scripts/free-ask-matrix-search-test.js', 'fallbackIndex', 'search test fallback guard');
needSoftText('scripts/repair-search-system.js', 'Showing the strongest entry points', 'search repair copy guard');

// Worker / Cloudflare routes: hard because these affect production routing and forum persistence.
for (const [file, text, label] of [
  ['src/worker.js','env.ASSETS.fetch','Cloudflare ASSETS fetch'],
  ['src/worker.js','routeAliases[originalPath]','original route alias lookup'],
  ['src/worker.js','routeAliases[normalizedPath]','normalized route alias lookup'],
  ['src/worker.js','/forum-health','forum health route'],
  ['src/worker.js','/forum-feed-main','main hard board route'],
  ['src/worker.js','/forum-feed-speculation','speculation hard board route'],
  ['src/worker.js','/forum-feed-epstein-alive','epstein alive hard board route'],
  ['src/worker.js','/downloads/forum-posts.json','forum JSON export'],
  ['src/worker.js','/downloads/forum-posts.md','forum Markdown export'],
  ['src/worker.js','/submit-main-post','main persistent submit endpoint'],
  ['src/worker.js','/submit-speculation-post','speculation persistent submit endpoint'],
  ['src/worker.js','/submit-epstein-alive-post','epstein alive persistent submit endpoint'],
  ['src/worker.js','/report-main-post','main persistent report endpoint'],
  ['src/worker.js','/report-speculation-post','speculation persistent report endpoint'],
  ['src/worker.js','/report-epstein-alive-post','epstein alive persistent report endpoint'],
  ['src/worker.js','Cloudflare KV FORUM_POSTS','KV persistence wording'],
  ['src/worker.js','persistent: true','persistent response marker'],
  ['src/worker.js','safeNotConfigured','safe missing binding response'],
  ['wrangler.toml','binding = "FORUM_POSTS"','FORUM_POSTS KV binding'],
  ['wrangler.toml','directory = "./_site"','Cloudflare asset output directory'],
  ['wrangler.toml','run_worker_first = true','Worker-first routing']
]) needText(file, text, label);
forbidSoftText('src/worker.js', 'matrixreprogrammed.pages.dev', 'stale Pages origin');
forbidSoftText('src/worker.js', 'PAGES_STATIC_ORIGIN', 'stale Pages origin constant');

// Forum pages/forms.
for (const file of ['forum.html','dark-speculation-forum.html','epstein-alive-board.html']) {
  if (exists(file)) {
    needText(file, 'forum.js', `${file} forum script`);
    needSoftText(file, 'data-board=', `${file} board marker`);
  } else {
    if (file === 'forum.html') hard.push(`missing file: ${file}`); else soft.push(`missing optional board page: ${file}`);
  }
}
if (exists('forum.js')) {
  for (const [text, label] of [
    ['/forum-feed-main','frontend main feed'],['/forum-feed-speculation','frontend speculation feed'],['/forum-feed-epstein-alive','frontend epstein feed'],['/submit-main-post','frontend main submit'],['/submit-speculation-post','frontend speculation submit'],['/submit-epstein-alive-post','frontend epstein alive submit'],['/report-main-post','frontend main report route'],['/report-speculation-post','frontend speculation report route'],['/report-epstein-alive-post','frontend epstein alive report route'],['persistent !== true','frontend refuses non-persistent save'],['Signal posted live and saved persistently','persistent success message'],["cache:'no-store'",'forum no-store fetches']
  ]) needText('forum.js', text, label);
  for (const [text, label] of [['saveLocalPosts','browser-only post persistence'],['syncPendingLocalPosts','local retry sync'],['localOnly','local-only marker'],['Not posted live yet. Saved only on this device','non-persistent save message']]) forbidSoftText('forum.js', text, label);
}

// Downloads / machine-readable resources.
for (const file of ['downloads/forum-posts.json','downloads/forum-posts.md','downloads/deploy-status.json','downloads/deploy-health.json','llms.txt','robots.txt','sitemap.xml']) needFile(file);
needSoftText('robots.txt', 'search-index.json', 'search index allowed in robots');
needSoftText('llms.txt', 'Ask Matrix Search', 'Ask Matrix route in llms');

const deployStatus = exists('deploy-status.json') ? parseJson('deploy-status.json') : null;
if (deployStatus) {
  if (!deployStatus.buildSha) hard.push('deploy-status.json missing buildSha');
  if (!deployStatus.workerScript) hard.push('deploy-status.json missing workerScript');
  if (!deployStatus.assetOutput) hard.push('deploy-status.json missing assetOutput');
}
const deployHealth = exists('deploy-health.json') ? parseJson('deploy-health.json') : null;
if (deployHealth) {
  if (!deployHealth.ok) hard.push('deploy-health.json ok should be true');
  if (!Array.isArray(deployHealth.routes) || !deployHealth.routes.includes('/forum-health')) hard.push('deploy-health.json missing /forum-health route');
}
const searchIndex = exists('search-index.json') ? parseJson('search-index.json') : null;
if (searchIndex) {
  if (!Array.isArray(searchIndex) || searchIndex.length < 20) hard.push('search-index.json should contain at least 20 routes');
  const requiredRoutes = ['search.html','books.html','live-intel.html','epstein-files.html','evidence-vault.html','download-center.html'];
  for (const route of requiredRoutes) if (!searchIndex.some(item => item && item.url === route)) hard.push(`search-index.json missing ${route}`);
  for (const item of searchIndex) {
    if (!item || !item.title || !item.url) hard.push('search-index.json contains item without title/url');
    if (item && /^https?:\/\//i.test(item.url || '')) hard.push(`search-index.json has external URL: ${item.url}`);
  }
}

if (exists('_site')) {
  for (const file of ['_site/index.html','_site/search.html','_site/search.js','_site/search-index.json','_site/forum.html','_site/deploy-status.html','_site/deploy-health.html']) needFile(file);
  for (const file of ['_site/index','_site/search','_site/forum','_site/deploy-status','_site/deploy-health']) needSoftFile(file);
  if (exists('_site/_redirects')) hard.push('_site/_redirects must not be deployed with Worker assets');
}

for (const file of ['index.html','search.html','books.html','live-intel.html','epstein-files.html','download-center.html']) {
  needAnyText(file, ['href="search.html"','/search','Ask Matrix','Search'], `${file} search discovery`);
  needAnyText(file, ['href="books.html"','/books','Books','Book Universe'], `${file} books discovery`);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
const report = { ok: hard.length === 0, generatedAt: new Date().toISOString(), hardIssues: hard, softIssues: soft, boundary: 'Site function harmony blocks true deploy breakers only: missing critical files, invalid core JSON, broken search/worker/forum routes, or malformed Cloudflare output. Copy/template drift is recorded as soft review.' };
fs.writeFileSync(path.join(root, 'downloads', 'site-function-harmony-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'site-function-harmony-report.md'), '# Site Function Harmony Report\n\nGenerated: '+report.generatedAt+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n## Hard Issues\n'+(hard.map(x=>'- '+x).join('\n')||'- None')+'\n\n## Soft Review\n'+(soft.map(x=>'- '+x).join('\n')||'- None')+'\n');

if (hard.length) {
  console.error('\nSITE FUNCTION HARMONY TEST FAILED\n');
  for (const issue of hard) console.error(`- ${issue}`);
  console.error(`\n${hard.length} hard issue(s) found. Soft review items are recorded in downloads/site-function-harmony-report.json.\n`);
  process.exit(1);
}
console.log('SITE FUNCTION HARMONY TEST PASSED');
console.log(`Checked deploy-critical search, Worker routes, Signal Boards, downloads, deploy health, JSON feeds and _site output. Soft review items: ${soft.length}.`);
