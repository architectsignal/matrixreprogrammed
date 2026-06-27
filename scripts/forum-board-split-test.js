const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function needFile(name){ if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text){ if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function forbidText(name, text){ if (exists(name) && read(name).includes(text)) issues.push(`${name} should not contain ${text}`); }
for (const file of ['forum.html','dark-speculation-forum.html','epstein-alive-board.html','forum.js','src/worker.js','data/forum-board-split.json','scripts/build-board-split.js']) needFile(file);
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
needText('forum.js', '/forum-feed?board=');
needText('forum.js', 'payload.board = BOARD');
needText('forum.js', 'matrix_signal_board_posts_v2_');
needText('src/worker.js', 'boardLabels');
needText('src/worker.js', 'normalizeBoard');
needText('src/worker.js', 'inferBoardFromPost');
needText('src/worker.js', 'filterPostsByBoard');
needText('src/worker.js', 'boardAware: true');
needText('src/worker.js', '/forum-feed?board=main');
needText('src/worker.js', '/forum-feed?board=speculation');
needText('src/worker.js', '/forum-feed?board=epstein-alive');
needText('src/worker.js', "'/speculation-board': '/dark-speculation-forum.html'");
needText('src/worker.js', "'/epstein-alive-board': '/epstein-alive-board.html'");
needText('search-index.json', 'epstein-alive-board.html');
needText('sitemap.xml', 'epstein-alive-board.html');
needText('llms.txt', '/forum-feed?board=epstein-alive');
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
console.log('Checked three board pages, board-aware frontend, board-aware Worker feed/storage, aliases, sitemap, llms, and search index.');
