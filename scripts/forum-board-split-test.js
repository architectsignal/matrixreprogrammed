const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function needFile(name){ if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text){ if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function forbidText(name, text){ if (exists(name) && read(name).includes(text)) issues.push(`${name} should not contain ${text}`); }

// Keep this test resilient against stale generated llms/search/sitemap output.
try { require('./build-board-split.js'); } catch (error) { issues.push(`board split builder failed: ${error.message}`); }
try { require('./apply-hard-board-split.js'); } catch (error) { issues.push(`hard board split patch failed: ${error.message}`); }

const hardFeeds = ['/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive'];
const hardSubmits = ['/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post'];
const hardReports = ['/report-main-post','/report-speculation-post','/report-epstein-alive-post'];
const publicFiles = ['forum.js','forum.html','dark-speculation-forum.html','epstein-alive-board.html','data/forum-seed.json'];
const bannedPublicCopy = [
  'Local fallback',
  'backend unavailable',
  'Backend detail',
  'FORUM_POSTS KV binding missing',
  'FORUM_POSTS KV binding',
  'Worker routes',
  'Cloudflare Static Forum Mode',
  'Cloudflare static mode',
  'saved on this device',
  'Open /forum-health',
  'Cloudflare test route',
  '/forum-feed and /submit-forum-post'
];

for (const file of ['forum.html','dark-speculation-forum.html','epstein-alive-board.html','forum.js','src/worker.js','data/forum-board-split.json','scripts/build-board-split.js','scripts/apply-hard-board-split.js']) needFile(file);
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
needText('forum.js', 'const BOARD');
needText('forum.js', 'boardFromPath');
needText('forum.js', 'lockFormToBoard');
needText('forum.js', 'payload.board = BOARD');
needText('forum.js', 'matrix_signal_board_posts_v2_');
needText('forum.js', 'pending sync');
needText('forum.js', 'Signal Board is syncing');
for (const route of [...hardFeeds, ...hardSubmits, ...hardReports]) needText('forum.js', route);
needText('src/worker.js', 'boardLabels');
needText('src/worker.js', 'normalizeBoard');
needText('src/worker.js', 'inferBoardFromPost');
needText('src/worker.js', 'filterPostsByBoard');
needText('src/worker.js', 'boardAware: true');
needText('src/worker.js', 'boardFromRoutePath');
for (const route of [...hardFeeds, ...hardSubmits, ...hardReports]) needText('src/worker.js', route);
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
console.log('Checked three board pages, hard board frontend routes, hard Worker feed/storage endpoints, aliases, sitemap, llms, search index, and no internal fallback copy in public board UI.');
