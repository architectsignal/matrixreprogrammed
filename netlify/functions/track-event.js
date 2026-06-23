exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const safeEvent = {
      name: String(payload.name || 'event').slice(0, 80),
      page: String(payload.page || '').slice(0, 220),
      route: String(payload.route || '').slice(0, 80),
      href: String(payload.href || '').slice(0, 420),
      host: String(payload.host || '').slice(0, 160),
      text: String(payload.text || '').slice(0, 160),
      form: String(payload.form || '').slice(0, 120),
      at: new Date().toISOString(),
      ua: String(event.headers['user-agent'] || '').slice(0, 220),
      ref: String(event.headers.referer || event.headers.referrer || '').slice(0, 420)
    };

    console.log('MR_ANALYTICS_EVENT', JSON.stringify(safeEvent));

    return {
      statusCode: 204,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  } catch (error) {
    console.log('MR_ANALYTICS_ERROR', error.message);
    return { statusCode: 400, body: 'Bad request' };
  }
};
