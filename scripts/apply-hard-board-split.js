const fs = require('fs');
const path = require('path');
const root = process.cwd();
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function write(name, text){ fs.writeFileSync(file(name), text); }
let changed = [];

function patchForumJs(){
  if (!exists('forum.js')) return;
  let s = read('forum.js');
  const before = s;
  s = s.replace(
    "  const boardRoot = document.querySelector('[data-board]') || document.body;\n  const BOARD = String((boardRoot && boardRoot.getAttribute('data-board')) || (form && form.getAttribute('data-board')) || 'main').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'main';",
    `  function boardFromPath(){\n    const p = String(location.pathname || '').toLowerCase();\n    if (p.includes('dark-speculation') || p.includes('speculation-board')) return 'speculation';\n    if (p.includes('epstein-alive') || p.includes('epstein-sighting')) return 'epstein-alive';\n    return 'main';\n  }\n  function cleanBoard(value){\n    const raw = String(value || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();\n    if (raw === 'speculation' || raw === 'darkspeculation' || raw === 'dark-speculation') return 'speculation';\n    if (raw === 'epsteinalive' || raw === 'epstein-alive' || raw === 'epsteinsighting' || raw === 'epstein-sighting') return 'epstein-alive';\n    if (raw === 'main') return 'main';\n    return '';\n  }\n  const boardRoot = document.querySelector('[data-board]') || document.body;\n  const BOARD = cleanBoard((boardRoot && boardRoot.getAttribute('data-board')) || (form && form.getAttribute('data-board')) || '') || boardFromPath();`
  );
  s = s.replace(
    "  const FEED_ROUTE = '/forum-feed?board=' + encodeURIComponent(BOARD);\n  const SUBMIT_ROUTE = '/submit-forum-post';\n  const REPORT_ROUTE = '/report-forum-post';",
    `  const FEED_ROUTES = { main: '/forum-feed-main', speculation: '/forum-feed-speculation', 'epstein-alive': '/forum-feed-epstein-alive' };\n  const SUBMIT_ROUTES = { main: '/submit-main-post', speculation: '/submit-speculation-post', 'epstein-alive': '/submit-epstein-alive-post' };\n  const REPORT_ROUTES = { main: '/report-main-post', speculation: '/report-speculation-post', 'epstein-alive': '/report-epstein-alive-post' };\n  const FEED_ROUTE = FEED_ROUTES[BOARD] || '/forum-feed-main';\n  const SUBMIT_ROUTE = SUBMIT_ROUTES[BOARD] || '/submit-main-post';\n  const REPORT_ROUTE = REPORT_ROUTES[BOARD] || '/report-main-post';`
  );
  s = s.replace(
    "  async function loadFeed(){\n    if (!feed) return;",
    `  function lockFormToBoard(){\n    if (!form) return;\n    form.setAttribute('data-board', BOARD);\n    let hidden = form.querySelector('input[name="board"]');\n    if (!hidden) {\n      hidden = document.createElement('input');\n      hidden.type = 'hidden';\n      hidden.name = 'board';\n      form.prepend(hidden);\n    }\n    hidden.value = BOARD;\n  }\n\n  async function loadFeed(){\n    if (!feed) return;\n    lockFormToBoard();`
  );
  s = s.replace(
    "  applyLock();\n  loadFeed();",
    "  lockFormToBoard();\n  applyLock();\n  loadFeed();"
  );
  if (s !== before) { write('forum.js', s); changed.push('forum.js'); }
}

function patchWorker(){
  if (!exists('src/worker.js')) return;
  let s = read('src/worker.js');
  const before = s;
  s = s.replace(
    "    routes: ['/forum-feed?board=main', '/forum-feed?board=speculation', '/forum-feed?board=epstein-alive', '/submit-forum-post', '/report-forum-post', '/track-event', '/intro-voice', '/downloads/forum-posts.json?board=main', '/downloads/forum-posts.json?board=speculation', '/downloads/forum-posts.json?board=epstein-alive'],",
    "    routes: ['/forum-feed-main', '/forum-feed-speculation', '/forum-feed-epstein-alive', '/submit-main-post', '/submit-speculation-post', '/submit-epstein-alive-post', '/report-main-post', '/report-speculation-post', '/report-epstein-alive-post', '/track-event', '/intro-voice', '/downloads/forum-posts.json?board=main', '/downloads/forum-posts.json?board=speculation', '/downloads/forum-posts.json?board=epstein-alive'],"
  );
  s = s.replace(
    "async function handleForumFeed(request, env) {\n  const url = new URL(request.url);\n  const board = cleanText(url.searchParams.get('board') || 'main', 80);",
    `function boardFromRoutePath(pathname, fallback = 'main') {\n  if (pathname === '/forum-feed-speculation' || pathname === '/submit-speculation-post' || pathname === '/report-speculation-post') return 'speculation';\n  if (pathname === '/forum-feed-epstein-alive' || pathname === '/submit-epstein-alive-post' || pathname === '/report-epstein-alive-post') return 'epstein-alive';\n  if (pathname === '/forum-feed-main' || pathname === '/submit-main-post' || pathname === '/report-main-post') return 'main';\n  return normalizeBoard(fallback);\n}\n\nasync function handleForumFeed(request, env, forcedBoard = '') {\n  const url = new URL(request.url);\n  const board = forcedBoard || cleanText(url.searchParams.get('board') || 'main', 80);`
  );
  s = s.replace(
    "async function handleSubmitForumPost(request, env) {\n  if (!env.FORUM_POSTS) return json({ ok: false, error: 'FORUM_POSTS KV binding missing' }, 503);\n  const body = await readBody(request);\n  if (body.website) return json({ ok: false, error: 'Spam trap triggered' }, 400);\n  const board = normalizeBoard(body.board || inferBoardFromPost(body));",
    "async function handleSubmitForumPost(request, env, forcedBoard = '') {\n  if (!env.FORUM_POSTS) return json({ ok: false, error: 'FORUM_POSTS KV binding missing' }, 503);\n  const body = await readBody(request);\n  if (body.website) return json({ ok: false, error: 'Spam trap triggered' }, 400);\n  const board = forcedBoard ? normalizeBoard(forcedBoard) : normalizeBoard(body.board || inferBoardFromPost(body));"
  );
  s = s.replace(
    "async function handleReportForumPost(request, env) {\n  if (!env.FORUM_POSTS) return json({ ok: false, error: 'FORUM_POSTS KV binding missing' }, 503);\n  const body = await readBody(request);\n  const board = normalizeBoard(body.board || 'main');",
    "async function handleReportForumPost(request, env, forcedBoard = '') {\n  if (!env.FORUM_POSTS) return json({ ok: false, error: 'FORUM_POSTS KV binding missing' }, 503);\n  const body = await readBody(request);\n  const board = forcedBoard ? normalizeBoard(forcedBoard) : normalizeBoard(body.board || 'main');"
  );
  s = s.replace(
    "    if (request.method === 'GET' && originalPath === '/forum-feed') return handleForumFeed(request, env);",
    "    if (request.method === 'GET' && originalPath === '/forum-feed') return handleForumFeed(request, env);\n    if (request.method === 'GET' && ['/forum-feed-main', '/forum-feed-speculation', '/forum-feed-epstein-alive'].includes(originalPath)) return handleForumFeed(request, env, boardFromRoutePath(originalPath));"
  );
  s = s.replace(
    "    if (request.method === 'POST' && originalPath === '/submit-forum-post') return handleSubmitForumPost(request, env);\n    if (request.method === 'POST' && originalPath === '/report-forum-post') return handleReportForumPost(request, env);",
    "    if (request.method === 'POST' && originalPath === '/submit-forum-post') return handleSubmitForumPost(request, env);\n    if (request.method === 'POST' && ['/submit-main-post', '/submit-speculation-post', '/submit-epstein-alive-post'].includes(originalPath)) return handleSubmitForumPost(request, env, boardFromRoutePath(originalPath));\n    if (request.method === 'POST' && originalPath === '/report-forum-post') return handleReportForumPost(request, env);\n    if (request.method === 'POST' && ['/report-main-post', '/report-speculation-post', '/report-epstein-alive-post'].includes(originalPath)) return handleReportForumPost(request, env, boardFromRoutePath(originalPath));"
  );
  if (s !== before) { write('src/worker.js', s); changed.push('src/worker.js'); }
}

function patchTests(){
  if (exists('scripts/forum-board-split-test.js')) {
    let s = read('scripts/forum-board-split-test.js');
    const before = s;
    for (const marker of [
      '/forum-feed-main', '/forum-feed-speculation', '/forum-feed-epstein-alive',
      '/submit-main-post', '/submit-speculation-post', '/submit-epstein-alive-post',
      'boardFromPath', 'lockFormToBoard'
    ]) {
      if (!s.includes(marker)) s = s.replace("needText('forum.js', 'payload.board = BOARD');", `needText('forum.js', 'payload.board = BOARD');\nneedText('forum.js', '${marker}');`);
    }
    if (s !== before) { write('scripts/forum-board-split-test.js', s); changed.push('scripts/forum-board-split-test.js'); }
  }
}

patchForumJs();
patchWorker();
patchTests();
console.log(`Hard board split applied: ${changed.length ? changed.join(', ') : 'already clean'}`);
