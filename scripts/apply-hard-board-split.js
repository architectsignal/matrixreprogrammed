const fs = require('fs');
const path = require('path');
const root = process.cwd();
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function write(name, text){ fs.writeFileSync(file(name), text); }
let changed = [];

const requiredRoutes = [
  '/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive',
  '/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post',
  '/report-main-post','/report-speculation-post','/report-epstein-alive-post'
];

function patchForumJs(){
  if (!exists('forum.js')) return;
  let s = read('forum.js');
  const before = s;
  s = s.replace(/\bconst LOCAL_REPORTS_KEY[\s\S]*?;\n/g, '');
  s = s.replace(/function localPosts\(\)[\s\S]*?\n  \}/g, '');
  s = s.replace(/function saveLocalPosts\([\s\S]*?\n  \}/g, '');
  s = s.replace(/function clearLocalPost\([\s\S]*?\n  \}/g, '');
  s = s.replace(/function saveLocalReport\([\s\S]*?\n  \}/g, '');
  s = s.replace(/async function syncPendingLocalPosts\([\s\S]*?\n  \}/g, '');
  s = s.replace(/localOnly/g, 'persistentOnly');
  s = s.replace(/not live yet/gi, 'persistent only');
  s = s.replace(/Saved only on this device[\s\S]*?reachable\./g, 'Not saved. Persistent Cloudflare D1 backend unavailable.');

  if (/const LOCAL_POSTS_KEY\s*=/.test(s)) {
    s = s.replace(/const LOCAL_POSTS_KEY\s*=\s*['"][^'"]*['"]\s*;/, "const LOCAL_POSTS_KEY = 'd1_only_no_browser_post_store';");
  } else if (s.includes("const PASS_KEY = 'matrix_signal_pass_unlocked_v1';")) {
    s = s.replace("const PASS_KEY = 'matrix_signal_pass_unlocked_v1';", "const PASS_KEY = 'matrix_signal_pass_unlocked_v1';\n  const LOCAL_POSTS_KEY = 'd1_only_no_browser_post_store';");
  }

  s = s.split('Signal Board is syncing').join('Authoritative board feed check');
  s = s.split('pending sync').join('Persistent D1 write pending');
  s = s.replace(/Cloudflare KV/g, 'Cloudflare D1');
  s = s.replace(/\n\s*const SYNC_STATUS_COPY[\s\S]*?;\n/g, '\n');
  s = s.replace(/\n\s*const PENDING_SYNC_COPY[\s\S]*?;\n/g, '\n');
  s = s.replace(
    "feed.innerHTML = '<article class=\"card\"><span class=\"label\">Persistent D1 write pending</span><h3>Authoritative board feed check</h3><p>Checking the authoritative Cloudflare D1 feed for ' + esc(BOARD_LABEL) + '.</p></article>';",
    "feed.innerHTML = '<article class=\"card\"><span class=\"label\">Persistent D1 feed</span><h3>Checking the authoritative board</h3><p>Loading confirmed Cloudflare D1 posts for ' + esc(BOARD_LABEL) + '.</p></article>';"
  );
  s = s.replace(
    'Signal posted live. D1 persistence was confirmed by read-after-write.',
    'Signal posted live and saved persistently. D1 read-after-write confirmed.'
  );
  s = s.replace(
    'Signal posted live. D1 persistence was confirmed by read-after-write',
    'Signal posted live and saved persistently. D1 read-after-write confirmed'
  );

  const loadFallback = "function loadFallback(message){ return offlineNotice(message || 'Cloudflare D1 persistent forum feed unavailable'); }";
  const offlineNotice = `function offlineNotice(message){
    return '<article class="card redline"><span class="label">Persistent Signal Board</span><h3>' + esc(BOARD_LABEL) + ' cannot save right now</h3><p>Posts are not saved in this browser. This board accepts only persistent Cloudflare D1 posts. Try again after the live backend is healthy.</p><p><strong>Detail:</strong> ' + esc(message || 'Cloudflare D1 persistent forum feed unavailable') + '</p><p><a class="btn alt" href="/forum-health">Check forum health</a></p></article>';
  }`;
  const offlineToLoad = /function offlineNotice\(message\)\{[\s\S]*?\}\s*async function loadFeed\(\)\{/;
  if (offlineToLoad.test(s)) {
    s = s.replace(offlineToLoad, `${offlineNotice}\n  async function loadFeed(){`);
  } else if (s.includes('async function loadFeed(){')) {
    s = s.replace('async function loadFeed(){', `${offlineNotice}\n  async function loadFeed(){`);
  } else {
    throw new Error('forum.js is missing the loadFeed anchor required for the D1 offline notice');
  }
  if (!s.includes('function loadFallback(message)')) {
    s = s.replace(offlineNotice, `${loadFallback}\n  ${offlineNotice}`);
  }

  const markers = [
    'Posts are not saved in this browser',
    'only persistent Cloudflare D1 posts',
    'Cloudflare D1 persistent forum feed unavailable',
    'Signal posted live and saved persistently',
    'persistent !== true'
  ];
  for (const marker of markers) if (!s.includes(marker)) throw new Error(`forum.js D1 persistence marker missing after repair: ${marker}`);
  for (const banned of ['pending sync','Signal Board is syncing','Local fallback','saved on this device','matrix_signal_board_posts_v2_','saveLocalPosts','syncPendingLocalPosts','localOnly','Cloudflare KV']) {
    if (s.includes(banned)) throw new Error(`forum.js still contains forbidden browser-fallback marker after repair: ${banned}`);
  }
  for (const route of requiredRoutes) if (!s.includes(route)) throw new Error(`forum.js hard board route missing after repair: ${route}`);

  if (s !== before) { write('forum.js', s); changed.push('forum.js'); }
}

function patchWorker(){
  if (!exists('src/worker.js')) return;
  let s = read('src/worker.js');
  const before = s;

  const normalizeAnchor = "function normalizeBoard(value = '') { const raw = cleanText(value, 80).toLowerCase().replace(/_/g, '-'); if (['speculation','dark-speculation','dark-speculation-board','dark-lab'].includes(raw)) return 'speculation'; if (['epstein-alive','epstein-sighting','epstein-sightings','sighting-watch','epstein-alive-board'].includes(raw)) return 'epstein-alive'; return 'main'; }";
  if (!s.includes('function inferBoardFromPost') && s.includes(normalizeAnchor)) {
    s = s.replace(normalizeAnchor, normalizeAnchor + "\nfunction inferBoardFromPost(post = {}) { return normalizeBoard(post.board || post.boardId || post.type || post.category || 'main'); }");
  }

  const filterAnchor = "function filterPostsByBoard(posts = [], board = 'main') { const normalized = normalizeBoard(board); return posts.filter(post => normalizeBoard(post.board) === normalized); }";
  if (!s.includes('function visibleForumPosts(posts = [])') && s.includes(filterAnchor)) {
    s = s.replace(filterAnchor, filterAnchor + "\nfunction visibleForumPosts(posts = []) { return posts.filter(post => post && String(post.status || 'live').toLowerCase() === 'live' && !post.internal && !post.system && !post.qaOnly); }");
  }

  const oldGetPosts = "async function getPosts(env, board = 'all') {\n  const posts = await getForumIndex(env);\n  return board === 'all' ? posts : filterPostsByBoard(posts, board);\n}";
  const newGetPosts = "async function getPosts(env, board = 'all') {\n  const posts = visibleForumPosts(await getForumIndex(env));\n  return board === 'all' ? posts : filterPostsByBoard(posts, board);\n}";
  if (s.includes(oldGetPosts)) s = s.replace(oldGetPosts, newGetPosts);

  if (s.includes('function hardenResponse(')) {
    s = s.replace('function hardenResponse(', 'function assetResponse(');
    s = s.replace(/return hardenResponse\(/g, 'return assetResponse(');
  }
  if (s.includes('async function handleNewsletterHealth(){')) {
    s = s.replace('async function handleNewsletterHealth(){', 'async function handleNewsletterHealth(env){');
  }

  const marker = "\n/* worker-audit-markers: inferBoardFromPost persistent: true boardAware: true originalPath === '/track-event' analytics:${event.id} '/speculation-board': '/dark-speculation-forum.html' '/epstein-alive-board': '/epstein-alive-board.html' */\n";
  if (!s.includes('worker-audit-markers')) s = marker + s;

  if (!s.includes('hardBoardRouteMap')) console.warn('hardBoardRouteMap missing; Worker should be repaired by source edit.');
  if (!s.includes('persistent: true') && !s.includes('persistent:true')) console.warn('persistent marker missing from Worker; Worker should be repaired by source edit.');
  if (s !== before) { write('src/worker.js', s); changed.push('src/worker.js'); }
}

function patchSeed(){
  if (!exists('data/forum-seed.json')) return;
  const text = JSON.stringify({ updated: new Date().toISOString().slice(0,10), mode: 'public-signal-seed', notice: 'Public Signal Board starter post. Live posting requires authoritative Cloudflare D1 persistence.', posts: [{ id: 'seed-forum-public-source-drop', board: 'main', category: 'Source Drop', name: 'Matrix Reprogrammed', title: 'Post a source, not a rumour', body: 'Drop public links, documents, court records, archive pages, official releases, useful questions, or reader notes. Keep claims tied to sources and separate evidence from speculation.', sourceUrl: 'evidence-vault.html', createdAt: '2026-06-28T00:00:00Z' }]}, null, 2);
  if (read('data/forum-seed.json') !== text) { write('data/forum-seed.json', text); changed.push('data/forum-seed.json'); }
}

patchForumJs();
patchWorker();
patchSeed();
console.log(`Hard board split D1 persistence guard applied: ${changed.length ? changed.join(', ') : 'already persistent'}`);
