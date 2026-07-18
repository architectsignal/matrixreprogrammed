const fs = require('fs');
const path = require('path');

const root = process.cwd();
const hard = [];
const soft = [];
function p(file) { return path.join(root, file); }
function exists(file) { return fs.existsSync(p(file)); }
function read(file) { return exists(file) ? fs.readFileSync(p(file), 'utf8') : ''; }
function needFile(file) { if (!exists(file)) hard.push(`missing file: ${file}`); }
function needSoftFile(file) { if (!exists(file)) soft.push(`missing optional/legacy file: ${file}`); }
function needText(file, text, label = text) { if (!exists(file) || !read(file).includes(text)) hard.push(`${file} missing ${label}`); }
function needSoftText(file, text, label = text) { if (exists(file) && !read(file).includes(text)) soft.push(`${file} missing ${label}`); }
function needAnyText(file, texts, label) { if (!exists(file) || !texts.some(text => read(file).includes(text))) hard.push(`${file} missing ${label}`); }
function forbidText(file, text, label = text) { if (exists(file) && read(file).includes(text)) hard.push(`${file} contains forbidden ${label}`); }
function forbidSoftText(file, text, label = text) { if (exists(file) && read(file).includes(text)) soft.push(`${file} still contains ${label}`); }
function parseJson(file, required = true) {
  try { return JSON.parse(read(file)); }
  catch (error) { (required ? hard : soft).push(`${file} invalid JSON: ${error.message}`); return null; }
}

const criticalFiles = [
  'index.html', 'search.html', 'search.js', 'search-index.json', 'books.html', 'live-intel.html',
  'epstein-files.html', 'forum.html', 'forum.js', 'membership.html', 'paypal-membership.js',
  'member-dashboard.html', 'member-dashboard-app.js', 'billing-dashboard.html', 'billing-dashboard.js',
  'admin-payment-dashboard.html', 'admin-payment-dashboard.js', 'download-center.html',
  'deploy-status.html', 'deploy-status.json', 'matrix.js', 'styles.css', 'fixes.css',
  'wrangler.toml', 'wrangler.jsonc', 'src/worker.js', 'src/worker-forum-persistence.js',
  'src/worker-member-experience.js', 'src/worker-paypal-subscriptions.js', 'src/worker-production.js',
  'migrations/phase9_signal_board_persistence.sql',
  'scripts/build-free-ask-matrix-search.js', 'scripts/build-cloudflare-output.js',
  'scripts/build-production-health.js', 'scripts/final-production-reconcile.js',
  'scripts/repair-generated-site-artifacts.js'
];
criticalFiles.forEach(needFile);

needText('search.html', 'id="archive-search"', 'search input');
needText('search.html', 'id="search-results"', 'search results container');
needText('search.html', '<script src="search.js"></script>', 'search script include');
needText('search.js', '/search-index.json', 'absolute search index fetch');
needText('search.js', "cache:'no-store'", 'no-store search fetch');
needText('search.js', 'fallbackIndex', 'fallback index');
needText('search.js', 'HTML returned instead of JSON', 'HTML instead of JSON guard');
needSoftText('search.html', 'id="ask-answer"', 'answer status panel');
forbidSoftText('search.js', '(b.keywords||[]).slice', 'legacy leaked keyword-slice pattern');

for (const [file, text, label] of [
  ['src/worker-production.js', "import forumWorker from './worker-forum-persistence.js'", 'strict forum delegation'],
  ['src/worker-production.js', "import memberWorker, { isMemberExperienceRoute } from './worker-member-experience.js'", 'strict member delegation'],
  ['src/worker-production.js', "import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js'", 'strict PayPal delegation'],
  ['src/worker-production.js', 'members-db-binding-unavailable', 'missing D1 fail-closed response'],
  ['src/worker-production.js', 'non-authoritative-forum-response-blocked', 'legacy forum response rejection'],
  ['src/worker-production.js', 'non-authoritative-paypal-response-blocked', 'unverified PayPal response rejection'],
  ['src/worker-production.js', "origin !== 'cloudflare-worker-forum-d1'", 'forum authoritative origin check'],
  ['src/worker-production.js', "origin !== 'cloudflare-worker-paypal-subscriptions'", 'PayPal authoritative origin check'],
  ['src/worker-forum-persistence.js', "import legacyWorker from './worker.js'", 'application Worker delegation'],
  ['src/worker-forum-persistence.js', '/forum-health', 'D1 forum health route'],
  ['src/worker-forum-persistence.js', 'INSERT OR IGNORE INTO forum_posts', 'authoritative D1 post insert'],
  ['src/worker-forum-persistence.js', 'Cloudflare D1 MEMBERS_DB.forum_posts', 'D1 persistence wording'],
  ['src/worker-forum-persistence.js', 'forum_post_owners', 'D1 post ownership ledger'],
  ['src/worker-forum-persistence.js', 'forum_report_owners', 'D1 report ownership ledger'],
  ['src/worker-forum-persistence.js', 'compatibilityMirror:false', 'D1-only compatibility boundary'],
  ['src/worker-forum-persistence.js', 'no browser or legacy fallback was accepted', 'D1 fail-closed persistence boundary'],
  ['src/worker-paypal-subscriptions.js', '/api/paypal/checkout-intent', 'PayPal checkout intent'],
  ['src/worker-paypal-subscriptions.js', '/api/paypal/webhook', 'verified PayPal webhook'],
  ['src/worker-paypal-subscriptions.js', 'PAYPAL_SANDBOX_ENABLED', 'sandbox environment switch'],
  ['src/worker-paypal-subscriptions.js', 'PAYPAL_PRODUCTION_ENABLED', 'production environment switch'],
  ['src/worker-paypal-subscriptions.js', 'paypal_runtime_settings', 'D1 checkout switch'],
  ['src/worker.js', 'env.ASSETS.fetch', 'Cloudflare ASSETS fetch'],
  ['wrangler.toml', 'main = "src/worker-production.js"', 'strict production entrypoint'],
  ['wrangler.toml', 'binding = "MEMBERS_DB"', 'MEMBERS_DB D1 binding'],
  ['wrangler.toml', 'directory = "./_site"', 'Cloudflare asset output directory'],
  ['wrangler.toml', 'run_worker_first = true', 'Worker-first routing']
]) needText(file, text, label);
for (const marker of ['FORUM_POSTS.get(', 'FORUM_POSTS.list(', 'FORUM_POSTS.put(', 'kvMirrorEnabled(']) forbidText('src/worker-forum-persistence.js', marker, `deleted forum KV path ${marker}`);
for (const marker of ['forum_post_owners','forum_report_owners','forum_board_state','forum_persistence_health']) needText('migrations/phase9_signal_board_persistence.sql', marker, `Signal Board migration ${marker}`);
forbidSoftText('src/worker.js', 'matrixreprogrammed.pages.dev', 'stale Pages origin');
forbidSoftText('src/worker.js', 'PAGES_STATIC_ORIGIN', 'stale Pages origin constant');

for (const file of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {
  if (exists(file)) {
    needText(file, 'forum.js', `${file} forum script`);
    needSoftText(file, 'data-board=', `${file} board marker`);
    needAnyText(file, ['free to read','Reading is public'], `${file} public reading boundary`);
    needText(file, 'Cloudflare D1', `${file} D1 persistence wording`);
  } else if (file === 'forum.html') hard.push(`missing file: ${file}`);
  else soft.push(`missing optional board page: ${file}`);
}
for (const [text, label] of [
  ['/forum-feed-main', 'frontend main feed'], ['/forum-feed-speculation', 'frontend speculation feed'],
  ['/forum-feed-epstein-alive', 'frontend Epstein feed'], ['/submit-main-post', 'frontend main submit'],
  ['/submit-speculation-post', 'frontend speculation submit'], ['/submit-epstein-alive-post', 'frontend Epstein submit'],
  ['/report-main-post', 'frontend main report route'], ['data.persistent!==true', 'frontend refuses non-persistent save'],
  ['Signal posted live and saved persistently', 'persistent success message'], ['mergePosts(', 'confirmed post preservation'],
  ['loadFeed([livePost])', 'post-confirmation feed merge'], ["cache:'no-store'", 'forum no-store fetches']
]) needText('forum.js', text, label);
for (const [text, label] of [
  ['saveLocalPosts', 'browser-only post persistence'], ['syncPendingLocalPosts', 'local retry sync'],
  ['localOnly', 'local-only marker'], ['Not posted live yet. Saved only on this device', 'non-persistent save message'],
  ['localStorage', 'browser-only unlock storage'], ['matrix_signal_pass_unlocked', 'device-only Signal Pass']
]) forbidText('forum.js', text, label);

for (const file of ['membership.html', '_site/membership.html']) {
  for (const marker of ['Free Member', '€0', '€3', '€6', '€9', 'paypal-membership.js', 'paypal-membership-status', 'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.']) needText(file, marker, `server-gated membership marker ${marker}`);
  forbidText(file, 'Coming soon — no payment taken', 'obsolete deferred membership page');
  forbidText(file, '€19/month', 'legacy €19 tier');
  forbidText(file, '€49/month', 'legacy €49 tier');
}
for (const file of ['paypal-membership.js', '_site/paypal-membership.js']) {
  needText(file, '/api/paypal/checkout-intent', 'PayPal checkout intent runtime');
  needText(file, '/api/paypal/subscription/confirm', 'PayPal confirmation runtime');
}
needText('billing-dashboard.html', 'billing-dashboard.js', 'member billing dashboard');
needText('admin-payment-dashboard.html', 'admin-payment-dashboard.js', 'admin payment dashboard');

for (const file of ['downloads/forum-posts.json', 'downloads/forum-posts.md', 'downloads/deploy-status.json', 'llms.txt', 'robots.txt', 'sitemap.xml']) needFile(file);
needSoftText('robots.txt', 'search-index.json', 'search index allowed in robots');
needSoftText('llms.txt', 'Ask Matrix Search', 'Ask Matrix route in llms');

const deployStatus = exists('deploy-status.json') ? parseJson('deploy-status.json') : null;
if (deployStatus) {
  if (!deployStatus.buildSha) hard.push('deploy-status.json missing buildSha');
  if (!deployStatus.workerScript) hard.push('deploy-status.json missing workerScript');
  if (!deployStatus.assetOutput) hard.push('deploy-status.json missing assetOutput');
}
needText('scripts/repair-generated-site-artifacts.js', "productionHealthOwner: 'scripts/build-production-health.js'", 'canonical health ownership');
forbidText('scripts/repair-generated-site-artifacts.js', "write('deploy-health.json'", 'legacy production-health write');
needText('scripts/final-production-reconcile.js', 'build-production-health.js', 'final production health generation');
needText('scripts/build-production-health.js', "workerScript: 'src/worker-production.js'", 'strict Worker health identity');
needText('scripts/build-production-health.js', "paymentStatus: 'sandbox-ready-disabled'", 'server-gated payment health status');

const searchIndex = exists('search-index.json') ? parseJson('search-index.json') : null;
if (searchIndex) {
  if (!Array.isArray(searchIndex) || searchIndex.length < 20) hard.push('search-index.json should contain at least 20 routes');
  const requiredRoutes = ['search.html', 'books.html', 'live-intel.html', 'epstein-files.html', 'evidence-vault.html', 'download-center.html'];
  for (const route of requiredRoutes) if (!searchIndex.some(item => item && item.url === route)) hard.push(`search-index.json missing ${route}`);
  for (const item of searchIndex) {
    if (!item || !item.title || !item.url) hard.push('search-index.json contains item without title/url');
    if (item && /^https?:\/\//i.test(item.url || '')) hard.push(`search-index.json has external URL: ${item.url}`);
  }
}

if (exists('_site')) {
  for (const file of ['_site/index.html', '_site/search.html', '_site/search.js', '_site/search-index.json', '_site/forum.html', '_site/membership.html', '_site/paypal-membership.js', '_site/billing-dashboard.html', '_site/admin-payment-dashboard.html']) needFile(file);
  for (const file of ['_site/index', '_site/search', '_site/forum', '_site/membership']) needSoftFile(file);
  if (exists('_site/_redirects')) hard.push('_site/_redirects must not be deployed with Worker assets');
}

for (const file of ['index.html', 'search.html', 'books.html', 'live-intel.html', 'epstein-files.html', 'download-center.html']) {
  needAnyText(file, ['href="search.html"', '/search', 'Ask Matrix', 'Search'], `${file} search discovery`);
  needAnyText(file, ['href="books.html"', '/books', 'Books', 'Book Universe'], `${file} books discovery`);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
const report = {
  ok: hard.length === 0,
  generatedAt: new Date().toISOString(),
  hardIssues: hard,
  softIssues: soft,
  workerStack: 'strict production boundary -> email/member/PayPal workers -> D1-only Signal Board -> static application',
  forumStorage: 'Cloudflare D1 authoritative and cross-device; browser and Workers KV fallbacks forbidden.',
  paymentStatus: 'PayPal sandbox-ready behind runtime, plan, consent, commercial legal and D1 activation gates; live checkout disabled by default.',
  productionHealthOwner: 'scripts/build-production-health.js via final-production-reconcile.js',
  boundary: 'Site harmony blocks broken search/assets, non-D1 forum persistence, malformed output, unverified PayPal responses or unguarded checkout activation.'
};
fs.writeFileSync(path.join(root, 'downloads', 'site-function-harmony-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'site-function-harmony-report.md'), `# Site Function Harmony Report\n\nGenerated: ${report.generatedAt}\nResult: ${report.ok ? 'PASS' : 'FAIL'}\nWorker stack: ${report.workerStack}\nForum: ${report.forumStorage}\nPayments: ${report.paymentStatus}\n\n## Hard Issues\n${hard.map(item => `- ${item}`).join('\n') || '- None'}\n\n## Soft Review\n${soft.map(item => `- ${item}`).join('\n') || '- None'}\n`);

if (hard.length) {
  console.error('\nSITE FUNCTION HARMONY TEST FAILED\n');
  for (const issue of hard) console.error(`- ${issue}`);
  console.error(`\n${hard.length} hard issue(s) found. Soft review items are recorded in downloads/site-function-harmony-report.json.\n`);
  process.exit(1);
}
console.log('SITE FUNCTION HARMONY TEST PASSED');
console.log(`Checked search, strict Worker routing, D1-only Signal Board, server-gated PayPal, downloads and Cloudflare output. Soft review items: ${soft.length}.`);
