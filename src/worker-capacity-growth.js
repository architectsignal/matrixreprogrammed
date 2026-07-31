import { D1ResourceRegistry } from '../ai-management/resource-registry/resource-registry.mjs';
import { runCapacityGrowthCycle } from '../ai-management/compute-capacity/capacity-growth-controller.mjs';

const ROUTE = '/api/ai-management/admin/capacity-growth';

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-matrix-origin': 'cloudflare-worker-capacity-growth'
    }
  });
}

function parse(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function workloadForJobType(jobType) {
  const value = String(jobType || '');
  if (value === 'llm.generate') return 'llm';
  if (value.startsWith('deterministic.')) return 'deterministic';
  if (value.includes('embed')) return 'embedding';
  if (value.includes('rerank')) return 'rerank';
  if (value.includes('classif')) return 'classification';
  if (value.includes('summar')) return 'summarization';
  return value;
}

async function loadState(env) {
  const [nodesResult, modelsResult, opportunitiesResult, jobsResult] = await Promise.all([
    env.MEMBERS_DB.prepare("SELECT node_id,node_name,hardware_json,cost_confirmed_zero,external_network_used,status,expires_at FROM ai_local_runtime_nodes WHERE status='online' AND expires_at>CURRENT_TIMESTAMP ORDER BY last_seen DESC LIMIT 100").all(),
    env.MEMBERS_DB.prepare("SELECT node_id,resource_id,model_id,metadata_json,status FROM ai_local_models WHERE status='available' ORDER BY last_seen DESC LIMIT 500").all(),
    env.MEMBERS_DB.prepare("SELECT opportunity_json,evaluation_json FROM ai_opportunities WHERE kind IN ('compute','inference_api') AND approval_state IN ('approved-auto','awaiting-owner') ORDER BY confidence DESC,updated_at DESC LIMIT 200").all(),
    env.MEMBERS_DB.prepare("SELECT job_id,job_type,priority,created_at FROM ai_local_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 200").all()
  ]);
  const modelsByNode = new Map();
  for (const row of modelsResult?.results || []) {
    const list = modelsByNode.get(row.node_id) || [];
    list.push({
      resource_id: row.resource_id,
      capability_types: ['llm'],
      supported_job_types: ['llm.generate'],
      metadata: { ...parse(row.metadata_json, {}), local: true, model_id: row.model_id }
    });
    modelsByNode.set(row.node_id, list);
  }
  const localRuntimes = (nodesResult?.results || []).map(row => ({
    node_id: row.node_id,
    node_name: row.node_name,
    owner_authorized: true,
    allowed_for_project: true,
    cost_confirmed_zero: Boolean(row.cost_confirmed_zero),
    external_network_used: Boolean(row.external_network_used),
    hardware: parse(row.hardware_json, {}),
    resources: modelsByNode.get(row.node_id) || [],
    maximum_concurrency: Math.max(1, Number(parse(row.hardware_json, {}).cpu_threads || 1))
  }));
  const opportunityEvaluations = (opportunitiesResult?.results || []).map(row => ({
    ...parse(row.evaluation_json, {}),
    opportunity: parse(row.opportunity_json, {})
  }));
  const queuedJobs = (jobsResult?.results || []).map(row => ({
    job_id: row.job_id,
    priority: row.priority,
    created_at: Date.parse(row.created_at || '') || 0,
    capability_type: workloadForJobType(row.job_type)
  }));
  return { localRuntimes, opportunityEvaluations, queuedJobs };
}

async function health(env) {
  const counts = {};
  for (const [key, sql] of [
    ['online_local_nodes', "SELECT COUNT(*) count FROM ai_local_runtime_nodes WHERE status='online' AND expires_at>CURRENT_TIMESTAMP"],
    ['available_local_models', "SELECT COUNT(*) count FROM ai_local_models WHERE status='available'"],
    ['external_compute_opportunities', "SELECT COUNT(*) count FROM ai_opportunities WHERE kind IN ('compute','inference_api') AND approval_state IN ('approved-auto','awaiting-owner')"],
    ['queued_local_jobs', "SELECT COUNT(*) count FROM ai_local_jobs WHERE status='queued'"]
  ]) counts[key] = Number((await env.MEMBERS_DB.prepare(sql).first())?.count || 0);
  return json({ ok: true, ...counts, zero_spend_lock: true, paid_fallback_possible: false, generated_at: new Date().toISOString() });
}

async function execute(env) {
  const state = await loadState(env);
  const registry = new D1ResourceRegistry(env.MEMBERS_DB);
  const activeResources = await registry.list();
  const result = await runCapacityGrowthCycle({
    ...state,
    activeResources,
    registerResource: resource => registry.upsert(resource),
    now: new Date()
  });
  return json({
    ok: true,
    discovered_candidates: result.discovered_candidates,
    resources_admitted: result.admitted.map(item => item.resource_id),
    owner_approval_queue: result.owner_approval_queue,
    quarantined: result.quarantined,
    assignments: result.allocation.assignments,
    deferred: result.allocation.deferred,
    capacity: {
      current: result.portfolio.current_capacity_score,
      immediately_admissible: result.portfolio.immediately_admissible_capacity_score,
      owner_approval: result.portfolio.owner_approval_capacity_score,
      projected: result.portfolio.projected_capacity_score
    },
    zero_spend_lock: true,
    paid_fallback_possible: false,
    generated_at: result.generated_at
  });
}

export function isCapacityGrowthRoute(path = '') { return path === ROUTE; }

export async function handleCapacityGrowthRoute(request, env) {
  if (!env?.MEMBERS_DB?.prepare) return json({ ok: false, error: 'D1 binding unavailable' }, 503);
  try {
    if (request.method === 'GET') return health(env);
    if (request.method === 'POST') return execute(env);
    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, error: 'Capacity growth failed safely', message: String(error?.message || error).slice(0, 500), zero_spend_lock: true }, 500);
  }
}
