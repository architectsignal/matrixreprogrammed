const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function needFile(name){ if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text){ if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function forbidText(name, text){ if (exists(name) && read(name).includes(text)) issues.push(`${name} should not contain ${text}`); }

try { require('./build-board-split.js'); } catch (error) { issues.push(`board split builder failed: ${error.message}`); }
try { require('./apply-hard-board-split.js'); } catch (error) { issues.push(`hard board D1 persistence guard failed: ${error.message}`); }

const hardFeeds = ['/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive'];
const hardSubmits = ['/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post'];
const hardReports = ['/report-main-post','/report-speculation-post','/report-epstein-alive-post'];
const allRoutes = [...hardFeeds, ...hardSubmits, ...hardReports];
const publicFiles = ['forum.js','forum.html','dark-speculation-forum.html','epstein-alive-board.html'];
const bannedPublicCopy = [
  'Local fallback',
  'saved on this device',
  'pending sync',
  'Signal Board is syncing',
  'Signal received. It may take a moment to appear on the live board.',
  'Not posted live yet. Saved only on this device',
  'matrix_signal_board_posts_v2_',
  'saveLocalPosts',
  'syncPendingLocalPosts',
  'localOnly',
  'Cloudflare KV'
];

for (const file of [
  'forum.html','dark-speculation-forum.html','epstein-alive-board.html','forum.js',
  'src/worker.js','src/worker-production.js','src/worker-forum-persistence.js',
  'migrations/0004_forum_persistence.sql','data/forum-board-split.json',
  'scripts/build-board-split.js','scripts/apply-hard-board-split.js'
]) needFile(file);

needText('forum.html', 'data-board="main"');
needText('dark-speculation-forum.html', 'data-board="speculation"');
needText('epstein-alive-board.html', 'data-board="epstein-alive"');
needText('forum.html', 'name="board" value="main"');
needText('dark-speculation-forum.html', 'name="board" value="speculation"');
needText('epstein-alive-board.html', 'name="board" value="epstein-alive"');
needText('forum.html', 'dark-speculation-forum.html');
needText('forum.html', 'epstein-alive-board.html');
needText('dark-speculation-forum.html', 'signal-board-feed');
needText('epstein-alive-board.html', 'signal-board-feed');

for (const marker of [
  'const BOARD',
  'boardFromPath',
  'lockFormToBoard',
  'payload.board = BOARD',
  'persistent !== true',
  'Posts are not saved in this browser',
  'only persistent Cloudflare D1 posts',
  'Cloudflare D1 persistent forum feed unavailable',
  'Signal posted live and saved persistently'
]) needText('forum.js', marker);
for (const route of allRoutes) needText('forum.js', route);

for (const marker of [
  "import forumWorker from './worker-forum-persistence.js'",
  'members-db-binding-unavailable',
  'non-authoritative-forum-response-blocked',
  "origin !== 'cloudflare-worker-forum-d1'",
  'FORUM_POSTS: undefined'
]) needText('src/worker-production.js', marker);

for (const marker of [
  "import legacyWorker from './worker.js'",
  "'X-Matrix-Origin': 'cloudflare-worker-forum-d1'",
  'MEMBERS_DB D1 binding is unavailable',
  'CREATE TABLE IF NOT EXISTS forum_posts',
  'CREATE TABLE IF NOT EXISTS forum_reports',
  'storage_origin TEXT NOT NULL DEFAULT \'d1\''
]) needText('src/worker-forum-persistence.js', marker);
for (const route of allRoutes) needText('src/worker-forum-persistence.js', route);

for (const marker of [
  'CREATE TABLE IF NOT EXISTS forum_posts',
  'CREATE TABLE IF NOT EXISTS forum_reports',
  'idx_forum_posts_board_created'
]) needText('migrations/0004_forum_persistence.sql', marker);

needText('src/worker.js', 'boardLabels');
needText('src/worker.js', 'normalizeBoard');
needText('src/worker.js', 'inferBoardFromPost');
needText('src/worker.js', 'filterPostsByBoard');
needText('src/worker.js', 'boardAware: true');
needText('src/worker.js', 'hardBoardRouteMap');
for (const route of allRoutes) needText('src/worker.js', route);
needText('src/worker.js', "'/speculation-board': '/dark-speculation-forum.html'");
needText('src/worker.js', "'/epstein-alive-board': '/epstein-alive-board.html'");

needText('search-index.json', 'epstein-alive-board.html');
needText('sitemap.xml', 'epstein-alive-board.html');
needText('llms.txt', '/forum-feed-epstein-alive');
for (const file of publicFiles) for (const phrase of bannedPublicCopy) forbidText(file, phrase);
forbidText('forum.html', 'data-board="speculation"');
forbidText('forum.html', 'data-board="epstein-alive"');

if (exists('data/forum-board-split.json')) {
  const data = JSON.parse(read('data/forum-board-split.json'));
  if (!Array.isArray(data.boards) || data.boards.length !== 3) issues.push('data/forum-board-split.json must declare exactly three boards');
  for (const board of ['main','speculation','epstein-alive']) if (!data.boards.some(b => b.id === board)) issues.push(`data/forum-board-split.json missing ${board}`);
}

if (issues.length) {
  console.error('FORUM BOARD SPLIT TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('FORUM BOARD SPLIT TEST PASSED');
console.log('Checked three board pages, hard frontend routes, strict Worker delegation, authoritative D1 persistence, schema migration, aliases, sitemap, llms and search index with no browser-local posting fallback.');
