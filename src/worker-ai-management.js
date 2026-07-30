import { ResourceRegistry, createLocalResource, D1ResourceRegistry } from '../ai-management/resource-registry/resource-registry.mjs';
import { ResourceBroker } from '../ai-management/resource-broker/resource-broker.mjs';
import { DeterministicLocalAdapter } from '../ai-management/provider-adapters/local/deterministic-local.mjs';
import { routeLocalModel } from '../ai-management/local-runtime/model-router.mjs';

const ORIGIN = 'cloudflare-worker-ai-management';
const ROUTES = new Set([
  '/api/ai-management/admin/health',
  '/api/ai-management/admin/resources',
  '/api/ai-management/admin/test-local',
  '/api/ai-management/admin/scout',
  '/api/ai-management/admin/local-runtime',
  '/api/ai-management/admin/route-model',
  '/api/ai-management/admin/site-director'
]);

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'x-matrix-origin': ORIGIN
};

function json(value, status = 200) { return new Response(JSON.stringify(value, null, 2), { status, headers }); }
function equal(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}
function admin(request, env) { return Boolean(env?.ADMIN_API_TOKEN && equal(request.headers.get('x-admin-token'), env.ADMIN_API_TOKEN)); }
function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}
function flags(env) {
  return {
    brokerEnabled: enabled(env?.AI_RESOURCE_BROKER_ENABLED, false),
    externalEnabled: enabled(env?.AI_RESOURCE_EXTERNAL_ENABLED, false),
    localOnly: enabled(env?.AI_RESOURCE_LOCAL_ONLY, true),
    zeroSpendLock: enabled(env?.AI_RESOURCE_ZERO_SPEND_LOCK, true),
    backgroundEnabled: enabled(env?.AI_RESOURCE_BACKGROUND_ENABLED, false),
    scoutEnabled: enabled(env?.AI_RESOURCE_SCOUT_ENABLED, false),
    autoApprovalEnabled: enabled(env?.AI_RESOURCE_AUTO_APPROVAL_ENABLED, false),
    localModelRoutingEnabled: enabled(env?.AI_LOCAL_MODEL_ROUTING_ENABLED, false),
    siteDirectorEnabled: enabled(env?.AI_SITE_DIRECTOR_ENABLED, false)
  };
}

async function tableExists(database, name) {
  try {
    const row = await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first();
    return row?.name === name;
  } catch { return false; }
}
async function schemaReady(env) { return Boolean(env?.MEMBERS_DB?.prepare && await tableExists(env.MEMBERS_DB, 'ai_resources')); }
async function autonomySchemaReady(env) {
  if (!await schemaReady(env)) return false;
  const required = ['ai_resource_candidates', 'ai_local_runtime_nodes', 'ai_local_models', 'ai_site_improvement_runs'];
  const checks = await Promise.all(required.map(name => tableExists(env.MEMBERS_DB, name)));
  return checks.every(Boolean);
}

async function readBody(request, maximumBytes = 2 * 1024 * 1024) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new Error('Request body exceeds the AI-management limit');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error('Request body exceeds the AI-management limit');
  return text ? JSON.parse(text) : {};
}

async function digest(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function safeId(value, prefix = 'id') {
  const clean = String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return clean || `${prefix}-${Date.now()}`;
}
function zeroSpendResource(resource) {
  return Boolean(resource && resource.resource_id && resource.billing_enabled === false && resource.payment_method_present === false && resource.billing_risk === 'none' && Number(resource.monetary_cost_per_unit_eur || 0) === 0 && resource.quota_verified === true && resource.approved_for_automation === true);
}

async function health(env) {
  const ready = await schemaReady(env);
  const autonomyReady = await autonomySchemaReady(env);
  let counts = { resources: 0, jobs: 0, auditRecords: 0, candidates: 0, localNodes: 0, localModels: 0, siteDirectorRuns: 0 };
  if (ready) {
    const queries = [
      ['resources', 'SELECT COUNT(*) count FROM ai_resources'],
      ['jobs', 'SELECT COUNT(*) count FROM ai_jobs'],
      ['auditRecords', 'SELECT COUNT(*) count FROM ai_audit_log']
    ];
    if (autonomyReady) queries.push(
      ['candidates', 'SELECT COUNT(*) count FROM ai_resource_candidates'],
      ['localNodes', 'SELECT COUNT(*) count FROM ai_local_runtime_nodes'],
      ['localModels', 'SELECT COUNT(*) count FROM ai_local_models'],
      ['siteDirectorRuns', 'SELECT COUNT(*) count FROM ai_site_improvement_runs']
    );
    for (const [key, sql] of queries) {
      try { counts[key] = Number((await env.MEMBERS_DB.prepare(sql).first())?.count || 0); } catch {}
    }
  }
  return {
    ok: true,
    schemaReady: ready,
    autonomySchemaReady: autonomyReady,
    flags: flags(env),
    counts,
    monetaryCeilingEur: 0,
    paidFallbackPossible: false,
    localInferenceBoundary: 'Cloudflare stores inventory and routing decisions only. Model prompts and inference remain on the owner-controlled local machine.',
    migrationRequired: !ready,
    autonomyMigrationRequired: !autonomyReady,
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
    job_type: 'deterministic.hash', capability_type: 'deterministic', priority: 'P4', data_class: 'internal',
    payload: { value: body.value ?? 'matrix-ai-management-health' },
    requirements: { cost_ceiling_eur: 0, requires_provenance: true, cacheable: false, maximum_attempts: 1 }
  });
  return json({ ok: true, localOnly: true, result });
}

async function recordScout(env, report) {
  const state = flags(env);
  if (!state.scoutEnabled || !state.autoApprovalEnabled || !state.zeroSpendLock) return json({ ok: false, error: 'Resource Scout or automatic approval is disabled' }, 409);
  if (!await autonomySchemaReady(env)) return json({ ok: false, error: 'AI autonomy migration is not applied' }, 503);
  const registry = new D1ResourceRegistry(env.MEMBERS_DB);
  let approved = 0;
  let quarantined = 0;
  const evaluations = Array.isArray(report?.evaluations) ? report.evaluations.slice(0, 500) : [];
  for (const evaluation of evaluations) {
    const candidate = evaluation?.candidate || {};
    const status = evaluation.approved === true && Number(evaluation.confidence || 0) >= 95 ? 'approved' : 'quarantined';
    await env.MEMBERS_DB.prepare(`INSERT INTO ai_resource_candidates(
      candidate_id,source_url,provider_name,service_name,discovery_method,candidate_json,evaluation_json,confidence,status,approved_resource_id,discovered_at,evaluated_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_url) DO UPDATE SET
      provider_name=excluded.provider_name,service_name=excluded.service_name,discovery_method=excluded.discovery_method,candidate_json=excluded.candidate_json,
      evaluation_json=excluded.evaluation_json,confidence=excluded.confidence,status=excluded.status,evaluated_at=excluded.evaluated_at,updated_at=excluded.updated_at`)
      .bind(candidate.candidate_id || safeId(candidate.source_url, 'candidate'), candidate.source_url, candidate.provider_name || null, candidate.service_name || null,
        candidate.discovery_method || 'local-resource-scout', JSON.stringify(candidate), JSON.stringify(evaluation), Number(evaluation.confidence || 0), status, null,
        candidate.discovered_at || report.generated_at || new Date().toISOString(), evaluation.evaluated_at || new Date().toISOString(), new Date().toISOString()).run();
    if (status === 'approved') approved += 1; else quarantined += 1;
  }
  for (const resource of Array.isArray(report?.approved) ? report.approved.slice(0, 200) : []) {
    if (!zeroSpendResource(resource)) {
      quarantined += 1;
      continue;
    }
    await registry.upsert(resource);
    await env.MEMBERS_DB.prepare("UPDATE ai_resource_candidates SET approved_resource_id=?,status='approved',updated_at=? WHERE source_url IN (SELECT json_extract(candidate_json,'$.source_url') FROM ai_resource_candidates WHERE candidate_id=?)")
      .bind(resource.resource_id, new Date().toISOString(), `source-${safeId(resource.metadata?.source_id || resource.allowed_hosts?.[0] || resource.resource_id)}`).run().catch(() => null);
  }
  return json({ ok: true, costStatus: 'EUR 0', discovered: Number(report?.discovered || evaluations.length), approved, quarantined, receivedAt: new Date().toISOString() });
}

async function recordLocalRuntime(env, runtime) {
  const state = flags(env);
  if (!state.localModelRoutingEnabled || !state.zeroSpendLock) return json({ ok: false, error: 'Local model routing is disabled' }, 409);
  if (!await autonomySchemaReady(env)) return json({ ok: false, error: 'AI autonomy migration is not applied' }, 503);
  if (runtime?.cost_confirmed_zero !== true || runtime?.external_network_used !== false) return json({ ok: false, error: 'Local runtime did not prove zero cost and no external network use' }, 400);
  const hardware = runtime.hardware || {};
  const nodeId = `node-${(await digest(`${hardware.hostname || 'local'}|${hardware.platform || ''}|${hardware.architecture || ''}`)).slice(0, 24)}`;
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const resources = Array.isArray(runtime.resources) ? runtime.resources.filter(resource => resource?.metadata?.local === true && Number(resource.resource_tier) === 1 && zeroSpendResource(resource)) : [];
  await env.MEMBERS_DB.prepare(`INSERT INTO ai_local_runtime_nodes(node_id,node_name,platform,architecture,hardware_json,server_inventory_json,model_count,gpu_count,total_gpu_memory_mb,status,cost_confirmed_zero,external_network_used,registered_at,last_seen,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,'online',1,0,?,?,?) ON CONFLICT(node_id) DO UPDATE SET node_name=excluded.node_name,platform=excluded.platform,architecture=excluded.architecture,
    hardware_json=excluded.hardware_json,server_inventory_json=excluded.server_inventory_json,model_count=excluded.model_count,gpu_count=excluded.gpu_count,
    total_gpu_memory_mb=excluded.total_gpu_memory_mb,status='online',cost_confirmed_zero=1,external_network_used=0,last_seen=excluded.last_seen,expires_at=excluded.expires_at`)
    .bind(nodeId, hardware.hostname || 'owner-local-node', hardware.platform || null, hardware.architecture || null, JSON.stringify(hardware), JSON.stringify(runtime.servers || []), resources.length,
      Number(hardware.gpus?.length || 0), Number(hardware.total_gpu_memory_mb || 0), now, now, expires).run();
  const registry = new D1ResourceRegistry(env.MEMBERS_DB);
  for (const resource of resources) {
    await registry.upsert(resource);
    await env.MEMBERS_DB.prepare(`INSERT INTO ai_local_models(resource_id,node_id,model_id,protocol,endpoint_scope,metadata_json,route_score,status,last_seen,updated_at)
      VALUES(?,?,?,?,?,?,NULL,'available',?,?) ON CONFLICT(resource_id) DO UPDATE SET node_id=excluded.node_id,model_id=excluded.model_id,protocol=excluded.protocol,
      endpoint_scope='loopback-only',metadata_json=excluded.metadata_json,status='available',last_seen=excluded.last_seen,updated_at=excluded.updated_at`)
      .bind(resource.resource_id, nodeId, resource.metadata.model_id, resource.metadata.protocol || 'openai', 'loopback-only', JSON.stringify(resource.metadata), now, now).run();
  }
  return json({ ok: true, nodeId, modelsRegistered: resources.length, costStatus: 'EUR 0', externalNetworkUsed: false, expiresAt: expires });
}

async function routeModel(env, request) {
  const state = flags(env);
  if (!state.localModelRoutingEnabled) return json({ ok: false, error: 'Local model routing is disabled' }, 409);
  if (!await autonomySchemaReady(env)) return json({ ok: false, error: 'AI autonomy migration is not applied' }, 503);
  const body = await readBody(request, 512 * 1024);
  const resources = (await new D1ResourceRegistry(env.MEMBERS_DB).list()).filter(resource => Number(resource.resource_tier) === 1 && resource.metadata?.local === true && resource.enabled);
  const job = {
    job_type: 'llm.generate', capability_type: 'llm', priority: body.priority || 'P2', data_class: body.data_class || 'internal',
    payload: { prompt: body.prompt || '', messages: body.messages || [], task_profile: body.task_profile || 'reasoning', max_tokens: body.max_tokens || 1200 },
    requirements: { allow_cpu_fallback: body.allow_cpu_fallback !== false }
  };
  const route = routeLocalModel(resources, job, { now: new Date() });
  if (!route.selected) return json({ ok: false, error: 'No online compatible local model', excluded: route.excluded }, 503);
  await env.MEMBERS_DB.prepare('UPDATE ai_local_models SET route_score=?,updated_at=? WHERE resource_id=?').bind(route.selected.route_score, new Date().toISOString(), route.selected.resource.resource_id).run();
  return json({
    ok: true,
    selected: { resource_id: route.selected.resource.resource_id, model_id: route.selected.resource.metadata?.model_id, node: route.selected.resource.metadata?.hardware_hostname, route_score: route.selected.route_score },
    candidates: route.eligible.map(item => ({ resource_id: item.resource.resource_id, model_id: item.resource.metadata?.model_id, route_score: item.route_score, compatibility: item.compatibility })),
    excluded: route.excluded,
    inferenceLocation: 'owner-controlled-local-node',
    promptStored: false,
    costStatus: 'EUR 0'
  });
}

async function recordSiteDirector(env, report) {
  const state = flags(env);
  if (!state.siteDirectorEnabled) return json({ ok: false, error: 'Site Improvement Director is disabled' }, 409);
  if (!await autonomySchemaReady(env)) return json({ ok: false, error: 'AI autonomy migration is not applied' }, 503);
  const now = new Date().toISOString();
  const runId = `site-run-${(await digest(`${report.generated_at || now}|${report.scanned_pages || 0}|${report.total_issues || 0}`)).slice(0, 24)}`;
  const prohibited = Number(report.prohibited_changes_attempted || 0);
  const status = prohibited > 0 ? 'quarantined' : Number(report.total_issues || 0) > 0 ? 'completed-with-findings' : 'completed';
  await env.MEMBERS_DB.prepare(`INSERT OR REPLACE INTO ai_site_improvement_runs(run_id,node_id,scanned_pages,files_with_findings,total_issues,safe_changes_applied,prohibited_changes_attempted,report_json,status,generated_at,received_at)
    VALUES(?,NULL,?,?,?,?,?,?,?, ?,?)`).bind(runId, Number(report.scanned_pages || 0), Number(report.files_with_findings || 0), Number(report.total_issues || 0),
      prohibited > 0 ? 0 : Number(report.safe_changes_applied || 0), prohibited, JSON.stringify(report), status, report.generated_at || now, now).run();
  if (prohibited === 0) {
    for (const change of Array.isArray(report.changes) ? report.changes.slice(0, 100) : []) {
      const actionId = `action-${(await digest(`${runId}|${change.file}|${(change.fixes || []).join(',')}`)).slice(0, 24)}`;
      await env.MEMBERS_DB.prepare(`INSERT OR REPLACE INTO ai_site_improvement_actions(action_id,run_id,file_path,action_type,before_hash,after_hash,status,details_json,created_at)
        VALUES(?,?,?,?,?,?,'applied-safe',?,?)`).bind(actionId, runId, change.file, (change.fixes || []).join(','), change.before_hash || null, change.after_hash || null, JSON.stringify(change), now).run();
    }
  }
  return json({ ok: prohibited === 0, runId, status, scannedPages: Number(report.scanned_pages || 0), totalIssues: Number(report.total_issues || 0), safeChangesAccepted: prohibited > 0 ? 0 : Number(report.safe_changes_applied || 0), prohibitedChangesAttempted: prohibited }, prohibited > 0 ? 409 : 200);
}

async function listScout(env) {
  if (!await autonomySchemaReady(env)) return json({ ok: false, error: 'AI autonomy migration is not applied' }, 503);
  const rows = await env.MEMBERS_DB.prepare('SELECT candidate_id,source_url,provider_name,service_name,confidence,status,approved_resource_id,discovered_at,evaluated_at,updated_at FROM ai_resource_candidates ORDER BY updated_at DESC LIMIT 200').all();
  return json({ ok: true, count: rows?.results?.length || 0, candidates: rows?.results || [] });
}
async function listLocalRuntime(env) {
  if (!await autonomySchemaReady(env)) return json({ ok: false, error: 'AI autonomy migration is not applied' }, 503);
  const [nodes, models] = await Promise.all([
    env.MEMBERS_DB.prepare('SELECT node_id,node_name,platform,architecture,model_count,gpu_count,total_gpu_memory_mb,status,last_seen,expires_at FROM ai_local_runtime_nodes ORDER BY last_seen DESC LIMIT 50').all(),
    env.MEMBERS_DB.prepare('SELECT resource_id,node_id,model_id,protocol,endpoint_scope,route_score,status,last_seen FROM ai_local_models ORDER BY status,route_score DESC,last_seen DESC LIMIT 200').all()
  ]);
  return json({ ok: true, nodes: nodes?.results || [], models: models?.results || [], inferenceBoundary: 'Inventory and routes only; inference stays local.' });
}
async function listSiteDirector(env) {
  if (!await autonomySchemaReady(env)) return json({ ok: false, error: 'AI autonomy migration is not applied' }, 503);
  const rows = await env.MEMBERS_DB.prepare('SELECT run_id,scanned_pages,files_with_findings,total_issues,safe_changes_applied,prohibited_changes_attempted,status,generated_at,received_at FROM ai_site_improvement_runs ORDER BY generated_at DESC LIMIT 100').all();
  return json({ ok: true, runs: rows?.results || [] });
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
    if (path === '/api/ai-management/admin/scout' && request.method === 'GET') return listScout(env);
    if (path === '/api/ai-management/admin/scout' && request.method === 'POST') return recordScout(env, await readBody(request, 8 * 1024 * 1024));
    if (path === '/api/ai-management/admin/local-runtime' && request.method === 'GET') return listLocalRuntime(env);
    if (path === '/api/ai-management/admin/local-runtime' && request.method === 'POST') return recordLocalRuntime(env, await readBody(request, 8 * 1024 * 1024));
    if (path === '/api/ai-management/admin/route-model' && request.method === 'POST') return routeModel(env, request);
    if (path === '/api/ai-management/admin/site-director' && request.method === 'GET') return listSiteDirector(env);
    if (path === '/api/ai-management/admin/site-director' && request.method === 'POST') return recordSiteDirector(env, await readBody(request, 8 * 1024 * 1024));
    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, error: 'AI management failed safely', message: String(error?.message || error).slice(0, 500) }, 500);
  }
}

async function scheduled(_event, env) {
  const state = flags(env);
  if (!state.backgroundEnabled || !await autonomySchemaReady(env)) return;
  const now = new Date().toISOString();
  await env.MEMBERS_DB.prepare("UPDATE ai_local_runtime_nodes SET status='stale' WHERE expires_at<=? AND status='online'").bind(now).run();
  await env.MEMBERS_DB.prepare("UPDATE ai_local_models SET status='stale',updated_at=? WHERE node_id IN (SELECT node_id FROM ai_local_runtime_nodes WHERE status IN ('stale','offline'))").bind(now).run();
  await env.MEMBERS_DB.prepare("UPDATE ai_resources SET enabled=0,health_status='unknown',updated_at=? WHERE resource_tier=1 AND resource_id IN (SELECT resource_id FROM ai_local_models WHERE status='stale')").bind(now).run();
  await env.MEMBERS_DB.prepare("DELETE FROM ai_resource_candidates WHERE status='quarantined' AND updated_at<datetime('now','-90 days')").run();
}

export function isAiManagementRoute(path = '') { return ROUTES.has(path); }
export default { fetch: fetchHandler, scheduled };
