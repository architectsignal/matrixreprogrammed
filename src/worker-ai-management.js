import { ResourceRegistry, createLocalResource, D1ResourceRegistry } from '../ai-management/resource-registry/resource-registry.mjs';
import { ResourceBroker } from '../ai-management/resource-broker/resource-broker.mjs';
import { DeterministicLocalAdapter } from '../ai-management/provider-adapters/local/deterministic-local.mjs';

const ORIGIN = 'cloudflare-worker-ai-management';
const ROUTES = new Set([
  '/api/ai-management/admin/health',
  '/api/ai-management/admin/resources',
  '/api/ai-management/admin/test-local'
]);

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'x-matrix-origin': ORIGIN
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers });
}

function equal(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function admin(request, env) {
  return Boolean(env?.ADMIN_API_TOKEN && equal(request.headers.get('x-admin-token'), env.ADMIN_API_TOKEN));
}

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  try {
    const row = await env.MEMBERS_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_resources' LIMIT 1").first();
    return row?.name === 'ai_resources';
  } catch { return false; }
}

function flags(env) {
  return {
    brokerEnabled: String(env?.AI_RESOURCE_BROKER_ENABLED || 'false').toLowerCase() === 'true',
    externalEnabled: String(env?.AI_RESOURCE_EXTERNAL_ENABLED || 'false').toLowerCase() === 'true',
    localOnly: String(env?.AI_RESOURCE_LOCAL_ONLY || 'true').toLowerCase() !== 'false',
    zeroSpendLock: String(env?.AI_RESOURCE_ZERO_SPEND_LOCK || 'true').toLowerCase() !== 'false',
    backgroundEnabled: String(env?.AI_RESOURCE_BACKGROUND_ENABLED || 'false').toLowerCase() === 'true',
    scoutEnabled: String(env?.AI_RESOURCE_SCOUT_ENABLED || 'false').toLowerCase() === 'true'
  };
}

async function health(env) {
  const ready = await schemaReady(env);
  let counts = { resources: 0, jobs: 0, auditRecords: 0 };
  if (ready) {
    const rows = await Promise.all([
      env.MEMBERS_DB.prepare('SELECT COUNT(*) count FROM ai_resources').first(),
      env.MEMBERS_DB.prepare('SELECT COUNT(*) count FROM ai_jobs').first(),
      env.MEMBERS_DB.prepare('SELECT COUNT(*) count FROM ai_audit_log').first()
    ]);
    counts = { resources: Number(rows[0]?.count || 0), jobs: Number(rows[1]?.count || 0), auditRecords: Number(rows[2]?.count || 0) };
  }
  return {
    ok: true,
    schemaReady: ready,
    flags: flags(env),
    counts,
    monetaryCeilingEur: 0,
    paidFallbackPossible: false,
    migrationRequired: !ready,
    generatedAt: new Date().toISOString()
  };
}

async function localTest(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const resource = createLocalResource();
  const broker = new ResourceBroker({
    registry: new ResourceRegistry([resource]),
    adapters: [new DeterministicLocalAdapter()],
    policyContext: { zeroSpendLock: true, externalEnabled: false, localOnly: true }
  });
  const result = await broker.execute({
    job_type: 'deterministic.hash',
    capability_type: 'deterministic',
    priority: 'P4',
    data_class: 'internal',
    payload: { value: body.value ?? 'matrix-ai-management-health' },
    requirements: { cost_ceiling_eur: 0, requires_provenance: true, cacheable: false, maximum_attempts: 1 }
  });
  return json({ ok: true, localOnly: true, result });
}

async function fetchHandler(request, env) {
  if (!admin(request, env)) return json({ ok: false, error: 'Forbidden' }, 403);
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  try {
    if (path === '/api/ai-management/admin/health' && request.method === 'GET') return json(await health(env));
    if (path === '/api/ai-management/admin/resources' && request.method === 'GET') {
      if (!await schemaReady(env)) return json({ ok: false, error: 'AI resource migration is not applied' }, 503);
      const resources = await new D1ResourceRegistry(env.MEMBERS_DB).list();
      return json({ ok: true, costStatus: 'EUR 0', count: resources.length, resources });
    }
    if (path === '/api/ai-management/admin/test-local' && request.method === 'POST') return localTest(request);
    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, error: 'AI management failed safely', message: String(error?.message || error).slice(0, 500) }, 500);
  }
}

export function isAiManagementRoute(path = '') {
  return ROUTES.has(path);
}

export default { fetch: fetchHandler };
