const { getStore } = require('@netlify/blobs');

const CATEGORIES = new Set(['Source Drop','Book Question','Intel Desk Tip','D.O.G Symbol Question','War File / Human Cost','Crime-State Overlap','Reader Review']);
const HARD_BLOCKED = [
  /\bi\s+will\s+harm\b/i,
  /\bgoing\s+to\s+harm\b/i,
  /\bdoxx/i,
  /\bhome\s+address\b/i,
  /\baddress\s+is\b/i,
  /\bphone\s+number\b/i,
  /\bprivate\s+victim\b/i,
  /\bcredit\s+card\s+number\b/i,
  /\bsocial\s+security\s+number\b/i,
  /\billegal\s+material\b/i
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
  if (HARD_BLOCKED.some(rx => rx.test(combined))) return json(400, { error: 'Blocked by the hard legal/safety floor.' });

  const post = {
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    category,
    name,
    title,
    body,
    sourceUrl,
    status: 'public',
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    ua: clean(event.headers['user-agent'] || '', 200)
  };

  const store = getStore('matrix-forum');
  const approved = await store.get('approved-posts.json', { type: 'json' }) || [];
  approved.unshift(post);
  await store.setJSON('approved-posts.json', approved.slice(0, 500));

  return json(201, { ok: true, status: 'public', id: post.id });
};
