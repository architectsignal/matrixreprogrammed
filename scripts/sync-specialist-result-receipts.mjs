import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const downloads = path.join(root, 'downloads');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function enabled(value) {
  return String(value || '').toLowerCase() === 'true';
}

function syncOrigin(value) {
  const raw = String(value || 'https://matrixreprogrammed.com').trim();
  const url = new URL(raw);
  const local = ['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname.toLowerCase());
  const production = ['matrixreprogrammed.com','www.matrixreprogrammed.com'].includes(url.hostname.toLowerCase());
  if (!local && !production) throw new Error('Specialist receipt sync target is not an approved Matrix control-plane host');
  if (production && url.protocol !== 'https:') throw new Error('Production specialist receipt sync requires HTTPS');
  if (local && !['http:','https:'].includes(url.protocol)) throw new Error('Local specialist receipt sync requires HTTP or HTTPS');
  return `${url.protocol}//${url.host}`;
}

function safeReceipts(payload) {
  const receipts = Array.isArray(payload?.receipts) ? payload.receipts : [];
  return receipts.slice(0, 50).filter(receipt => {
    if (!receipt || receipt.raw_output_in_receipt !== false) return false;
    if (!/^[a-f0-9]{64}$/i.test(String(receipt.result_digest || ''))) return false;
    if (receipt.cost_confirmed_zero !== true || receipt.inference_external_network_used !== false) return false;
    if (receipt.external_consequence_performed !== false || receipt.production_deployment_performed !== false || receipt.money_moved !== false) return false;
    return true;
  });
}

if (!enabled(process.env.MATRIX_SPECIALIST_RECEIPT_SYNC_ENABLED)) {
  const skipped = {
    ok: true,
    skipped: true,
    reason: 'MATRIX_SPECIALIST_RECEIPT_SYNC_ENABLED is not true',
    receipts_sent: 0,
    raw_output_sent: false,
    generated_at: new Date().toISOString()
  };
  writeJson(path.join(downloads, 'specialist-receipt-sync-result.json'), skipped);
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}

const token = String(process.env.AI_MANAGEMENT_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || '').trim();
if (!token) throw new Error('AI_MANAGEMENT_ADMIN_TOKEN or ADMIN_API_TOKEN is required for specialist receipt sync');
const origin = syncOrigin(process.env.MATRIX_SPECIALIST_CONTROL_PLANE_ORIGIN);
const source = readJson(path.join(downloads, 'specialist-local-result-receipts.json'), { receipts: [] });
const receipts = safeReceipts(source);
if (!receipts.length) throw new Error('No privacy-safe specialist result receipts are available to sync');

const maximum = Math.max(1, Math.min(10, Number(process.env.MATRIX_SPECIALIST_RECEIPT_SYNC_MAX || 5)));
const selected = receipts.slice(0, maximum);
const results = [];
for (const receipt of selected) {
  const response = await fetch(`${origin}/api/ai-management/admin/specialists/result`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': token,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(receipt)
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { ok: false, error: 'Invalid JSON control-plane response' }; }
  results.push({
    mission_id: receipt.mission_id,
    specialist: receipt.specialist,
    http_status: response.status,
    ok: response.ok && payload?.ok === true,
    publication_cleared: payload?.publication_cleared === true,
    error: response.ok ? null : String(payload?.error || `HTTP ${response.status}`).slice(0, 500)
  });
}

const output = {
  ok: results.every(item => item.ok),
  skipped: false,
  control_plane_origin: origin,
  receipts_sent: results.length,
  raw_output_sent: false,
  prompts_sent: false,
  results,
  generated_at: new Date().toISOString()
};
writeJson(path.join(downloads, 'specialist-receipt-sync-result.json'), output);
console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
