const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const routeAliases = {
  '/home': '/index.html',
  '/start': '/start-here.html',
  '/search': '/search.html',
  '/forum': '/forum.html',
  '/signal-board': '/forum.html',
  '/books': '/books.html',
  '/deploy-status': '/deploy-status.html',
  '/live-intel': '/live-intel.html',
  '/epstein': '/epstein-files.html',
  '/evidence-vault': '/evidence-vault.html',
  '/power-atlas': '/power-atlas.html',
  '/book-universe': '/book-universe.html',
  '/answer-engine': '/answer-engine.html',
  '/ai-answers': '/answer-engine.html',
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
  '/newsletter': '/optin-center.html',
  '/amazon-store': '/amazon-store-books.html'
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
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
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

function makeId() {
  return `signal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safePost(post) {
  if (!post || typeof post !== 'object') return null;
  const id = cleanText(post.id, 140);
  const title = cleanText(post.title, 180);
  const body = cleanText(post.body || post.message, 2200);
  if (!id || !title || !body) return null;
  return {
    id,
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
  return posts
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || b.approvedAt || 0) - new Date(a.createdAt || a.approvedAt || 0));
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

async function getForumStats(env) {
  if (!env.FORUM_POSTS) return { ok: false, indexCount: 0, storedPostCount: 0 };
  const indexed = await getIndexedPosts(env);
  const storedList = await env.FORUM_POSTS.list({ prefix: 'post:', limit: 1000 });
  return {
    ok: true,
    indexCount: indexed.length,
    storedPostCount: (storedList.keys || []).length,
    indexSelfHealing: true,
    persistenceMode: 'Cloudflare KV FORUM_POSTS: posts:index plus durable post:* records'
  };
}

async function getPosts(env) {
  if (!env.FORUM_POSTS) return null;
  const indexed = await getIndexedPosts(env);
  const stored = await listStoredPosts(env, 100);
  const byId = new Map();
  for (const post of [...indexed, ...stored]) {
    if (post && post.id) byId.set(post.id, post);
  }
  const merged = sortPosts([...byId.values()]).slice(0, 100);
  if (merged.length && (stored.length !== indexed.length || merged.length !== indexed.length)) {
    await savePosts(env, merged);
  }
  return merged;
}

async function savePosts(env, posts) {
  const cleaned = sortPosts((posts || []).map(safePost)).slice(0, 100);
  await env.FORUM_POSTS.put('posts:index', JSON.stringify(cleaned), {
    metadata: { updatedAt: new Date().toISOString(), count: cleaned.length, selfHealing: true }
  });
}

async function savePostRecord(env, post) {
  const cleaned = safePost(post);
  if (!cleaned) return null;
  await env.FORUM_POSTS.put(`post:${cleaned.id}`, JSON.stringify(cleaned), {
    metadata: { createdAt: cleaned.createdAt, title: cleaned.title, status: cleaned.status }
  });
  return cleaned;
}

async function forumExport(env, pack = '') {
  const posts = await getPosts(env);
  if (!posts) return null;
  const stats = await getForumStats(env);
  const selected = filterPostsByPack(posts, pack);
  return {
    ok: true,
    persistent: true,
    source: 'Cloudflare KV FORUM_POSTS',
    generatedAt: new Date().toISOString(),
    indexSelfHealing: true,
    indexCount: stats.indexCount,
    storedPostCount: stats.storedPostCount,
    count: selected.posts.length,
    totalUnfilteredCount: posts.length,
    pack: selected.pack,
    packFiltered: selected.filtered,
    packTerms: selected.terms,
    boundary: 'Public Signal Board posts are user-submitted public resources. They are not claims verified by Matrix Reprogrammed unless separately source-carded or cited.',
    routes: {
      forum: '/forum',
      feed: '/forum-feed',
      json: selected.filtered ? `/downloads/forum-posts.json?pack=${selected.pack}` : '/downloads/forum-posts.json',
      markdown: selected.filtered ? `/downloads/forum-posts.md?pack=${selected.pack}` : '/downloads/forum-posts.md'
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
    `Pack: ${data.pack}`,
    `Filtered: ${data.packFiltered}`,
    `Posts: ${posts.length}`,
    '',
    '## Boundary',
    '',
    data.boundary,
    ''
  ];
  if (data.packFiltered) {
    lines.push('## Pack Filter');
    lines.push('');
    lines.push(`Terms: ${(data.packTerms || []).join(', ')}`);
    lines.push('');
  }
  for (const post of posts) {
    lines.push(`## ${post.title}`);
    lines.push('');
    lines.push(`- Date: ${post.createdAt}`);
    lines.push(`- Category: ${post.category}`);
    lines.push(`- Name: ${post.name}`);
    if (post.sourceUrl) lines.push(`- Source: ${post.sourceUrl}`);
    lines.push('');
    lines.push(post.body);
    lines.push('');
  }
  return lines.join('\n');
}

async function handleForumPostsJson(request, env) {
  const url = new URL(request.url);
  const data = await forumExport(env, cleanText(url.searchParams.get('pack') || '', 120));
  if (!data) return json({ ok: false, error: 'FORUM_POSTS KV binding missing', posts: [] }, 503);
  return json(data);
}

async function handleForumPostsMarkdown(request, env) {
  const url = new URL(request.url);
  const pack = cleanText(url.searchParams.get('pack') || '', 120);
  const data = await forumExport(env, pack);
  if (!data) return markdown('# Forum Posts Export\n\nFORUM_POSTS KV binding missing.\n', 'forum-posts.md');
  return markdown(postsMarkdown(data), pack ? `forum-posts-${pack}.md` : 'forum-posts.md');
}

async function handleForumHealth(env) {
  const hasForumPostsBinding = Boolean(env.FORUM_POSTS);
  const stats = hasForumPostsBinding ? await getForumStats(env) : { ok: false, indexCount: 0, storedPostCount: 0 };
  return json({
    ok: hasForumPostsBinding,
    worker: 'matrixreprogrammed',
    backend: 'src/worker.js',
    forumPostsBinding: hasForumPostsBinding ? 'connected' : 'missing',
    kvBindingName: 'FORUM_POSTS',
    expectedKvNamespaceTitle: 'matrixreprogrammed-forum-posts',
    expectedKvNamespaceId: '99996d87016d4285a833707cbda5232f',
    persistence: stats.persistenceMode || 'missing binding',
    indexSelfHealing: Boolean(stats.indexSelfHealing),
    indexCount: stats.indexCount,
    storedPostCount: stats.storedPostCount,
    routes: ['/forum-feed', '/submit-forum-post', '/report-forum-post', '/track-event', '/downloads/forum-posts.json', '/downloads/forum-posts.md', '/downloads/forum-posts.json?pack=black-file-starter'],
    publicRouteAliases: Object.keys(routeAliases).length,
    deployedFrom: 'GitHub main',
    updatedAt: '2026-06-26T00:00:00.000Z'
  }, hasForumPostsBinding ? 200 : 503);
}

async function handleForumFeed(env) {
  const posts = await getPosts(env);
  if (!posts) return json({ ok: false, error: 'FORUM_POSTS KV binding missing', posts: [] }, 503);
  return json({ ok: true, persistent: true, source: 'Cloudflare KV FORUM_POSTS', selfHealingIndex: true, posts: posts.slice(0, 60) });
}

async function handleSubmitForumPost(request, env) {
  if (!env.FORUM_POSTS) return json({ ok: false, error: 'FORUM_POSTS KV binding missing' }, 503);
  const body = await readBody(request);
  if (body.website) return json({ ok: false, error: 'Spam trap triggered' }, 400);
  const title = cleanText(body.title, 140);
  const message = cleanText(body.body || body.message, 1800);
  if (title.length < 3 || message.length < 10) return json({ ok: false, error: 'Signal needs a title and a useful body.' }, 400);
  const sourceUrl = cleanText(body.sourceUrl || body.source || '', 500);
  const safeSource = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : '';
  const post = await savePostRecord(env, {
    id: makeId(),
    title,
    body: message,
    category: cleanText(body.category || 'Signal', 80),
    name: cleanText(body.name || 'Anonymous', 80),
    sourceUrl: safeSource,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    status: 'live'
  });
  const posts = await getPosts(env) || [];
  if (!posts.some(item => item.id === post.id)) posts.unshift(post);
  await savePosts(env, posts);
  return json({ ok: true, persistent: true, storage: 'Cloudflare KV FORUM_POSTS', post });
}

async function handleReportForumPost(request, env) {
  if (!env.FORUM_POSTS) return json({ ok: false, error: 'FORUM_POSTS KV binding missing' }, 503);
  const body = await readBody(request);
  const report = {
    id: makeId(),
    postId: cleanText(body.id || body.postId, 120),
    reason: cleanText(body.reason, 1000),
    createdAt: new Date().toISOString()
  };
  if (!report.postId || !report.reason) return json({ ok: false, error: 'Report needs a post id and reason.' }, 400);
  await env.FORUM_POSTS.put(`report:${report.id}`, JSON.stringify(report));
  return json({ ok: true, reportId: report.id });
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
  if (env.FORUM_POSTS) {
    await env.FORUM_POSTS.put(`analytics:${event.id}`, JSON.stringify(event), {
      expirationTtl: 60 * 60 * 24 * 45,
      metadata: { name: event.name, route: event.route, page: event.page }
    });
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originalPath = url.pathname;
    const normalizedPath = originalPath.length > 1 ? originalPath.replace(/\/+$/, '') : originalPath;
    const routedPath = routeAliases[originalPath] || routeAliases[normalizedPath] || originalPath;

    if (request.method === 'OPTIONS' && (originalPath === '/track-event' || originalPath === '/.netlify/functions/track-event')) return new Response(null, { status: 204 });
    if (request.method === 'GET' && originalPath === '/forum-health') return handleForumHealth(env);
    if (request.method === 'GET' && originalPath === '/forum-feed') return handleForumFeed(env);
    if (request.method === 'GET' && (originalPath === '/downloads/forum-posts.json' || originalPath === '/forum-posts.json')) return handleForumPostsJson(request, env);
    if (request.method === 'GET' && (originalPath === '/downloads/forum-posts.md' || originalPath === '/forum-posts.md')) return handleForumPostsMarkdown(request, env);
    if (request.method === 'POST' && originalPath === '/submit-forum-post') return handleSubmitForumPost(request, env);
    if (request.method === 'POST' && originalPath === '/report-forum-post') return handleReportForumPost(request, env);
    if (request.method === 'POST' && (originalPath === '/track-event' || originalPath === '/.netlify/functions/track-event')) return handleTrackEvent(request, env);

    const tryAsset = async (pathname) => {
      const nextUrl = new URL(request.url);
      nextUrl.pathname = pathname;
      return env.ASSETS.fetch(new Request(nextUrl, request));
    };

    let response = await tryAsset(routedPath);
    if (response.status !== 404) return response;

    if (routedPath !== originalPath) {
      response = await tryAsset(originalPath);
      if (response.status !== 404) return response;
    }

    if (!routedPath.endsWith('/')) {
      response = await tryAsset(`${routedPath}.html`);
      if (response.status !== 404) return response;

      response = await tryAsset(`${routedPath}/index.html`);
      if (response.status !== 404) return response;
    }

    if (routedPath.endsWith('/')) {
      response = await tryAsset(`${routedPath}index.html`);
      if (response.status !== 404) return response;

      const trimmed = routedPath.replace(/\/$/, '');
      response = await tryAsset(`${trimmed}.html`);
      if (response.status !== 404) return response;
    }

    return tryAsset('/404.html');
  }
};
