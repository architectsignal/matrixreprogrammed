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
    const report = {
      id: crypto.randomUUID(),
      postId: clean(data.id || data.postId, 120),
      reason: clean(data.reason, 500),
      createdAt: new Date().toISOString()
    };

    const existing = await env.FORUM_POSTS.get('reports') || '[]';
    const reports = JSON.parse(existing);
    reports.unshift(report);
    if (reports.length > 200) reports.length = 200;

    await env.FORUM_POSTS.put('reports', JSON.stringify(reports));
    return new Response(JSON.stringify({ success: true, report }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers, status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers, status: 204 });
}
