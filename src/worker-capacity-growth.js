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

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
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

function isComputeResource(resource = {}) {
  const supported = resource.capability_types || resource.metadata?.supported_workloads || [];
  return supported.some(item => ['deterministic', 'embedding', 'rerank', 'classification', 'summarization', 'llm'].includes(String(item)));
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

async function ensureDailyBenchmark(env, state, now = new Date()) {
  const eligibleNodes = state.localRuntimes.filter(runtime => runtime.cost_confirmed_zero === true && runtime.external_network_used !== true);
  if (!eligibleNodes.length) return { created: false, reason: 'no-eligible-zero-cost-offline-owner-node' };
  const day = now.toISOString().slice(0, 10);
  const jobId = `capacity-benchmark-${day}`;
  const timestamp = now.toISOString();
  const result = await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO ai_local_jobs(
    job_id,job_type,payload_json,requirements_json,data_class,priority,status,attempt_count,maximum_attempts,created_at,updated_at
  ) VALUES(?,'deterministic.hash',?,?,'internal','P4','queued',0,1,?,?)`)
    .bind(
      jobId,
      JSON.stringify({ value: `matrix-zero-cost-capacity:${day}`, benchmark: 'daily-owner-local-capacity' }),
      JSON.stringify({ cost_ceiling_eur: 0, external_network_allowed: false, benchmark: true }),
      timestamp,
      timestamp
    ).run();
  return { created: Number(result?.meta?.changes || 0) > 0, job_id: jobId };
}

async function persistLocalAssignments(env, assignments, localRuntimes, now = new Date()) {
  const nodeIds = new Set(localRuntimes.map(runtime => runtime.node_id).filter(Boolean));
  const persisted = [];
  for (const assignment of assignments) {
    if (!assignment.job_id || !nodeIds.has(assignment.resource_id)) continue;
    const update = await env.MEMBERS_DB.prepare(`UPDATE ai_local_jobs SET assigned_node_id=?,updated_at=?
      WHERE job_id=? AND status='queued' AND (assigned_node_id IS NULL OR assigned_node_id NOT IN (
        SELECT node_id FROM ai_local_runtime_nodes WHERE status='online' AND expires_at>CURRENT_TIMESTAMP
          AND cost_confirmed_zero=1 AND external_network_used=0
      ))`)
      .bind(assignment.resource_id, now.toISOString(), assignment.job_id).run();
    if (Number(update?.meta?.changes || 0) > 0) persisted.push({ job_id: assignment.job_id, node_id: assignment.resource_id });
  }
  return persisted;
}

async function buildComputeReport(env, state, result, resources, benchmark, persistedAssignments, now = new Date()) {
  const eligibleLocalRuntimes = state.localRuntimes.filter(runtime => runtime.cost_confirmed_zero === true && runtime.external_network_used !== true);
  const localHardware = eligibleLocalRuntimes.map(runtime => runtime.hardware || {});
  const [receipts, opportunityFindings] = await Promise.all([
    env.MEMBERS_DB.prepare(`SELECT receipt_type,COUNT(*) count FROM ai_local_job_receipts
      WHERE created_at>=datetime('now','-1 day') GROUP BY receipt_type`).all(),
    env.MEMBERS_DB.prepare(`SELECT opportunity_id,provider_name,service_name,approval_state,owner_actions_json,blockers_json,evaluated_at
      FROM ai_opportunities WHERE kind IN ('compute','inference_api') ORDER BY confidence DESC,updated_at DESC LIMIT 200`).all()
  ]);
  const receiptCounts = Object.fromEntries((receipts?.results || []).map(row => [row.receipt_type, Number(row.count || 0)]));
  const externalOwnerQueue = (opportunityFindings?.results || []).filter(row => row.approval_state === 'awaiting-owner').map(row => ({
    candidate_id: row.opportunity_id, provider_name: row.provider_name, service_name: row.service_name,
    owner_actions: parse(row.owner_actions_json, []), evaluated_at: row.evaluated_at
  }));
  const externalQuarantine = (opportunityFindings?.results || []).filter(row => row.approval_state === 'quarantined').map(row => ({
    candidate_id: row.opportunity_id, provider_name: row.provider_name, service_name: row.service_name,
    blockers: parse(row.blockers_json, []), owner_actions: parse(row.owner_actions_json, []), evaluated_at: row.evaluated_at
  }));
  const computeResources = resources.filter(isComputeResource);
  const external = computeResources.filter(resource => Number(resource.resource_tier || 0) >= 3 && resource.enabled !== false);
  const awaitingOwner = [...new Map([
    ...result.owner_approval_queue.map(item => ({ candidate_id: item.candidate_id, owner_actions: item.owner_actions })),
    ...externalOwnerQueue
  ].map(item => [item.candidate_id, item])).values()];
  const quarantined = [...new Map([
    ...result.quarantined.map(item => ({ candidate_id: item.candidate_id, blockers: item.blockers })),
    ...externalQuarantine
  ].map(item => [item.candidate_id, item])).values()];
  return {
    title: 'MATRIX COMPUTE REPORT',
    generated_at: now.toISOString(),
    total_available_cpu_threads: localHardware.reduce((sum, hardware) => sum + Number(hardware.cpu_threads || hardware.logical_cores || 0), 0),
    total_available_gpu_count: localHardware.reduce((sum, hardware) => sum + Number(hardware.gpus?.length || 0), 0),
    total_available_vram_mb: localHardware.reduce((sum, hardware) => sum + Number(hardware.total_gpu_memory_mb || 0), 0),
    observed_online_local_nodes: state.localRuntimes.length,
    online_local_nodes: eligibleLocalRuntimes.length,
    eligible_external_free_resources: external.length,
    usable_broker_resources: computeResources.filter(resource => resource.enabled !== false && resource.approved_for_automation !== false
      && resource.billing_enabled !== true && resource.payment_method_present !== true && Number(resource.monetary_cost_per_unit_eur || 0) === 0
      && !['unhealthy', 'cooldown'].includes(String(resource.health_status || 'healthy'))).length,
    effective_capacity_score: result.portfolio.current_capacity_score + result.portfolio.immediately_admissible_capacity_score,
    projected_capacity_score: result.portfolio.projected_capacity_score,
    resources_admitted: result.admitted.map(resource => resource.resource_id),
    awaiting_owner: awaitingOwner,
    resources_quarantined: quarantined,
    jobs_assigned: persistedAssignments,
    jobs_deferred: result.allocation.deferred,
    outcomes_last_24h: receiptCounts,
    daily_benchmark: benchmark,
    confirmed_compute_cost_eur: 0,
    estimated_external_compute_cost_avoided_eur: null,
    zero_spend_lock: true,
    paid_fallback_possible: false,
    boundary: 'Capacity counts only online owner nodes and enabled zero-cost registry resources. Cost avoided remains unknown until a defensible equivalent-price model exists.'
  };
}

async function persistComputeLearning(env, report) {
  const day = report.generated_at.slice(0, 10);
  await env.MEMBERS_DB.prepare(`INSERT OR REPLACE INTO matrix_learning_ledger(
    learning_id,source_event_id,domain,observation,proposed_change,change_class,decision,evidence_json,audit_identifier,created_at
  ) VALUES(?,NULL,'zero-cost-compute',?,?,'A','recorded',?,?,?)`)
    .bind(
      `learning-zero-cost-compute-${day}`,
      `Usable zero-cost capacity score ${report.effective_capacity_score}; ${report.online_local_nodes} owner node(s), ${report.eligible_external_free_resources} external resource(s), ${report.jobs_assigned.length} assignment(s).`,
      'Prefer resources with validated outcomes; recheck quarantined or owner-gated candidates without lowering zero-spend, privacy or terms thresholds.',
      JSON.stringify(report),
      `zero-cost-compute-report:${day}`,
      report.generated_at
    ).run();
}

async function executeCycle(env, { createBenchmark = true, now = new Date() } = {}) {
  let state = await loadState(env);
  const benchmark = createBenchmark ? await ensureDailyBenchmark(env, state, now) : { created: false, reason: 'benchmark-disabled' };
  if (benchmark.created) state = await loadState(env);
  const registry = new D1ResourceRegistry(env.MEMBERS_DB);
  const activeResources = await registry.list();
  const result = await runCapacityGrowthCycle({
    ...state,
    activeResources,
    registerResource: resource => registry.upsert(resource),
    now
  });
  const persistedAssignments = await persistLocalAssignments(env, result.allocation.assignments, state.localRuntimes, now);
  const resources = await registry.list();
  const report = await buildComputeReport(env, state, result, resources, benchmark, persistedAssignments, now);
  await persistComputeLearning(env, report);
  return { result, report, persistedAssignments };
}

async function health(env) {
  const counts = {};
  for (const [key, sql] of [
    ['online_local_nodes', "SELECT COUNT(*) count FROM ai_local_runtime_nodes WHERE status='online' AND expires_at>CURRENT_TIMESTAMP"],
    ['available_local_models', "SELECT COUNT(*) count FROM ai_local_models WHERE status='available'"],
    ['external_compute_opportunities', "SELECT COUNT(*) count FROM ai_opportunities WHERE kind IN ('compute','inference_api') AND approval_state IN ('approved-auto','awaiting-owner')"],
    ['queued_local_jobs', "SELECT COUNT(*) count FROM ai_local_jobs WHERE status='queued'"]
  ]) counts[key] = Number((await env.MEMBERS_DB.prepare(sql).first())?.count || 0);
  const latest = await env.MEMBERS_DB.prepare(`SELECT evidence_json,created_at FROM matrix_learning_ledger
    WHERE domain='zero-cost-compute' ORDER BY created_at DESC LIMIT 1`).first().catch(() => null);
  return json({ ok: true, ...counts, latest_compute_report: latest ? parse(latest.evidence_json, null) : null, zero_spend_lock: true, paid_fallback_possible: false, generated_at: new Date().toISOString() });
}

async function execute(env) {
  const { result, report, persistedAssignments } = await executeCycle(env, { createBenchmark: true, now: new Date() });
  return json({
    ok: true,
    discovered_candidates: result.discovered_candidates,
    resources_admitted: result.admitted.map(item => item.resource_id),
    owner_approval_queue: result.owner_approval_queue,
    quarantined: result.quarantined,
    assignments: result.allocation.assignments,
    deferred: result.allocation.deferred,
    persisted_assignments: persistedAssignments,
    capacity: {
      current: result.portfolio.current_capacity_score,
      immediately_admissible: result.portfolio.immediately_admissible_capacity_score,
      owner_approval: result.portfolio.owner_approval_capacity_score,
      projected: result.portfolio.projected_capacity_score
    },
    zero_spend_lock: true,
    paid_fallback_possible: false,
    compute_report: report,
    generated_at: result.generated_at
  });
}

export async function runScheduledCapacityGrowth(env) {
  if (!enabled(env?.AI_COMPUTE_RESOURCE_SCOUT_ENABLED, false) || !enabled(env?.AI_RESOURCE_ZERO_SPEND_LOCK, true)) {
    return { skipped: true, reason: 'disabled-or-zero-spend-lock-missing' };
  }
  const { result, report, persistedAssignments } = await executeCycle(env, { createBenchmark: true, now: new Date() });
  return { skipped: false, resources_admitted: result.admitted.length, assignments: persistedAssignments.length, report };
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

export const capacityGrowthWorkerInternals = { loadState, ensureDailyBenchmark, persistLocalAssignments, buildComputeReport, persistComputeLearning, executeCycle };
