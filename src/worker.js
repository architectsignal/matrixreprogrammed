const workerName = 'matrixreprogrammed';
const updatedAt = '2026-06-29T00:00:00.000Z';

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
  '/matrix-brain': '/site-intelligence-core.html',
  '/brain': '/site-intelligence-core.html',
  '/site-intelligence-core': '/site-intelligence-core.html',
  '/control-system-tracker': '/control-system-tracker.html',
  '/control-tracker': '/control-system-tracker.html',
  '/timers': '/timers.html',
  '/risk-timers': '/timers.html',
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
  '/books': '/books.html',
  '/deploy-status': '/deploy-status.html',
  '/live-intel': '/live-intel.html',
  '/intel-desk': '/news.html',
  '/evidence-vault': '/evidence-vault.html',
  '/source-document-vault': '/source-document-vault.html',
  '/claim-classifier': '/claim-classifier.html',
  '/power-atlas': '/power-atlas.html',
  '/atlas-index': '/atlas-index.html',
  '/book-universe': '/book-universe.html',
  '/answer-engine': '/answer-engine.html',
  '/ai-answers': '/answer-engine.html',
  '/black-file-index': '/black-file-index.html',
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
  '/black-file-funnel': '/black-file.html',
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
  '/newsletter': '/newsletter.html',
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

const packTerms = {
  'black-file-starter': ['black file', 'epstein', 'elite', 'evidence', 'settlement', 'nda', 'maxwell', 'giuffre', 'oversight', 'source', 'trust'],
  'intelligence-network': ['intelligence', 'agency', 'surveillance', 'cia', 'nsa', 'declassified', 'mkultra', 'gladio', 'foia', 'oversight', 'archive'],
  'crime-state-overlap': ['crime', 'cartel', 'mafia', 'ndrangheta', 'triad', 'court', 'sanctions', 'laundering', 'ports', 'corruption', 'logistics'],
  'war-machine': ['war', 'contractor', 'blackwater', 'conflict', 'defense', 'procurement', 'sanctions', 'ukraine', 'iran', 'gaza', 'human cost', 'military'],
  'symbolic-power': ['dog', 'architect', 'symbol', 'masonic', 'masonry', 'esoteric', 'occult', 'degree', 'architecture', 'cipher', 'plate'],
  'trust-evidence': ['trust', 'evidence', 'claim', 'source', 'corrections', 'privacy', 'association', 'boundary', 'taxonomy', 'source card']
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
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeBoard(value = '') {
  const raw = cleanText(value, 80).toLowerCase().replace(/_/g, '-');
  if (['speculation', 'dark-speculation', 'dark-speculation-board', 'dark-lab'].includes(raw)) return 'speculation';
  if (['epstein-alive', 'epstein-sighting', 'epstein-sightings', 'sighting-watch', 'epstein-alive-board'].includes(raw)) return 'epstein-alive';
  return 'main';
}

function inferBoardFromPost(post = {}) {
  const explicit = cleanText(post.board || '', 80);
  if (explicit) return normalizeBoard(explicit);
  const hay = [post.category, post.title, post.body || post.message, post.sourceUrl || post.source].join(' ').toLowerCase();
  if (/epstein/.test(hay) && /alive|sighting|spotted|lookalike|fake death|death hoax|body double|still alive/.test(hay)) return 'epstein-alive';
  if (/dark speculation|speculation|blue beam|adrenochrome|occult symbol claim|modern slavery source|photo \/ archive link|debunk \/ counter-source/.test(hay)) return 'speculation';
  return 'main';
}

function boardCounts(posts = []) {
  const counts = { main: 0, speculation: 0, 'epstein-alive': 0 };
  for (const post of posts) {
    const board = normalizeBoard(post.board || inferBoardFromPost(post));
    counts[board] = (counts[board] || 0) + 1;
  }
  return counts;
}

function filterPostsByBoard(posts = [], board = 'main') {
  const normalized = normalizeBoard(board);
  return posts.filter(post => normalizeBoard(post.board || inferBoardFromPost(post)) === normalized);
}

function makeId() {
  return `signal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safePost(post) {
  if (!post || typeof post !== 'object') return null;
  const id = cleanText(post.id, 140);
  const title = cleanText(post.title, 180);
  const body = cleanText(post.body || post.message, 2200);
  if (!id || !title || !body) return null;
  const board = normalizeBoard(post.board || inferBoardFromPost(post));
  return {
    id,
    board,
    title,
    body,
    category: cleanText(post.category || 'Signal', 80),
    name: cleanText(post.name || 'Anonymous', 80),
    sourceUrl: /^https?:\/\//i.test(String(post.sourceUrl || '')) ? cleanText(post.sourceUrl, 500) : '',
    createdAt: post.createdAt || new Date().toISOString(),
    approvedAt: post.approvedAt || post.createdAt || new Date().toISOString(),
    status: cleanText(post.status || 'live', 40)
  };
}

function sortPosts(posts) {
  return posts.filter(Boolean).sort((a, b) => new Date(b.createdAt || b.approvedAt || 0) - new Date(a.createdAt || a.approvedAt || 0));
}

function filterPostsByPack(posts, pack) {
  const terms = packTerms[pack] || [];
  if (!pack || !terms.length) return { posts, terms, pack: pack || 'all', filtered: false };
  const filtered = posts.filter(post => {
    const hay = [post.title, post.body, post.category, post.sourceUrl].join(' ').toLowerCase();
    return terms.some(term => hay.includes(term));
  });
  return { posts: filtered, terms, pack, filtered: true };
}

async function getIndexedPosts(env) {
  const raw = await env.FORUM_POSTS.get('posts:index');
  if (!raw) return [];
  try {
    const posts = JSON.parse(raw);
    return Array.isArray(posts) ? sortPosts(posts.map(safePost)) : [];
  } catch {
    return [];
  }
}

async function listStoredPosts(env, limit = 100) {
  const posts = [];
  let cursor;
  do {
    const listed = await env.FORUM_POSTS.list({ prefix: 'post:', limit: 100, cursor });
    for (const key of listed.keys || []) {
      if (posts.length >= limit) break;
      try {
        const raw = await env.FORUM_POSTS.get(key.name);
        const post = safePost(JSON.parse(raw || 'null'));
        if (post) posts.push(post);
      } catch {}
    }
    cursor = listed.cursor;
    if (listed.list_complete || posts.length >= limit) break;
  } while (cursor);
  return sortPosts(posts);
}

async function savePosts(env, posts) {
  const cleaned = sortPosts((posts || []).map(safePost)).slice(0, 100);
  await env.FORUM_POSTS.put('posts:index', JSON.stringify(cleaned), {
    metadata: { updatedAt: new Date().toISOString(), count: cleaned.length, boardCounts: boardCounts(cleaned), selfHealing: true }
  });
}

async function savePostRecord(env, post) {
  const cleaned = safePost(post);
  if (!cleaned) return null;
  await env.FORUM_POSTS.put(`post:${cleaned.id}`, JSON.stringify(cleaned), {
    metadata: { createdAt: cleaned.createdAt, title: cleaned.title, status: cleaned.status, board: cleaned.board }
  });
  return cleaned;
}

async function getPosts(env, board = 'all') {
  if (!env.FORUM_POSTS) return null;
  const indexed = await getIndexedPosts(env);
  const stored = await listStoredPosts(env, 100);
  const byId = new Map();
  for (const post of [...indexed, ...stored]) if (post && post.id) byId.set(post.id, post);
  const merged = sortPosts([...byId.values()]).slice(0, 100);
  if (merged.length && (stored.length !== indexed.length || merged.length !== indexed.length)) await savePosts(env, merged);
  if (board === 'all') return merged;
  return filterPostsByBoard(merged, board);
}

async function getForumStats(env) {
  if (!env.FORUM_POSTS) return { ok: false, indexCount: 0, storedPostCount: 0, boardCounts: boardCounts([]), persistenceMode: 'missing binding' };
  const indexed = await getIndexedPosts(env);
  const storedList = await env.FORUM_POSTS.list({ prefix: 'post:', limit: 1000 });
  return {
    ok: true,
    indexCount: indexed.length,
    storedPostCount: (storedList.keys || []).length,
    boardCounts: boardCounts(indexed),
    boardLabels,
    indexSelfHealing: true,
    persistenceMode: 'Cloudflare KV FORUM_POSTS: posts:index plus durable post:* records, board-aware filtering active'
  };
}

async function forumExport(env, pack = '', board = 'all') {
  const posts = await getPosts(env, board);
  if (!posts) return null;
  const stats = await getForumStats(env);
  const selected = filterPostsByPack(posts, pack);
  const normalizedBoard = board === 'all' ? 'all' : normalizeBoard(board);
  return {
    ok: true,
    persistent: true,
    source: 'Cloudflare KV FORUM_POSTS',
    generatedAt: new Date().toISOString(),
    indexSelfHealing: true,
    indexCount: stats.indexCount,
    storedPostCount: stats.storedPostCount,
    board: normalizedBoard,
    boardLabel: normalizedBoard === 'all' ? 'All Boards' : boardLabels[normalizedBoard],
    boardCounts: stats.boardCounts,
    count: selected.posts.length,
    totalUnfilteredCount: posts.length,
    pack: selected.pack,
    packFiltered: selected.filtered,
    packTerms: selected.terms,
    boundary: 'Public Signal Board posts are user-submitted public resources. They are not claims verified by Matrix Reprogrammed unless separately source-carded or cited.',
    routes: {
      main: '/forum',
      speculation: '/speculation-board',
      epsteinAlive: '/epstein-alive-board',
      feed: normalizedBoard === 'all' ? '/forum-feed?board=all' : `/forum-feed?board=${normalizedBoard}`,
      json: selected.filtered ? `/downloads/forum-posts.json?board=${normalizedBoard}&pack=${selected.pack}` : `/downloads/forum-posts.json?board=${normalizedBoard}`,
      markdown: selected.filtered ? `/downloads/forum-posts.md?board=${normalizedBoard}&pack=${selected.pack}` : `/downloads/forum-posts.md?board=${normalizedBoard}`
    },
    posts: selected.posts
  };
}

function postsMarkdown(data) {
  const posts = data.posts || [];
  const lines = [
    '# Matrix Reprogrammed Signal Board Posts',
    '',
    `Generated: ${data.generatedAt}`,
    `Source: ${data.source}`,
    `Board: ${data.boardLabel || data.board}`,
    `Pack: ${data.pack}`,
    `Filtered: ${data.packFiltered}`,
    `Posts: ${posts.length}`,
    '',
    '## Boundary',
    '',
    data.boundary,
    ''
  ];
  if (data.packFiltered) lines.push('## Pack Filter', '', `Terms: ${(data.packTerms || []).join(', ')}`, '');
  for (const post of posts) {
    lines.push(`## ${post.title}`, '', `- Date: ${post.createdAt}`, `- Board: ${boardLabels[post.board] || post.board || 'Main Signal Board'}`, `- Category: ${post.category}`, `- Name: ${post.name}`);
    if (post.sourceUrl) lines.push(`- Source: ${post.sourceUrl}`);
    lines.push('', post.body, '');
  }
  return lines.join('\n');
}

async function handleIntroVoice(request, env) {
  if (!env.ELEVENLABS_API_KEY) return safeNotConfigured('ELEVENLABS_API_KEY Cloudflare secret', 'Browser fallback voice can still be used.');
  const body = await readBody(request);
  const text = cleanText(body.text || 'Welcome to Matrix Reprogrammed. Reality is edited. The headline is not the machine. The truth is not hidden. It is encoded.', 900);
  if (text.length < 3) return json({ ok: false, error: 'No intro text provided.' }, 400);
  const voiceId = cleanText(env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb', 120);
  const modelId = cleanText(env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2', 120);
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const eleven = await fetch(endpoint, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.42, similarity_boost: 0.78, style: 0.38, use_speaker_boost: true } })
  });
  if (!eleven.ok) return json({ ok: false, error: 'ElevenLabs request failed', status: eleven.status, details: cleanText(await eleven.text().catch(() => ''), 500) }, 502);
  return new Response(eleven.body, { status: 200, headers: { ...securityHeaders, 'Content-Type': eleven.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'cloudflare-worker-api', 'X-Matrix-Worker': workerName } });
}

async function handleForumPostsJson(request, env, forcedBoard = '') {
  const url = new URL(request.url);
  const board = cleanText(forcedBoard || url.searchParams.get('board') || 'all', 80);
  const data = await forumExport(env, cleanText(url.searchParams.get('pack') || '', 120), board);
  if (!data) return json({ ok: true, configured: false, error: 'FORUM_POSTS KV binding missing', posts: [], worker: workerName, board }, 200);
  return json(data);
}

async function handleForumPostsMarkdown(request, env, forcedBoard = '') {
  const url = new URL(request.url);
  const pack = cleanText(url.searchParams.get('pack') || '', 120);
  const board = cleanText(forcedBoard || url.searchParams.get('board') || 'all', 80);
  const data = await forumExport(env, pack, board);
  if (!data) return markdown('# Forum Posts Export\n\nFORUM_POSTS KV binding missing.\n', 'forum-posts.md');
  const suffix = [board && board !== 'all' ? normalizeBoard(board) : '', pack].filter(Boolean).join('-');
  return markdown(postsMarkdown(data), suffix ? `forum-posts-${suffix}.md` : 'forum-posts.md');
}

async function handleForumHealth(env) {
  const hasForumPostsBinding = Boolean(env.FORUM_POSTS);
  const stats = hasForumPostsBinding ? await getForumStats(env) : { ok: false, indexCount: 0, storedPostCount: 0, boardCounts: boardCounts([]), persistenceMode: 'missing binding' };
  return json({
    ok: true,
    worker: workerName,
    backend: 'src/worker.js',
    assetBinding: Boolean(env.ASSETS),
    assetMode: 'Cloudflare bundled ASSETS binding first, no Pages origin fallback',
    forumPostsBinding: hasForumPostsBinding ? 'connected' : 'missing',
    bindingHealthy: hasForumPostsBinding,
    kvBindingName: 'FORUM_POSTS',
    expectedKvNamespaceTitle: 'matrixreprogrammed-forum-posts',
    expectedKvNamespaceId: '99996d87016d4285a833707cbda5232f',
    persistence: stats.persistenceMode || 'missing binding',
    indexSelfHealing: Boolean(stats.indexSelfHealing),
    indexCount: stats.indexCount,
    storedPostCount: stats.storedPostCount,
    boardAware: true,
    boardLabels,
    boardCounts: stats.boardCounts,
    publicRouteAliases: Object.keys(routeAliases).length,
    hardBoardRoutes: Object.keys(hardBoardRouteMap),
    deployedFrom: 'GitHub main',
    updatedAt
  }, 200);
}

async function handleForumFeed(request, env, forcedBoard = '') {
  const url = new URL(request.url);
  const board = cleanText(forcedBoard || url.searchParams.get('board') || 'main', 80);
  const posts = await getPosts(env, board);
  const normalizedBoard = normalizeBoard(board);
  if (!posts) return json({ ok: true, configured: false, error: 'FORUM_POSTS KV binding missing', posts: [], board: normalizedBoard, boardLabel: boardLabels[normalizedBoard], worker: workerName }, 200);
  return json({ ok: true, persistent: true, source: 'Cloudflare KV FORUM_POSTS', board: normalizedBoard, boardLabel: boardLabels[normalizedBoard], selfHealingIndex: true, posts: posts.slice(0, 60) });
}

async function handleSubmitForumPost(request, env, forcedBoard = '') {
  if (!env.FORUM_POSTS) return safeNotConfigured('FORUM_POSTS KV binding');
  const body = await readBody(request);
  if (body.website) return json({ ok: false, error: 'Spam trap triggered' }, 400);
  const board = normalizeBoard(forcedBoard || body.board || inferBoardFromPost(body));
  const title = cleanText(body.title, 140);
  const message = cleanText(body.body || body.message, 1800);
  if (title.length < 3 || message.length < 10) return json({ ok: false, error: 'Signal needs a title and a useful body.' }, 400);
  const sourceUrl = cleanText(body.sourceUrl || body.source || '', 500);
  const post = await savePostRecord(env, {
    id: makeId(),
    board,
    title,
    body: message,
    category: cleanText(body.category || 'Signal', 80),
    name: cleanText(body.name || 'Anonymous', 80),
    sourceUrl: /^https?:\/\//i.test(sourceUrl) ? sourceUrl : '',
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    status: 'live'
  });
  const posts = await getPosts(env, 'all') || [];
  if (!posts.some(item => item.id === post.id)) posts.unshift(post);
  await savePosts(env, posts);
  return json({ ok: true, persistent: true, storage: 'Cloudflare KV FORUM_POSTS', board, boardLabel: boardLabels[board], post });
}

async function handleReportForumPost(request, env, forcedBoard = '') {
  if (!env.FORUM_POSTS) return safeNotConfigured('FORUM_POSTS KV binding');
  const body = await readBody(request);
  const board = normalizeBoard(forcedBoard || body.board || 'main');
  const report = { id: makeId(), board, postId: cleanText(body.id || body.postId, 120), reason: cleanText(body.reason, 1000), createdAt: new Date().toISOString() };
  if (!report.postId || !report.reason) return json({ ok: false, error: 'Report needs a post id and reason.' }, 400);
  await env.FORUM_POSTS.put(`report:${report.id}`, JSON.stringify(report), { metadata: { board, postId: report.postId } });
  return json({ ok: true, reportId: report.id, board });
}

async function handleTrackEvent(request, env) {
  const body = await readBody(request);
  const event = {
    id: makeId(),
    name: cleanText(body.name || 'event', 80),
    route: cleanText(body.route || '', 120),
    page: cleanText(body.page || '', 240),
    title: cleanText(body.title || '', 240),
    href: cleanText(body.href || '', 500),
    text: cleanText(body.text || '', 180),
    host: cleanText(body.host || '', 180),
    form: cleanText(body.form || '', 120),
    createdAt: new Date().toISOString()
  };
  if (env.FORUM_POSTS) await env.FORUM_POSTS.put(`analytics:${event.id}`, JSON.stringify(event), { expirationTtl: 60 * 60 * 24 * 45, metadata: { name: event.name, route: event.route, page: event.page } });
  return new Response(null, { status: 204, headers: { ...securityHeaders, 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'cloudflare-worker-api', 'X-Matrix-Worker': workerName } });
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
  if (!routedPath.endsWith('/')) {
    add(`${routedPath}.html`);
    add(`${routedPath}/index.html`);
  }
  if (routedPath.endsWith('/')) {
    add(`${routedPath}index.html`);
    add(`${routedPath.replace(/\/$/, '')}.html`);
  }
  add('/404.html');
  return candidates;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const originalPath = url.pathname;
      const normalizedPath = originalPath.length > 1 ? originalPath.replace(/\/+$/, '') : originalPath;
      const routedPath = routeAliases[originalPath] || routeAliases[normalizedPath] || originalPath;

      if (isHostileProbePath(originalPath)) return json({ ok: false, error: 'Rejected hostile probe path', path: originalPath }, 404);
      if (request.method === 'OPTIONS' && ['/track-event', '/.netlify/functions/track-event', '/intro-voice'].includes(originalPath)) return new Response(null, { status: 204, headers: { ...securityHeaders, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' } });

      if (request.method === 'POST' && originalPath === '/intro-voice') return handleIntroVoice(request, env);
      if (request.method === 'GET' && originalPath === '/forum-health') return handleForumHealth(env);
      if (request.method === 'GET' && originalPath === '/forum-feed') return handleForumFeed(request, env);
      if (request.method === 'GET' && (originalPath === '/downloads/forum-posts.json' || originalPath === '/forum-posts.json')) return handleForumPostsJson(request, env);
      if (request.method === 'GET' && (originalPath === '/downloads/forum-posts.md' || originalPath === '/forum-posts.md')) return handleForumPostsMarkdown(request, env);
      if (request.method === 'POST' && originalPath === '/submit-forum-post') return handleSubmitForumPost(request, env);
      if (request.method === 'POST' && originalPath === '/report-forum-post') return handleReportForumPost(request, env);
      if (request.method === 'POST' && (originalPath === '/track-event' || originalPath === '/.netlify/functions/track-event')) return handleTrackEvent(request, env);

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
