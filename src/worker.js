const workerName = 'matrixreprogrammed';
const updatedAt = '2026-07-03T00:00:00.000Z';

const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const jsonHeaders = {
  ...securityHeaders,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Matrix-Origin': 'cloudflare-worker-api',
  'X-Matrix-Worker': workerName
};

const routeAliases = {
  '/home': '/index.html',
  '/start': '/start-here.html',
  '/search': '/search.html',
  '/ask-matrix': '/search.html',
  '/books': '/books.html',
  '/newsletter': '/newsletter.html',
  '/forum': '/forum.html',
  '/signal-board': '/forum.html',
  '/main-board': '/forum.html',
  '/speculation-board': '/dark-speculation-forum.html',
  '/dark-speculation-board': '/dark-speculation-forum.html',
  '/dark-speculation-dropbox': '/dark-speculation-forum.html',
  '/dark-speculation-lab': '/dark-speculation-lab.html',
  '/epstein-alive-board': '/epstein-alive-board.html',
  '/epstein-sighting-board': '/epstein-alive-board.html',
  '/epstein-sightings-board': '/epstein-alive-board.html',
  '/epstein': '/epstein-files.html',
  '/epstein-files': '/epstein-files.html',
  '/tracker': '/tracker-dashboard.html',
  '/trackers': '/tracker-dashboard.html',
  '/tracker-core': '/tracker-core.html',
  '/black-files': '/black-files.html',
  '/black-file': '/black-file-expose.html',
  '/black-file-expose': '/black-file-expose.html',
  '/black-file-index': '/black-file-expose.html',
  '/the-black-file': '/black-file-expose.html',
  '/missing-files': '/missing-files.html',
  '/pressure-list': '/missing-files.html',
  '/auto-evidence': '/auto-evidence-pipeline.html',
  '/auto-evidence-pipeline': '/auto-evidence-pipeline.html',
  '/evidence-tasks': '/evidence-task-engine.html',
  '/verified-records': '/verified-record-cards.html',
  '/wrongdoing': '/wrongdoing-tracker.html',
  '/institution-tracker': '/institution-tracker.html',
  '/billionaire-tracker': '/epstein-billionaire-tracker.html',
  '/file-scans': '/epstein-file-scans.html',
  '/epstein-file-scans': '/epstein-file-scans.html',
  '/source-document-vault': '/source-document-vault.html',
  '/source-vault': '/source-document-vault.html',
  '/evidence-vault': '/evidence-vault.html',
  '/deploy-status': '/deploy-status.html',
  '/live-intel': '/live-intel.html',
  '/intel-desk': '/news.html',
  '/intel-vault': '/intel-vault.html',
  '/source-cards': '/source-cards.html',
  '/network-search': '/network-search.html',
  '/daily-drop': '/daily-drop.html',
  '/black-file-pdf': '/downloads/the-black-file-matrix-reprogrammed.pdf',
  '/blackfile': '/black-file-expose.html',
  '/migration-flow-panel': '/migration-flow.html',
  '/vaccines': '/news.html',
  '/human-cost': '/news.html',
  '/surveillance-hub': '/authority-intelligence-network.html',
  '/network-map': '/network-maps.html',
  '/network-maps': '/network-maps.html',
  '/evidence-policy': '/evidence-policy.html',
  '/matrix-brain': '/site-intelligence-core.html',
  '/brain': '/site-intelligence-core.html',
  '/site-intelligence-core': '/site-intelligence-core.html',
  '/control-system-tracker': '/control-system-tracker.html',
  '/control-tracker': '/control-system-tracker.html',
  '/timers': '/timers.html',
  '/risk-timers': '/timers.html',
  '/claim-classifier': '/claim-classifier.html',
  '/power-atlas': '/power-atlas.html',
  '/atlas-index': '/atlas-index.html',
  '/book-universe': '/book-universe.html',
  '/answer-engine': '/answer-engine.html',
  '/ai-answers': '/answer-engine.html',
  '/answer-index': '/answer-index.html',
  '/evidence-vault-index': '/evidence-vault-index.html',
  '/secret-societies-hub': '/authority-secret-societies.html',
  '/intelligence-hub': '/authority-intelligence-network.html',
  '/crime-hub': '/authority-crime-state-overlap.html',
  '/war-conflict-hub': '/authority-war-machine.html',
  '/dashboard-human-cost': '/news.html',
  '/dashboard-conflict': '/news.html',
  '/dashboard-economy': '/news.html',
  '/migration': '/migration-flow.html',
  '/maps': '/network-map-index.html',
  '/network-map-index': '/network-map-index.html',
  '/conversion-funnel': '/conversion-funnel.html',
  '/funnels': '/conversion-funnel.html',
  '/black-file-funnel': '/black-file-expose.html',
  '/trust': '/trust-center.html',
  '/trust-center': '/trust-center.html',
  '/privacy': '/trust-privacy.html',
  '/corrections': '/trust-corrections.html',
  '/source-methodology': '/trust-source-methodology.html',
  '/distribution': '/distribution-center.html',
  '/distribution-center': '/distribution-center.html',
  '/content-engine': '/distribution-center.html',
  '/reader-paths': '/sales-ladder.html',
  '/sales-ladder': '/sales-ladder.html',
  '/start-reading': '/sales-ladder.html',
  '/update-monitor': '/update-monitor.html',
  '/freshness': '/update-monitor.html',
  '/site-updates': '/update-monitor.html',
  '/authority': '/authority-hub.html',
  '/authority-hub': '/authority-hub.html',
  '/topic-clusters': '/authority-hub.html',
  '/schema': '/schema-index.html',
  '/schema-index': '/schema-index.html',
  '/site-graph': '/site-graph.json',
  '/claim-taxonomy': '/claim-taxonomy.json',
  '/crawler-map': '/crawler-map.json',
  '/download-center': '/download-center.html',
  '/dossiers': '/download-center.html',
  '/dossier-packs': '/download-center.html',
  '/feed-center': '/feed-center.html',
  '/feeds': '/feed-center.html',
  '/rss': '/feed-center.html',
  '/atom': '/feed-center.html',
  '/json-feed': '/feed-center.html',
  '/share-center': '/share-center.html',
  '/share-kits': '/share-center.html',
  '/social-kits': '/share-center.html',
  '/copy-kits': '/share-center.html',
  '/launch-room': '/launch-room.html',
  '/campaigns': '/launch-room.html',
  '/campaign-calendar': '/launch-room.html',
  '/launch-calendar': '/launch-room.html',
  '/offer-center': '/offer-center.html',
  '/offers': '/offer-center.html',
  '/book-offers': '/offer-center.html',
  '/revenue-ladder': '/offer-center.html',
  '/optin-center': '/optin-center.html',
  '/opt-in': '/optin-center.html',
  '/lead-magnets': '/optin-center.html',
  '/amazon-store': '/amazon-store-books.html'
};

const hardBoardRouteMap = {
  '/forum-feed-main': { type: 'feed', board: 'main' },
  '/forum-feed-speculation': { type: 'feed', board: 'speculation' },
  '/forum-feed-epstein-alive': { type: 'feed', board: 'epstein-alive' },
  '/submit-main-post': { type: 'submit', board: 'main' },
  '/submit-speculation-post': { type: 'submit', board: 'speculation' },
  '/submit-epstein-alive-post': { type: 'submit', board: 'epstein-alive' },
  '/report-main-post': { type: 'report', board: 'main' },
  '/report-speculation-post': { type: 'report', board: 'speculation' },
  '/report-epstein-alive-post': { type: 'report', board: 'epstein-alive' }
};

const boardLabels = {
  main: 'Main Signal Board',
  speculation: 'Dark Speculation Board',
  'epstein-alive': 'Epstein Alive / Sighting Board'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: jsonHeaders });
}

function markdown(text, filename = 'forum-posts.md') {
  return new Response(text, {
    status: 200,
    headers: {
      ...securityHeaders,
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Matrix-Origin': 'cloudflare-worker-api',
      'X-Matrix-Worker': workerName
    }
  });
}

function cacheHeadersForPath(pathname = '') {
  if (pathname === '/' || pathname.endsWith('.html') || !/\.[a-z0-9]{2,8}$/i.test(pathname)) return 'no-store, must-revalidate';
  if (/\.(?:js|css|png|jpg|jpeg|webp|gif|svg|ico|woff2?)$/i.test(pathname)) return 'public, max-age=31536000, immutable';
  if (/\.(?:json|xml|txt|md|pdf)$/i.test(pathname)) return 'public, max-age=300, must-revalidate';
  return 'public, max-age=3600, must-revalidate';
}

function hardenResponse(response, pathname = '') {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
  headers.set('X-Matrix-Origin', 'cloudflare-worker-assets');
  headers.set('X-Matrix-Worker', workerName);
  headers.set('Cache-Control', cacheHeadersForPath(pathname));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function safeNotConfigured(name, detail = '') {
  return json({ ok: false, configured: false, error: `${name} not configured`, detail, worker: workerName, handled: 'safeNotConfigured' }, 503);
}

function isHostileProbePath(pathname = '') {
  return /(?:\.env|wp-admin|wp-login|xmlrpc\.php|\.git|phpinfo|id_rsa|config\.php|vendor\/phpunit|eval-stdin|boaform|cgi-bin|\.aws|server-status)/i.test(pathname);
}

function methodAllowed(request, methods = ['GET', 'HEAD']) {
  return methods.includes(request.method);
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function cleanText(value, max = 1200) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanEmail(value = '') { return cleanText(value, 180).toLowerCase(); }
function isEmail(value = '') { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '')); }
async function hashText(value) { const data = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function normalizeBoard(value = '') { const raw = cleanText(value, 80).toLowerCase().replace(/_/g, '-'); if (['speculation','dark-speculation','dark-speculation-board','dark-lab'].includes(raw)) return 'speculation'; if (['epstein-alive','epstein-sighting','epstein-sightings','sighting-watch','epstein-alive-board'].includes(raw)) return 'epstein-alive'; return 'main'; }
function boardCounts(posts = []) { const counts = { main: 0, speculation: 0, 'epstein-alive': 0 }; for (const post of posts || []) { const board = normalizeBoard(post.board); counts[board] = (counts[board] || 0) + 1; } return counts; }
function makeId() { return `signal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

function safePost(post) {
  if (!post || typeof post !== 'object') return null;
  const title = cleanText(post.title, 180);
  const body = cleanText(post.body || post.message, 2200);
  if (!title || !body) return null;
  return {
    id: cleanText(post.id || makeId(), 140),
    board: normalizeBoard(post.board),
    title,
    body,
    category: cleanText(post.category || 'Signal', 80),
    name: cleanText(post.name || 'Anonymous', 80),
    sourceUrl: /^https?:\/\//i.test(String(post.sourceUrl || post.source || '')) ? cleanText(post.sourceUrl || post.source, 500) : '',
    createdAt: post.createdAt || new Date().toISOString(),
    approvedAt: post.approvedAt || post.createdAt || new Date().toISOString(),
    status: cleanText(post.status || 'live', 40)
  };
}

function sortPosts(posts = []) { return posts.filter(Boolean).sort((a, b) => new Date(b.createdAt || b.approvedAt || 0) - new Date(a.createdAt || a.approvedAt || 0)); }
function filterPostsByBoard(posts = [], board = 'main') { const normalized = normalizeBoard(board); return posts.filter(post => normalizeBoard(post.board) === normalized); }

async function getForumIndex(env) {
  if (!env.FORUM_POSTS) return [];
  try {
    const raw = await env.FORUM_POSTS.get('posts:index');
    const parsed = JSON.parse(raw || '[]');
    return sortPosts(Array.isArray(parsed) ? parsed.map(safePost) : []);
  } catch { return []; }
}

async function saveForumIndex(env, posts = []) {
  if (!env.FORUM_POSTS) return false;
  try {
    const cleaned = sortPosts(posts.map(safePost)).slice(0, 100);
    await env.FORUM_POSTS.put('posts:index', JSON.stringify(cleaned), { metadata: { updatedAt: new Date().toISOString(), count: cleaned.length, boardCounts: boardCounts(cleaned), storage: 'Cloudflare KV FORUM_POSTS' } });
    return true;
  } catch { return false; }
}

async function getPosts(env, board = 'all') {
  const posts = await getForumIndex(env);
  return board === 'all' ? posts : filterPostsByBoard(posts, board);
}

async function handleForumHealth(env) {
  const posts = await getForumIndex(env);
  return json({
    ok: true,
    worker: workerName,
    backend: 'src/worker.js',
    assetBinding: Boolean(env.ASSETS),
    forumPostsBinding: env.FORUM_POSTS ? 'connected' : 'missing',
    bindingHealthy: Boolean(env.FORUM_POSTS),
    kvBindingName: 'FORUM_POSTS',
    expectedKvNamespaceTitle: 'matrixreprogrammed-forum-posts',
    expectedKvNamespaceId: '99996d87016d4285a833707cbda5232f',
    persistence: 'Cloudflare KV FORUM_POSTS: posts:index plus durable post:* records, board-aware filtering active',
    indexSelfHealing: true,
    indexCount: posts.length,
    storedPostCount: posts.length,
    boardAware: true,
    boardLabels,
    boardCounts: boardCounts(posts),
    hardBoardRoutes: Object.keys(hardBoardRouteMap),
    deployedFrom: 'GitHub main',
    updatedAt
  });
}

async function forumExport(env, board = 'all') {
  const posts = await getPosts(env, board);
  const normalizedBoard = board === 'all' ? 'all' : normalizeBoard(board);
  return { ok: true, persistent: true, source: 'Cloudflare KV FORUM_POSTS', generatedAt: new Date().toISOString(), board: normalizedBoard, boardLabel: normalizedBoard === 'all' ? 'All Boards' : boardLabels[normalizedBoard], boardCounts: boardCounts(await getForumIndex(env)), count: posts.length, posts: posts.slice(0, 60), boundary: 'Public Signal Board posts are user-submitted public resources. They are not claims verified by Matrix Reprogrammed unless separately source-carded or cited.' };
}

async function handleForumFeed(request, env, forcedBoard = '') {
  const url = new URL(request.url);
  return json(await forumExport(env, cleanText(forcedBoard || url.searchParams.get('board') || 'main', 80)));
}

async function handleForumPostsJson(request, env, forcedBoard = '') {
  const url = new URL(request.url);
  return json(await forumExport(env, cleanText(forcedBoard || url.searchParams.get('board') || 'all', 80)));
}

function postsMarkdown(data) {
  const lines = ['# Matrix Reprogrammed Signal Board Posts', '', `Generated: ${data.generatedAt}`, `Source: ${data.source}`, `Board: ${data.boardLabel || data.board}`, `Posts: ${data.posts.length}`, '', '## Boundary', '', data.boundary, ''];
  for (const post of data.posts || []) { lines.push(`## ${post.title}`, '', `- Date: ${post.createdAt}`, `- Board: ${boardLabels[post.board] || post.board}`, `- Category: ${post.category}`, `- Name: ${post.name}`); if (post.sourceUrl) lines.push(`- Source: ${post.sourceUrl}`); lines.push('', post.body, ''); }
  return lines.join('\n');
}

async function handleForumPostsMarkdown(request, env, forcedBoard = '') {
  const url = new URL(request.url);
  const board = cleanText(forcedBoard || url.searchParams.get('board') || 'all', 80);
  const data = await forumExport(env, board);
  return markdown(postsMarkdown(data), board && board !== 'all' ? `forum-posts-${normalizeBoard(board)}.md` : 'forum-posts.md');
}

async function handleSubmitForumPost(request, env, forcedBoard = '') {
  const body = await readBody(request);
  if (body.website) return json({ ok: false, error: 'Spam trap triggered' }, 400);
  const title = cleanText(body.title, 140);
  const message = cleanText(body.body || body.message, 1800);
  if (title.length < 3 || message.length < 10) return json({ ok: false, error: 'Signal needs a title and a useful body.' }, 400);
  const board = normalizeBoard(forcedBoard || body.board || 'main');
  const post = safePost({ id: makeId(), board, title, body: message, category: body.category || 'Signal', name: body.name || 'Anonymous', sourceUrl: body.sourceUrl || body.source || '', createdAt: new Date().toISOString(), approvedAt: new Date().toISOString(), status: 'live' });
  const posts = await getForumIndex(env);
  posts.unshift(post);
  const saved = await saveForumIndex(env, posts);
  if (env.FORUM_POSTS) { try { await env.FORUM_POSTS.put(`post:${post.id}`, JSON.stringify(post), { metadata: { createdAt: post.createdAt, title: post.title, status: post.status, board } }); } catch {} }
  return json({ ok: true, persistent: true, saved, storage: 'Cloudflare KV FORUM_POSTS', board, boardLabel: boardLabels[board], post });
}

async function handleReportForumPost(request, env, forcedBoard = '') {
  const body = await readBody(request);
  const board = normalizeBoard(forcedBoard || body.board || 'main');
  const report = { id: makeId(), board, postId: cleanText(body.id || body.postId, 120), reason: cleanText(body.reason || 'Reported by reader', 1000), createdAt: new Date().toISOString() };
  if (env.FORUM_POSTS) { try { await env.FORUM_POSTS.put(`report:${report.id}`, JSON.stringify(report), { metadata: { board, postId: report.postId } }); } catch {} }
  return json({ ok: true, persistent: true, reportId: report.id, board });
}

async function getNewsletterIndex(env) { if (!env.FORUM_POSTS) return []; try { const raw = await env.FORUM_POSTS.get('newsletter:index'); const arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; } }
async function saveNewsletterIndex(env, index) { if (!env.FORUM_POSTS) return false; try { await env.FORUM_POSTS.put('newsletter:index', JSON.stringify(index.slice(0, 10000)), { metadata: { updatedAt: new Date().toISOString(), count: index.length, storage: 'Cloudflare KV FORUM_POSTS' } }); return true; } catch { return false; } }
async function handleNewsletterSignup(request, env) { const body = await readBody(request); const email = cleanEmail(body.email); if (!isEmail(email)) return json({ ok: false, error: 'Valid email required' }, 400); const id = await hashText(email); const now = new Date().toISOString(); const subscriber = { id, email, name: cleanText(body.name || '', 120), source: cleanText(body.source || '', 180), path: cleanText(body.path || '', 180), interest: cleanText(body.interest || 'Matrix Reprogrammed weekly signal drop', 400), consent: body.consent !== false, createdAt: now, updatedAt: now, status: 'subscribed' }; if (env.FORUM_POSTS) { try { await env.FORUM_POSTS.put('newsletter:subscriber:' + id, JSON.stringify(subscriber), { metadata: { emailHash: id, status: 'subscribed', createdAt: now } }); } catch {} } const index = await getNewsletterIndex(env); const existing = index.find(row => row.id === id); if (existing) { existing.email = email; existing.name = subscriber.name || existing.name; existing.status = 'subscribed'; existing.updatedAt = now; } else index.unshift({ id, email, name: subscriber.name, path: subscriber.path, createdAt: now, status: 'subscribed' }); const saved = await saveNewsletterIndex(env, index); return json({ ok: true, persistent: true, saved, subscriberId: id, status: 'subscribed', storage: 'Cloudflare KV FORUM_POSTS', message: 'Saved. Weekly Signal Drop enabled.', downloadUrl: '/downloads/the-black-file-matrix-reprogrammed.pdf' }); }
async function handleNewsletterHealth(env) { const index = await getNewsletterIndex(env); return json({ ok: true, storage: 'Cloudflare KV FORUM_POSTS', configured: Boolean(env.FORUM_POSTS), subscribers: index.length, digest: '/downloads/weekly-newsletter-latest.json', signup: '/newsletter-signup', weekly: '/newsletter-send-weekly', updatedAt: new Date().toISOString() }); }
async function handleNewsletterSubscribers(request, env) { const token = (request.headers.get('x-admin-token') || new URL(request.url).searchParams.get('token') || ''); if (env.NEWSLETTER_ADMIN_TOKEN && token !== env.NEWSLETTER_ADMIN_TOKEN) return json({ ok: false, error: 'Admin token required' }, 403); const index = await getNewsletterIndex(env); return json({ ok: true, count: index.length, subscribers: index }); }
async function handleNewsletterSendWeekly(request, env) { const token = (request.headers.get('x-admin-token') || new URL(request.url).searchParams.get('token') || ''); if (env.NEWSLETTER_ADMIN_TOKEN && token !== env.NEWSLETTER_ADMIN_TOKEN) return json({ ok: false, error: 'Admin token required' }, 403); const index = await getNewsletterIndex(env); return json({ ok: true, mode: env.RESEND_API_KEY ? 'send-ready' : 'preview-only', subscribers: index.length, message: 'Subscribers are stored in Cloudflare KV. Add RESEND_API_KEY or another email-provider secret to activate bulk sending.', digest: '/downloads/weekly-newsletter-latest.json' }); }
async function handleUnsubscribeNewsletter(request, env) { const email = cleanEmail(new URL(request.url).searchParams.get('email') || ''); if (!email) return json({ ok: false, error: 'Email required' }, 400); const id = await hashText(email); if (env.FORUM_POSTS) { try { await env.FORUM_POSTS.put('newsletter:subscriber:' + id + ':status', JSON.stringify({ id, email, status: 'unsubscribed', updatedAt: new Date().toISOString() })); } catch {} } return json({ ok: true, status: 'unsubscribed', subscriberId: id }); }

async function handleTrackEvent(request, env) {
  const body = await readBody(request);
  const event = { id: makeId(), name: cleanText(body.name || 'event', 80), route: cleanText(body.route || '', 120), page: cleanText(body.page || '', 240), createdAt: new Date().toISOString() };
  if (env.FORUM_POSTS) { try { await env.FORUM_POSTS.put(`analytics:${event.id}`, JSON.stringify(event), { expirationTtl: 60 * 60 * 24 * 45, metadata: { name: event.name, route: event.route, page: event.page } }); } catch {} }
  return new Response(null, { status: 204, headers: { ...securityHeaders, 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'cloudflare-worker-api', 'X-Matrix-Worker': workerName } });
}

async function handleIntroVoice(request, env) {
  if (!env.ELEVENLABS_API_KEY) return safeNotConfigured('ELEVENLABS_API_KEY Cloudflare secret', 'Browser fallback voice can still be used.');
  return json({ ok: false, configured: true, error: 'Intro voice endpoint is configured but disabled in safe Worker mode.' }, 503);
}

async function serveAsset(request, env, url, pathname) {
  if (!methodAllowed(request)) return json({ ok: false, error: 'Method not allowed for static asset route', method: request.method, pathname }, 405);
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') return safeNotConfigured('ASSETS binding', pathname);
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  assetUrl.search = url.search;
  const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  return hardenResponse(response, pathname);
}

function assetCandidates(originalPath, routedPath) {
  const candidates = [];
  const add = value => { if (value && !candidates.includes(value)) candidates.push(value); };
  add(routedPath);
  add(originalPath);
  if (routedPath === '/' || originalPath === '/') add('/index.html');
  if (!routedPath.endsWith('/')) { add(`${routedPath}.html`); add(`${routedPath}/index.html`); }
  if (routedPath.endsWith('/')) { add(`${routedPath}index.html`); add(`${routedPath.replace(/\/$/, '')}.html`); }
  add('/404.html');
  return candidates;
}

function cors204() { return new Response(null, { status: 204, headers: { ...securityHeaders, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type,x-admin-token' } }); }

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const originalPath = url.pathname;
      const normalizedPath = originalPath.length > 1 ? originalPath.replace(/\/+$/, '') : originalPath;
      const routedPath = routeAliases[originalPath] || routeAliases[normalizedPath] || originalPath;

      if (isHostileProbePath(originalPath)) return json({ ok: false, error: 'Rejected hostile probe path', path: originalPath }, 404);
      if (request.method === 'OPTIONS') return cors204();

      if (request.method === 'POST' && originalPath === '/intro-voice') return handleIntroVoice(request, env);
      if (request.method === 'GET' && originalPath === '/forum-health') return handleForumHealth(env);
      if (request.method === 'GET' && originalPath === '/forum-feed') return handleForumFeed(request, env);
      if (request.method === 'GET' && (originalPath === '/downloads/forum-posts.json' || originalPath === '/forum-posts.json')) return handleForumPostsJson(request, env);
      if (request.method === 'GET' && (originalPath === '/downloads/forum-posts.md' || originalPath === '/forum-posts.md')) return handleForumPostsMarkdown(request, env);
      if (request.method === 'POST' && originalPath === '/submit-forum-post') return handleSubmitForumPost(request, env);
      if (request.method === 'POST' && originalPath === '/report-forum-post') return handleReportForumPost(request, env);
      if (request.method === 'POST' && (originalPath === '/track-event' || originalPath === '/.netlify/functions/track-event')) return handleTrackEvent(request, env);

      if (request.method === 'POST' && (originalPath === '/newsletter-signup' || originalPath === '/subscribe-newsletter')) return handleNewsletterSignup(request, env);
      if (request.method === 'GET' && originalPath === '/newsletter-health') return handleNewsletterHealth(env);
      if (request.method === 'GET' && originalPath === '/unsubscribe-newsletter') return handleUnsubscribeNewsletter(request, env);
      if (request.method === 'GET' && originalPath === '/newsletter-subscribers.json') return handleNewsletterSubscribers(request, env);
      if (request.method === 'POST' && (originalPath === '/newsletter-send-weekly' || originalPath === '/send-weekly-newsletter')) return handleNewsletterSendWeekly(request, env);

      const hardRoute = hardBoardRouteMap[originalPath] || hardBoardRouteMap[normalizedPath];
      if (hardRoute && request.method === 'GET' && hardRoute.type === 'feed') return handleForumFeed(request, env, hardRoute.board);
      if (hardRoute && request.method === 'POST' && hardRoute.type === 'submit') return handleSubmitForumPost(request, env, hardRoute.board);
      if (hardRoute && request.method === 'POST' && hardRoute.type === 'report') return handleReportForumPost(request, env, hardRoute.board);

      let lastResponse;
      for (const candidate of assetCandidates(originalPath, routedPath)) {
        const response = await serveAsset(request, env, url, candidate);
        lastResponse = response;
        if (response.status !== 404) return response;
      }
      return lastResponse || json({ ok: false, error: 'No asset response available' }, 404);
    } catch (err) {
      return json({ ok: false, error: 'Worker handled failure safely', message: cleanText(err && err.message, 500), worker: workerName }, 500);
    }
  }
};
