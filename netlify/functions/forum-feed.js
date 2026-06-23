const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
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
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const store = getStore('matrix-forum');
  const approved = await store.get('approved-posts.json', { type: 'json' }) || [];
  const posts = Array.isArray(approved) ? approved.slice(0, 50).map(publicPost) : [];
  return json(200, { posts });
};
