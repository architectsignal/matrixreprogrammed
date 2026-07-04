const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers, status: 405 });
  }

  try {
    if (!env.FORUM_POSTS) throw new Error('FORUM_POSTS KV binding is not configured');
    const posts = await env.FORUM_POSTS.get('posts') || '[]';
    return new Response(posts, { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers, status: 500 });
  }
}
