const { getStore } = require('@netlify/blobs');

const CATEGORIES = new Set(['Source Drop','Book Question','Intel Desk Tip','D.O.G Symbol Question','War File / Human Cost','Crime-State Overlap','Reader Review']);
const BLOCKED = [
  /\bkill\b/i,
  /\bdoxx/i,
  /\baddress\s+is\b/i,
  /\bphone\s+number\b/i,
  /\bprivate victim\b/i,
  /\bchild porn\b/i,
  /\bcsam\b/i
];

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

function validUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return '';
    return url.href.slice(0, 500);
  } catch { return ''; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const category = clean(payload.category, 80);
  const name = clean(payload.name || 'Anonymous', 80) || 'Anonymous';
  const title = clean(payload.title, 140);
  const body = clean(payload.body, 2400);
  const sourceUrl = validUrl(clean(payload.sourceUrl, 500));
  const honeypot = clean(payload.website, 100);

  if (honeypot) return json(200, { ok: true, status: 'received' });
  if (!CATEGORIES.has(category)) return json(400, { error: 'Choose a valid category.' });
  if (title.length < 5) return json(400, { error: 'Title is too short.' });
  if (body.length < 20) return json(400, { error: 'Message is too short.' });

  const combined = `${title} ${body}`;
  if (BLOCKED.some(rx => rx.test(combined))) return json(400, { error: 'Submission needs safer wording before review.' });

  const post = {
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    category,
    name,
    title,
    body,
    sourceUrl,
    status: 'pending',
    createdAt: new Date().toISOString(),
    ua: clean(event.headers['user-agent'] || '', 200)
  };

  const store = getStore('matrix-forum');
  const pending = await store.get('pending-posts.json', { type: 'json' }) || [];
  pending.unshift(post);
  await store.setJSON('pending-posts.json', pending.slice(0, 1000));

  return json(202, { ok: true, status: 'pending_review', id: post.id });
};
