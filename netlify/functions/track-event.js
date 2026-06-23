const { getStore } = require('@netlify/blobs');

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function safeString(value, max = 200) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const now = new Date();
    const safeEvent = {
      name: safeString(payload.name || 'event', 80),
      page: safeString(payload.page || '', 220),
      route: safeString(payload.route || '', 80),
      title: safeString(payload.title || '', 160),
      href: safeString(payload.href || '', 420),
      host: safeString(payload.host || '', 160),
      text: safeString(payload.text || '', 160),
      form: safeString(payload.form || '', 120),
      at: now.toISOString(),
      ua: safeString(event.headers['user-agent'] || '', 220),
      ref: safeString(event.headers.referer || event.headers.referrer || '', 420)
    };

    const store = getStore('matrix-analytics');
    const key = `events-${dayKey(now)}.json`;
    let events = [];
    const existing = await store.get(key, { type: 'json' });
    if (Array.isArray(existing)) events = existing;
    events.push(safeEvent);
    events = events.slice(-5000);
    await store.setJSON(key, events);

    console.log('MR_ANALYTICS_EVENT', JSON.stringify(safeEvent));
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  } catch (error) {
    console.log('MR_ANALYTICS_ERROR', error.message);
    return { statusCode: 400, body: 'Bad request' };
  }
};
