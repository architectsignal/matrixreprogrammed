const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const secret = process.env.FORUM_MOD_SECRET;
  const provided = event.headers['x-forum-secret'] || (event.queryStringParameters || {}).secret || '';
  if (!secret || provided !== secret) return json(401, { error: 'Unauthorized' });

  const store = getStore('matrix-forum');
  const pending = await store.get('pending-posts.json', { type: 'json' }) || [];
  return json(200, { pending: Array.isArray(pending) ? pending.slice(0, 200) : [] });
};
