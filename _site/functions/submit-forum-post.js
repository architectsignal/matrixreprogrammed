const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.FORUM_POSTS) throw new Error('FORUM_POSTS KV binding is not configured');
    const data = await request.json();

    if (clean(data.website, 200)) {
      return new Response(JSON.stringify({ error: 'Spam trap triggered' }), { headers, status: 400 });
    }

    const body = clean(data.body || data.message, 2400);
    const title = clean(data.title || body.slice(0, 80) || 'Signal', 160);
    if (!body) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { headers, status: 400 });
    }

    const post = {
      id: crypto.randomUUID(),
      name: clean(data.name || 'Anonymous', 80) || 'Anonymous',
      category: clean(data.category || 'Signal', 80) || 'Signal',
      title,
      body,
      message: body,
      sourceUrl: clean(data.sourceUrl, 500),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString()
    };

    const existing = await env.FORUM_POSTS.get('posts') || '[]';
    const posts = JSON.parse(existing);
    posts.unshift(post);
    if (posts.length > 100) posts.length = 100;

    await env.FORUM_POSTS.put('posts', JSON.stringify(posts));
    return new Response(JSON.stringify({ success: true, post }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers, status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers, status: 204 });
}
