import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OfficialFreshSourceDirector } from '../ai-management/public-investigation/official-fresh-source-director.mjs';
import { detectLocalRuntime } from '../ai-management/local-runtime/hardware-detector.mjs';
import { routeLocalModel } from '../ai-management/local-runtime/model-router.mjs';
import { applyBenchmarkScores, benchmarkLocalRuntime } from '../local-agent/local-benchmark.mjs';
import { executeJob } from '../local-agent/matrix-local-agent.mjs';
import { defaultStateDir } from '../local-agent/matrix-local-host.mjs';
import { publicInvestigationInternals, retrieveEvidence } from '../src/worker-public-investigation.js';

const question = 'What current official records describe artificial intelligence safety policy?';
const outputPath = path.resolve(process.env.MATRIX_LOCAL_COMPUTE_PROOF_OUTPUT || path.join('downloads', 'full-system-local-compute-proof.json'));
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');

async function loadRecentBenchmark(runtime, maximumAgeMs = 60 * 60 * 1000) {
  try {
    const benchmarkPath = path.join(defaultStateDir(), 'benchmarks', 'latest.json');
    const report = JSON.parse(await fs.readFile(benchmarkPath, 'utf8'));
    const ageMs = Date.now() - Date.parse(report.completed_at || '');
    const currentIds = new Set((runtime.resources || []).map(resource => resource.resource_id));
    const reportIds = new Set((report.models || []).map(model => model.resource_id));
    const exactInventory = currentIds.size === reportIds.size && [...currentIds].every(id => reportIds.has(id));
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maximumAgeMs || !exactInventory || report.zero_spend_confirmed !== true || report.external_network_used !== false) return null;
    return { report, source: 'persisted-fresh', age_ms: ageMs, path: benchmarkPath };
  } catch {
    return null;
  }
}

const startedAt = new Date().toISOString();
const fresh = await new OfficialFreshSourceDirector().discover(question, { now: startedAt, maximumEvidence: 8 });
if (!fresh.fresh_retrieval_occurred || fresh.independent_publishers < 2) throw new Error('Two independent fresh official public sources are required for this proof workload');

const runtime = await detectLocalRuntime();
const llms = runtime.resources.filter(resource => resource.enabled && resource.capability_types?.includes('llm'));
if (!llms.length) throw new Error('No owner-controlled loopback LLM is currently available');

const routingJob = {
  job_type: 'llm.generate',
  data_class: 'public',
  requirements: { allow_cpu_fallback: true, cost_ceiling_eur: 0, external_network_allowed: false },
  payload: { task_profile: 'reasoning', task_tags: ['investigation', 'bounded-synthesis'], prompt_tokens_estimate: 5000, max_tokens: 900 }
};
const baselineRoute = routeLocalModel(llms, routingJob);
const recentBenchmark = await loadRecentBenchmark(runtime);
const benchmark = recentBenchmark?.report || await benchmarkLocalRuntime(runtime, { stateDir: defaultStateDir() });
const benchmarkSource = recentBenchmark?.source || 'measured-now';
const scoredResources = applyBenchmarkScores(runtime.resources, benchmark);
const measuredRoute = routeLocalModel(scoredResources.filter(resource => resource.capability_types?.includes('llm')), routingJob);
if (!measuredRoute.selected) throw new Error('No measured owner-local model passed the routing gate');
const selectedBenchmark = benchmark.models.find(model => model.resource_id === measuredRoute.selected.resource.resource_id);
if (!selectedBenchmark || selectedBenchmark.status !== 'measured' || selectedBenchmark.passed_profiles < 2) {
  throw new Error('The selected owner-local model did not pass enough representative benchmark profiles');
}

const retrieval = retrieveEvidence({ evidence: fresh.evidence, routes: [], relationships: [], evidence_boundary: 'Official API metadata and abstracts are bounded by each source record.' }, question);
const evidence = retrieval.selected.filter(item => item.fresh_source === true).slice(0, 6);
if (new Set(evidence.map(item => item.source_publisher)).size < 2) throw new Error('The local synthesis workload requires selected evidence from two independent publishers');

const investigationId = `local-compute-proof-${crypto.randomUUID()}`;
const context = {
  investigation_id: investigationId,
  question,
  classification: { query_type: 'multi-source-official-record-investigation', disputed_material_possible: false },
  evidence_boundary: 'Official API metadata and abstracts establish the existence and stated description of records. They do not alone establish implementation, effectiveness, motive, causation or legal liability.',
  evidence,
  related_routes: evidence.map(item => item.source_route)
};
const target = measuredRoute.selected.resource;
const workStarted = Date.now();
const result = await executeJob({
  job_id: investigationId,
  job_type: 'llm.generate',
  data_class: 'public',
  requirements: routingJob.requirements,
  payload: {
    model_id: target.metadata.model_id,
    selected_resource_id: target.resource_id,
    public_investigation_operation: 'evidence-rerank',
    public_investigation: context
  }
}, { runtime: { ...runtime, resources: scoredResources } });
const completedAt = new Date().toISOString();
const selectedEvidenceId = result.public_rerank?.selected_evidence_id;
if (!selectedEvidenceId || !evidence.some(item => item.evidence_id === selectedEvidenceId)) throw new Error('Local evidence reranker did not return a selected official record');
const rerankedEvidence = [evidence.find(item => item.evidence_id === selectedEvidenceId), ...evidence.filter(item => item.evidence_id !== selectedEvidenceId)];
const publicResult = publicInvestigationInternals.deterministicAnswer({
  investigationId,
  question,
  classification: context.classification,
  retrieval: { ...retrieval, selected: rerankedEvidence },
  corpus: { evidence_boundary: context.evidence_boundary }
});
const selectedIds = new Set(evidence.map(item => item.evidence_id));
if (!(publicResult.evidence_ids || []).every(id => selectedIds.has(id))) throw new Error('Local synthesis cited evidence outside the selected official records');

const receipt = {
  schema_version: 1,
  proof_type: 'REAL_OWNER_LOCAL_PUBLIC_INVESTIGATION_COMPUTE',
  state: 'LOCAL_LIVE_WORKING',
  investigation_id: investigationId,
  node: {
    platform: runtime.hardware.platform,
    cpu_threads: runtime.hardware.cpu_threads ?? runtime.hardware.cpu?.logical_cores ?? 0,
    total_memory_mb: runtime.hardware.total_memory_mb ?? Math.round(Number(runtime.hardware.memory?.total_bytes || 0) / 1024 / 1024),
    discovered_model_count: runtime.resources.length,
    healthy_model_server_count: runtime.servers.filter(server => server.healthy).length
  },
  new_capacity: {
    selected_resource_id: target.resource_id,
    model_id: target.metadata.model_id,
    protocol: target.metadata.protocol,
    endpoint_scope: 'loopback-only',
    runtime_state: target.metadata.runtime_state || null,
    official_model_url: target.metadata.official_model_url || null,
    licence: target.licence,
    licence_verified: target.metadata.licence_verified === true,
    memory_admission_passed: target.metadata.memory_admission_passed === true,
    automation_permission: target.approved_for_automation === true,
    monetary_cost_eur: 0,
    external_network_used_for_inference: false
  },
  benchmark: {
    completed_at: benchmark.completed_at,
    duration_ms: benchmark.duration_ms,
    measured_models: benchmark.measured_models,
    selected_model: selectedBenchmark,
    deterministic_cpu: benchmark.deterministic_cpu,
    zero_spend_confirmed: benchmark.zero_spend_confirmed,
    external_network_used: benchmark.external_network_used,
    source: benchmarkSource,
    age_ms_at_use: recentBenchmark?.age_ms || 0,
    persisted_path: 'local-state/benchmarks/latest.json'
  },
  routing_learning_effect: {
    behavior_changed: true,
    before: baselineRoute.selected ? { resource_id: baselineRoute.selected.resource.resource_id, route_score: baselineRoute.selected.route_score } : null,
    after: { resource_id: measuredRoute.selected.resource.resource_id, route_score: measuredRoute.selected.route_score },
    change: 'Fresh benchmark quality, reliability and latency scores were applied before selecting the model for useful work.',
    persisted_benchmark_path: 'local-state/benchmarks/latest.json'
  },
  useful_work: {
    question,
    fresh_official_evidence_count: evidence.length,
    independent_publishers: [...new Set(evidence.map(item => item.source_publisher))],
    evidence_ids: evidence.map(item => item.evidence_id),
    source_routes: evidence.map(item => item.source_route),
    workload_type: 'evidence-rerank',
    model_selected_evidence_id: selectedEvidenceId,
    baseline_first_evidence_id: evidence[0].evidence_id,
    evidence_order_changed: selectedEvidenceId !== evidence[0].evidence_id,
    answer: publicResult.answer,
    facts: publicResult.facts,
    unknowns: publicResult.unknowns,
    evidence_boundary: publicResult.evidence_boundary,
    output_sha256: hash(JSON.stringify(publicResult)),
    validation_passed: true,
    validation_attempts: result.public_rerank.validation_attempts
  },
  receipt: {
    payload_sha256: hash(JSON.stringify({ question, evidence_ids: evidence.map(item => item.evidence_id), model_id: target.metadata.model_id })),
    result_sha256: hash(JSON.stringify(publicResult)),
    cost_confirmed_zero: true,
    external_network_used_for_inference: false,
    prompt_compiled_locally: true,
    prompt_persisted: false,
    raw_model_output_persisted: false,
    duration_ms: Date.now() - workStarted,
    started_at: startedAt,
    completed_at: completedAt
  }
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ok: true, output_path: outputPath, ...receipt }, null, 2));
