const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers, status: 204 });
  if (request.method !== 'GET') return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { headers, status: 405 });

  const hasBinding = Boolean(env && env.FORUM_POSTS);
  const result = {
    ok: false,
    route: '/forum-health',
    hasForumPostsBinding: hasBinding,
    checkedAt: new Date().toISOString()
  };

  if (!hasBinding) {
    result.error = 'FORUM_POSTS binding is missing from this deployment';
    return new Response(JSON.stringify(result, null, 2), { headers, status: 500 });
  }

  try {
    const existing = await env.FORUM_POSTS.get('posts');
    result.ok = true;
    result.canReadPosts = true;
    result.postsValueType = existing ? 'stored-json' : 'empty';
    return new Response(JSON.stringify(result, null, 2), { headers, status: 200 });
  } catch (err) {
    result.error = err && err.message ? err.message : 'KV read failed';
    return new Response(JSON.stringify(result, null, 2), { headers, status: 500 });
  }
}
