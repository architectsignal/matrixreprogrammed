const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const secret = process.env.FORUM_MOD_SECRET;
  const provided = event.headers['x-forum-secret'] || (event.queryStringParameters || {}).secret || '';
  if (!secret || provided !== secret) return json(401, { error: 'Unauthorized' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const id = clean(payload.id, 80);
  const note = clean(payload.note || 'hidden by site owner', 400);
  if (!id) return json(400, { error: 'Post id required.' });

  const store = getStore('matrix-forum');
  const publicPosts = await store.get('approved-posts.json', { type: 'json' }) || [];
  const index = publicPosts.findIndex(post => post.id === id);
  if (index < 0) return json(404, { error: 'Public post not found.' });

  const [post] = publicPosts.splice(index, 1);
  post.status = 'hidden';
  post.hiddenAt = new Date().toISOString();
  post.ownerNote = note;

  const hidden = await store.get('hidden-posts.json', { type: 'json' }) || [];
  hidden.unshift(post);
  await store.setJSON('approved-posts.json', publicPosts.slice(0, 500));
  await store.setJSON('hidden-posts.json', hidden.slice(0, 1000));

  return json(200, { ok: true, id });
};
