const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originalPath = url.pathname;

    if (request.method === 'GET' && originalPath === '/forum-feed') return handleForumFeed(env);
    if (request.method === 'POST' && originalPath === '/submit-forum-post') return handleSubmitForumPost(request, env);
    if (request.method === 'POST' && originalPath === '/report-forum-post') return handleReportForumPost(request, env);

    const tryAsset = async (pathname) => {
      const nextUrl = new URL(request.url);
      nextUrl.pathname = pathname;
      return env.ASSETS.fetch(new Request(nextUrl, request));
    };

    let response = await tryAsset(originalPath);
    if (response.status !== 404) return response;

    if (!originalPath.endsWith('/')) {
      response = await tryAsset(`${originalPath}.html`);
      if (response.status !== 404) return response;

      response = await tryAsset(`${originalPath}/index.html`);
      if (response.status !== 404) return response;
    }

    if (originalPath.endsWith('/')) {
      response = await tryAsset(`${originalPath}index.html`);
      if (response.status !== 404) return response;

      const trimmed = originalPath.replace(/\/$/, '');
      response = await tryAsset(`${trimmed}.html`);
      if (response.status !== 404) return response;
    }

    return tryAsset('/404.html');
  }
};
