const { openForumStore, forumStorageError } = require('./_forum-store');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: JSON.stringify(body) };
}

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    let payload;
    try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const id = clean(payload.id, 80);
    const reason = clean(payload.reason, 800);
    if (!id || reason.length < 5) return json(400, { error: 'Report needs a post id and reason.' });

    const store = openForumStore();
    const reports = await store.get('reported-posts.json', { type: 'json' }) || [];
    reports.unshift({ id, reason, createdAt: new Date().toISOString(), ua: clean((event.headers && event.headers['user-agent']) || '', 200) });
    await store.setJSON('reported-posts.json', reports.slice(0, 1000));

    return json(202, { ok: true, status: 'reported' });
  } catch (err) {
    return json(500, forumStorageError(err));
  }
};
