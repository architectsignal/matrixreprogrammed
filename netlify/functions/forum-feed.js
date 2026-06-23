const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function publicPost(post) {
  return {
    id: post.id,
    category: post.category,
    name: post.name || 'Anonymous',
    title: post.title,
    body: post.body,
    sourceUrl: post.sourceUrl || '',
    createdAt: post.createdAt,
    approvedAt: post.approvedAt
  };
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const store = getStore('matrix-forum');
    let approved = [];
    try {
      const existing = await store.get('approved-posts.json', { type: 'json' });
      approved = Array.isArray(existing) ? existing : [];
    } catch {
      approved = [];
    }
    const posts = approved.slice(0, 50).map(publicPost);
    return json(200, { posts });
  } catch (err) {
    return json(500, { error: `Forum feed error: ${err.message || 'unknown error'}` });
  }
};
