const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const id = clean(payload.id, 80);
  const reason = clean(payload.reason, 800);
  if (!id || reason.length < 5) return json(400, { error: 'Report needs a post id and reason.' });

  const store = getStore('matrix-forum');
  const reports = await store.get('reported-posts.json', { type: 'json' }) || [];
  reports.unshift({ id, reason, createdAt: new Date().toISOString(), ua: clean(event.headers['user-agent'] || '', 200) });
  await store.setJSON('reported-posts.json', reports.slice(0, 1000));

  return json(202, { ok: true, status: 'reported' });
};
