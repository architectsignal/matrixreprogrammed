const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outDir = path.join(root, 'artifacts', 'elevenlabs-request-log');
const diagnosticsDir = path.join(root, 'diagnostics', 'elevenlabs-request-log');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(diagnosticsDir, { recursive: true });

const apiKey = process.env.ELEVENLABS_API_KEY;
const endpoint = process.env.ELEVENLABS_REQUEST_LOG_ENDPOINT || 'https://api.elevenlabs.io/v1/workspace/analytics/requests';

function writeBoth(filename, content) {
  fs.writeFileSync(path.join(outDir, filename), content);
  fs.writeFileSync(path.join(diagnosticsDir, filename), content);
}

function looksSensitiveKey(key = '') {
  return /authorization|token|secret|key|cookie|password|credential|signature|bearer|api/i.test(key);
}

function redactDeep(value, key = '') {
  if (value == null) return value;
  if (looksSensitiveKey(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    if (/sk_[a-zA-Z0-9]|xi-api-key|Bearer\s+[A-Za-z0-9._-]+|EA[A-Za-z0-9_-]{20,}/i.test(value)) return '[REDACTED]';
    if (value.length > 240) return value.slice(0, 240) + '…[TRUNCATED]';
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 60).map(v => redactDeep(v));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, k);
    return out;
  }
  return value;
}

function collectArrays(raw, arrays = []) {
  if (!raw) return arrays;
  if (Array.isArray(raw)) arrays.push(raw);
  if (typeof raw === 'object') {
    for (const v of Object.values(raw)) collectArrays(v, arrays);
  }
  return arrays;
}

function extractRows(raw) {
  const arr = collectArrays(raw).sort((a, b) => b.length - a.length)[0] || [];
  return arr.map((r, i) => {
    if (!r || typeof r !== 'object') return null;
    const method = r.method || r.http_method || r.request_method || r.verb || r.request?.method || r.request?.http_method || '';
    const url = r.url || r.path || r.endpoint || r.route || r.request_url || r.request_path || r.api_path || r.request?.url || r.request?.path || r.request?.endpoint || '';
    const status = r.status || r.status_code || r.response_status || r.http_status || r.response?.status || r.response?.status_code || '';
    const created = r.created_at || r.timestamp || r.time || r.requested_at || r.date || '';
    const model = r.model || r.model_id || r.request?.model_id || r.request?.model || '';
    const product = r.product || r.feature || r.category || r.type || '';
    return { index: i + 1, created, method, url, status, model, product };
  }).filter(Boolean).filter(r => Object.values(r).some(Boolean));
}

async function callVariant(label, method, body = undefined) {
  const url = new URL(endpoint);
  if (method === 'GET' && !url.searchParams.has('limit')) url.searchParams.set('limit', '50');
  const options = {
    method,
    headers: {
      'xi-api-key': apiKey,
      'Accept': 'application/json'
    }
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), options);
  const contentType = res.headers.get('content-type') || '';
  const responseBody = contentType.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
  const rows = extractRows(responseBody);
  return {
    label,
    method,
    requestShape: body === undefined ? 'no body' : Object.keys(body).join(', ') || '{}',
    status: res.status,
    contentType,
    rowCount: rows.length,
    rows,
    redactedBody: redactDeep(responseBody)
  };
}

async function main() {
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY secret.');

  const now = new Date();
  const start = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(now.getTime() / 1000);

  const variants = [
    ['GET limit', 'GET', undefined],
    ['POST empty', 'POST', {}],
    ['POST limit', 'POST', { limit: 50 }],
    ['POST unix window', 'POST', { start_unix: startUnix, end_unix: endUnix, limit: 50 }],
    ['POST date window', 'POST', { start_date: start.toISOString(), end_date: now.toISOString(), limit: 50 }]
  ];

  const attempts = [];
  for (const [label, method, body] of variants) {
    try {
      attempts.push(await callVariant(label, method, body));
    } catch (err) {
      attempts.push({ label, method, requestShape: body === undefined ? 'no body' : Object.keys(body).join(', ') || '{}', error: err.message, status: 'ERR', rowCount: 0, rows: [] });
    }
  }

  const best = attempts.find(a => a.rowCount > 0) || attempts.find(a => Number(a.status) >= 200 && Number(a.status) < 300) || attempts[0];
  const allRows = attempts.flatMap(a => (a.rows || []).map(r => ({ ...r, sourceAttempt: a.label, sourceStatus: a.status })));

  const summary = {
    generated_at: new Date().toISOString(),
    endpoint: new URL(endpoint).origin + new URL(endpoint).pathname,
    attempts: attempts.map(a => ({ label: a.label, method: a.method, requestShape: a.requestShape, status: a.status, contentType: a.contentType, rowCount: a.rowCount, rows: a.rows || [] })),
    best: best ? { label: best.label, method: best.method, status: best.status, rowCount: best.rowCount } : null,
    rowCount: allRows.length,
    rows: allRows
  };

  const md = [
    '# ElevenLabs Request Log Safe Summary',
    '',
    `Generated: ${summary.generated_at}`,
    '',
    `Endpoint: ${summary.endpoint}`,
    '',
    '## Attempts',
    '',
    ...summary.attempts.map(a => `- ${a.label}: ${a.method} (${a.requestShape}) → HTTP ${a.status}; rows ${a.rowCount}`),
    '',
    `Rows detected: ${summary.rowCount}`,
    '',
    'This file intentionally keeps only endpoint/method/status-style metadata. Request bodies, response bodies, headers, keys, tokens, cookies, and long values are redacted or omitted.',
    '',
    '## Extracted rows',
    '',
    allRows.length ? allRows.map(r => `- ${r.created || 'unknown time'} · ${r.method || '?'} · ${r.url || '(no path found)'} · status ${r.status || '?'}${r.model ? ` · model ${r.model}` : ''}${r.product ? ` · ${r.product}` : ''} · via ${r.sourceAttempt}`).join('\n') : 'No structured request rows detected. The endpoint may require a different POST schema or UI-only access.',
    '',
    '## What to look for',
    '',
    'Look for a recent Image & Video request path. If it appears here, that path can be used as ELEVENLABS_VIDEO_ENDPOINT in the generation workflow.'
  ].join('\n');

  writeBoth('safe-summary.json', JSON.stringify(summary, null, 2));
  writeBoth('safe-summary.md', md);
  writeBoth('redacted-response.json', JSON.stringify({ attempts: attempts.map(a => ({ label: a.label, method: a.method, status: a.status, contentType: a.contentType, rowCount: a.rowCount, body: a.redactedBody || a.error || null })) }, null, 2));

  console.log(md);
  console.log(`Results saved to ${outDir} and ${diagnosticsDir}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
