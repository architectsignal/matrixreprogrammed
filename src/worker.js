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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: jsonHeaders });
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

async function getPosts(env) {
  if (!env.FORUM_POSTS) return null;
  const raw = await env.FORUM_POSTS.get('posts:index');
  if (!raw) return [];
  try {
    const posts = JSON.parse(raw);
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

async function savePosts(env, posts) {
  await env.FORUM_POSTS.put('posts:index', JSON.stringify(posts.slice(0, 100)), {
    metadata: { updatedAt: new Date().toISOString() }
  });
}

function handleForumHealth(env) {
  const hasForumPostsBinding = Boolean(env.FORUM_POSTS);
  return json({
    ok: hasForumPostsBinding,
    worker: 'matrixreprogrammed',
    backend: 'src/worker.js',
    forumPostsBinding: hasForumPostsBinding ? 'connected' : 'missing',
    kvBindingName: 'FORUM_POSTS',
    expectedKvNamespaceTitle: 'matrixreprogrammed-forum-posts',
    routes: ['/forum-feed', '/submit-forum-post', '/report-forum-post', '/track-event'],
    publicRouteAliases: Object.keys(routeAliases).length,
    deployedFrom: 'GitHub main',
    updatedAt: '2026-06-26T00:00:00.000Z'
  }, hasForumPostsBinding ? 200 : 503);
}

async function handleForumFeed(env) {
  const posts = await getPosts(env);
  if (!posts) return json({ ok: false, error: 'FORUM_POSTS KV binding missing', posts: [] }, 503);
  return json({ ok: true, posts: posts.slice(0, 60) });
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
  const post = {
    id: makeId(),
    title,
    body: message,
    category: cleanText(body.category || 'Signal', 80),
    name: cleanText(body.name || 'Anonymous', 80),
    sourceUrl: safeSource,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    status: 'live'
  };
  const posts = await getPosts(env) || [];
  posts.unshift(post);
  await savePosts(env, posts);
  await env.FORUM_POSTS.put(`post:${post.id}`, JSON.stringify(post));
  return json({ ok: true, post });
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
