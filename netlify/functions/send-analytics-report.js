const { getStore } = require('@netlify/blobs');

exports.config = { schedule: '5 8 * * *' };

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return dayKey(date);
}

function countBy(events, field) {
  const counts = new Map();
  for (const event of events) {
    const key = event[field] || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function topLines(title, rows, limit = 10) {
  const lines = [`\n${title}`];
  if (!rows.length) lines.push('- none');
  for (const [name, count] of rows.slice(0, limit)) lines.push(`- ${count} × ${name}`);
  return lines.join('\n');
}

function buildReport(date, events) {
  const eventCounts = countBy(events, 'name');
  const pageCounts = countBy(events.filter(e => e.name === 'page_view'), 'page');
  const routeCounts = countBy(events, 'route');
  const amazonClicks = events.filter(e => e.name === 'amazon_click');
  const rumbleClicks = events.filter(e => e.name === 'rumble_click');
  const blackFileClicks = events.filter(e => e.name === 'black_file_click');
  const formSubmits = events.filter(e => e.name === 'form_submit');
  const outbound = events.filter(e => /_click$/.test(e.name));

  return [
    `Matrix Reprogrammed Analytics Report — ${date}`,
    '',
    `Total events: ${events.length}`,
    `Page views: ${events.filter(e => e.name === 'page_view').length}`,
    `Amazon clicks: ${amazonClicks.length}`,
    `Rumble clicks: ${rumbleClicks.length}`,
    `Black File clicks: ${blackFileClicks.length}`,
    `Form submits: ${formSubmits.length}`,
    topLines('Top event types', eventCounts),
    topLines('Top pages', pageCounts),
    topLines('Top routes', routeCounts),
    topLines('Top click targets', countBy(outbound, 'href')),
    '',
    'Read this like a funnel:',
    '- Amazon clicks = direct buyer intent.',
    '- Black File clicks/forms = list-building intent.',
    '- Intel Desk clicks = content-interest signal.',
    '- Rumble clicks = audience migration signal.',
    '',
    'Matrix Reprogrammed'
  ].join('\n');
}

async function sendEmail(subject, text) {
  const to = process.env.ANALYTICS_EMAIL_TO;
  const from = process.env.ANALYTICS_EMAIL_FROM || 'Matrix Reprogrammed <onboarding@resend.dev>';
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    console.log('MR_ANALYTICS_REPORT_READY');
    console.log(text);
    return { skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email send failed: ${response.status} ${body}`);
  }
  return response.json();
}

exports.handler = async function(event) {
  const query = event.queryStringParameters || {};
  const manualSecret = process.env.ANALYTICS_REPORT_SECRET;
  if (query.manual === '1' && manualSecret && query.secret !== manualSecret) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const date = query.date || yesterdayKey();
  const store = getStore('matrix-analytics');
  const events = await store.get(`events-${date}.json`, { type: 'json' }) || [];
  const report = buildReport(date, Array.isArray(events) ? events : []);
  await sendEmail(`Matrix Reprogrammed analytics — ${date}`, report);

  return { statusCode: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: report };
};
