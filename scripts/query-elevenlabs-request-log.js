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

function extractRows(raw) {
  const possibleArrays = [];
  if (Array.isArray(raw)) possibleArrays.push(raw);
  if (raw && typeof raw === 'object') {
    for (const key of ['requests', 'data', 'items', 'results', 'events', 'logs']) {
      if (Array.isArray(raw[key])) possibleArrays.push(raw[key]);
    }
  }
  const arr = possibleArrays[0] || [];
  return arr.map((r, i) => {
    const method = r.method || r.http_method || r.request_method || r.verb || '';
    const url = r.url || r.path || r.endpoint || r.route || r.request_url || r.request_path || r.api_path || '';
    const status = r.status || r.status_code || r.response_status || r.http_status || '';
    const created = r.created_at || r.timestamp || r.time || r.requested_at || r.date || '';
    const model = r.model || r.model_id || r.request?.model_id || r.request?.model || '';
    const product = r.product || r.feature || r.category || r.type || '';
    return { index: i + 1, created, method, url, status, model, product };
  }).filter(r => Object.values(r).some(Boolean));
}

async function main() {
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY secret.');

  const url = new URL(endpoint);
  if (!url.searchParams.has('limit')) url.searchParams.set('limit', '50');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
      'Accept': 'application/json'
    }
  });

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
  const redacted = redactDeep(body);
  const rows = extractRows(body);

  const summary = {
    generated_at: new Date().toISOString(),
    endpoint: url.origin + url.pathname,
    status: res.status,
    contentType,
    rowCount: rows.length,
    rows
  };

  const md = [
    '# ElevenLabs Request Log Safe Summary',
    '',
    `Generated: ${summary.generated_at}`,
    '',
    `Endpoint: ${summary.endpoint}`,
    '',
    `HTTP status: ${summary.status}`,
    '',
    `Rows detected: ${summary.rowCount}`,
    '',
    'This file intentionally keeps only endpoint/method/status-style metadata. Request bodies, response bodies, headers, keys, tokens, cookies, and long values are redacted or omitted.',
    '',
    '## Extracted rows',
    '',
    rows.length ? rows.map(r => `- ${r.created || 'unknown time'} · ${r.method || '?'} · ${r.url || '(no path found)'} · status ${r.status || '?'}${r.model ? ` · model ${r.model}` : ''}${r.product ? ` · ${r.product}` : ''}`).join('\n') : 'No structured request rows detected. Check redacted-response.json for the response shape.',
    '',
    '## What to look for',
    '',
    'Look for a recent Image & Video request path. If it appears here, that path can be used as ELEVENLABS_VIDEO_ENDPOINT in the generation workflow.'
  ].join('\n');

  writeBoth('safe-summary.json', JSON.stringify(summary, null, 2));
  writeBoth('safe-summary.md', md);
  writeBoth('redacted-response.json', JSON.stringify({ status: res.status, contentType, body: redacted }, null, 2));

  console.log(`ElevenLabs request log query complete: HTTP ${res.status}`);
  console.log(`Rows detected: ${rows.length}`);
  console.log(`Results saved to ${outDir} and ${diagnosticsDir}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
