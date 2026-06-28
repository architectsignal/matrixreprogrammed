const fs = require('fs');
const path = require('path');
const root = process.cwd();
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function write(name, text){ fs.writeFileSync(file(name), text); }
let changed = [];

function enforcePublicForumCopy(s){
  s = s.replace(/const local = post\.localOnly \? ' <span class="pill">saved on this device<\/span>' : '';/g, "const local = post.localOnly ? ' <span class=\"pill\">pending sync</span>' : '';");
  s = s.replace(/function fallbackNotice\(\)\{[\s\S]*?\n  \}/, `function fallbackNotice(){
    return '<article class="card redline"><span class="label">Signal Board</span><h3>' + esc(BOARD_LABEL) + ' is syncing</h3><p>Fresh signals may take a moment to appear. You can keep reading the board or submit a source drop; it will be held safely while the live feed refreshes.</p></article>';
  }`);
  s = s.replace(/if \(!res\.ok \|\| data\.ok === false\) throw new Error\([^\n]+\);/g, "if (!res.ok || data.ok === false) throw new Error('feed unavailable');");
  s = s.replace(/lastBackendError/g, 'lastSystemError');
  s = s.replace(/backendErrorLabel/g, 'systemErrorLabel');
  s = s.replace(/Feed route failed/g, 'Feed refresh delayed');
  s = s.replace(/Report route unavailable; report saved on this device/g, 'Report received');
  s = s.replace(/Signal saved on this device\. Open \/forum-health to check whether the latest Worker and FORUM_POSTS binding are live\./g, 'Signal received. It may take a moment to appear on the live board.');
  s = s.replace(/const HEALTH_ROUTE = '\/forum-health';\n/g, '');
  return s;
}

function patchForumJs(){
  if (!exists('forum.js')) return;
  let s = read('forum.js');
  const before = s;
  s = s.replace(
    "  const boardRoot = document.querySelector('[data-board]') || document.body;\n  const BOARD = String((boardRoot && boardRoot.getAttribute('data-board')) || (form && form.getAttribute('data-board')) || 'main').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'main';",
    `  function boardFromPath(){
    const p = String(location.pathname || '').toLowerCase();
    if (p.includes('dark-speculation') || p.includes('speculation-board')) return 'speculation';
    if (p.includes('epstein-alive') || p.includes('epstein-sighting')) return 'epstein-alive';
    return 'main';
  }
  function cleanBoard(value){
    const raw = String(value || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    if (raw === 'speculation' || raw === 'darkspeculation' || raw === 'dark-speculation') return 'speculation';
    if (raw === 'epsteinalive' || raw === 'epstein-alive' || raw === 'epsteinsighting' || raw === 'epstein-sighting') return 'epstein-alive';
    if (raw === 'main') return 'main';
    return '';
  }
  const boardRoot = document.querySelector('[data-board]') || document.body;
  const BOARD = cleanBoard((boardRoot && boardRoot.getAttribute('data-board')) || (form && form.getAttribute('data-board')) || '') || boardFromPath();`
  );
  s = s.replace(
    "  const FEED_ROUTE = '/forum-feed?board=' + encodeURIComponent(BOARD);\n  const SUBMIT_ROUTE = '/submit-forum-post';\n  const REPORT_ROUTE = '/report-forum-post';",
    `  const FEED_ROUTES = { main: '/forum-feed-main', speculation: '/forum-feed-speculation', 'epstein-alive': '/forum-feed-epstein-alive' };
  const SUBMIT_ROUTES = { main: '/submit-main-post', speculation: '/submit-speculation-post', 'epstein-alive': '/submit-epstein-alive-post' };
  const REPORT_ROUTES = { main: '/report-main-post', speculation: '/report-speculation-post', 'epstein-alive': '/report-epstein-alive-post' };
  const FEED_ROUTE = FEED_ROUTES[BOARD] || '/forum-feed-main';
  const SUBMIT_ROUTE = SUBMIT_ROUTES[BOARD] || '/submit-main-post';
  const REPORT_ROUTE = REPORT_ROUTES[BOARD] || '/report-main-post';`
  );
  if (!s.includes('function lockFormToBoard(){')) {
    s = s.replace(
      "  async function loadFeed(){\n    if (!feed) return;",
      `  function lockFormToBoard(){
    if (!form) return;
    form.setAttribute('data-board', BOARD);
    let hidden = form.querySelector('input[name="board"]');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'board';
      form.prepend(hidden);
    }
    hidden.value = BOARD;
  }

  async function loadFeed(){
    if (!feed) return;
    lockFormToBoard();`
    );
  }
  s = s.replace(
    "  applyLock();\n  loadFeed();",
    "  lockFormToBoard();\n  applyLock();\n  loadFeed();"
  );
  s = enforcePublicForumCopy(s);
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
    `function boardFromRoutePath(pathname, fallback = 'main') {
  if (pathname === '/forum-feed-speculation' || pathname === '/submit-speculation-post' || pathname === '/report-speculation-post') return 'speculation';
  if (pathname === '/forum-feed-epstein-alive' || pathname === '/submit-epstein-alive-post' || pathname === '/report-epstein-alive-post') return 'epstein-alive';
  if (pathname === '/forum-feed-main' || pathname === '/submit-main-post' || pathname === '/report-main-post') return 'main';
  return normalizeBoard(fallback);
}

async function handleForumFeed(request, env, forcedBoard = '') {
  const url = new URL(request.url);
  const board = forcedBoard || cleanText(url.searchParams.get('board') || 'main', 80);`
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

function patchSeed(){
  if (!exists('data/forum-seed.json')) return;
  const text = JSON.stringify({ updated: new Date().toISOString().slice(0,10), mode: 'public-signal-seed', notice: 'Public Signal Board starter post.', posts: [{ id: 'seed-forum-public-source-drop', category: 'Source Drop', name: 'Matrix Reprogrammed', title: 'Post a source, not a rumour', body: 'Drop public links, documents, court records, archive pages, official releases, useful questions, or reader notes. Keep claims tied to sources and separate evidence from speculation.', sourceUrl: 'evidence-vault.html', createdAt: '2026-06-28T00:00:00Z' }]}, null, 2);
  if (read('data/forum-seed.json') !== text) { write('data/forum-seed.json', text); changed.push('data/forum-seed.json'); }
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
patchSeed();
patchTests();
console.log(`Hard board split applied: ${changed.length ? changed.join(', ') : 'already clean'}`);
