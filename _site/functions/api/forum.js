const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function getStore(env) {
  if (!env || !env.FORUM_POSTS) throw new Error('FORUM_POSTS KV binding is not configured');
  return env.FORUM_POSTS;
}

async function readList(store, key) {
  const raw = await store.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(store, key, items, max = 100) {
  await store.put(key, JSON.stringify(items.slice(0, max)));
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: jsonHeaders, status: 204 });
  }

  try {
    const store = getStore(env);

    if (request.method === 'GET') {
      const posts = await readList(store, 'posts');
      return json({ success: true, posts });
    }

    if (request.method === 'POST') {
      const data = await request.json();

      if (data.action === 'report') {
        const reports = await readList(store, 'reports');
        const report = {
          id: crypto.randomUUID(),
          postId: clean(data.id, 120),
          reason: clean(data.reason, 500),
          createdAt: new Date().toISOString()
        };
        reports.unshift(report);
        await writeList(store, 'reports', reports, 200);
        return json({ success: true, report });
      }

      if (clean(data.website, 200)) {
        return json({ error: 'Spam trap triggered' }, 400);
      }

      const body = clean(data.body || data.message, 2400);
      const title = clean(data.title || body.slice(0, 80) || 'Signal', 160);
      if (!body) return json({ error: 'Message is required' }, 400);

      const post = {
        id: crypto.randomUUID(),
        name: clean(data.name || 'Anonymous', 80) || 'Anonymous',
        category: clean(data.category || 'Signal', 80) || 'Signal',
        title,
        body,
        sourceUrl: clean(data.sourceUrl, 500),
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString()
      };

      const posts = await readList(store, 'posts');
      posts.unshift(post);
      await writeList(store, 'posts', posts, 100);

      return json({ success: true, post, posts });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: err && err.message ? err.message : 'Forum API error' }, 500);
  }
}
