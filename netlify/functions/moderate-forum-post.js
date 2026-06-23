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
  const action = clean(payload.action, 20).toLowerCase();
  if (!id || !['approve','reject'].includes(action)) return json(400, { error: 'Use id plus action approve or reject.' });

  const store = getStore('matrix-forum');
  const pending = await store.get('pending-posts.json', { type: 'json' }) || [];
  const index = pending.findIndex(post => post.id === id);
  if (index < 0) return json(404, { error: 'Pending post not found.' });

  const [post] = pending.splice(index, 1);
  post.status = action === 'approve' ? 'approved' : 'rejected';
  post.moderatedAt = new Date().toISOString();

  if (action === 'approve') {
    post.approvedAt = post.moderatedAt;
    const approved = await store.get('approved-posts.json', { type: 'json' }) || [];
    approved.unshift(post);
    await store.setJSON('approved-posts.json', approved.slice(0, 500));
  } else {
    const rejected = await store.get('rejected-posts.json', { type: 'json' }) || [];
    rejected.unshift(post);
    await store.setJSON('rejected-posts.json', rejected.slice(0, 500));
  }

  await store.setJSON('pending-posts.json', pending.slice(0, 1000));
  return json(200, { ok: true, action, id });
};
