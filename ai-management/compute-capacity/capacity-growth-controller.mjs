import { buildCapacityPortfolio, allocateCapacity } from './compute-capacity-manager.mjs';

function safeId(value, prefix = 'capacity') {
  const clean = String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return clean || `${prefix}-${Date.now()}`;
}

function workloadMap(capabilities = []) {
  const mapped = new Set();
  for (const capability of Array.isArray(capabilities) ? capabilities : []) {
    const value = String(capability).toLowerCase();
    if (value.includes('gpu') || value.includes('inference') || value.includes('llm')) mapped.add('llm');
    if (value.includes('embedding')) mapped.add('embedding');
    if (value.includes('rerank')) mapped.add('rerank');
    if (value.includes('classif')) mapped.add('classification');
    if (value.includes('summar')) mapped.add('summarization');
    if (value.includes('determin')) mapped.add('deterministic');
  }
  return [...mapped];
}

export function localRuntimeToComputeCandidate(runtime = {}, now = new Date()) {
  const hardware = runtime.hardware || {};
  const resources = Array.isArray(runtime.resources) ? runtime.resources : [];
  const workloads = new Set(['deterministic']);
  for (const resource of resources) {
    for (const workload of workloadMap(resource.capability_types || resource.supported_job_types || ['llm'])) workloads.add(workload);
  }
  const hostname = hardware.hostname || runtime.node_name || 'owner-local-node';
  return {
    candidate_id: runtime.node_id || `compute-${safeId(hostname)}`,
    resource_id: runtime.node_id || `compute-${safeId(hostname)}`,
    source_type: runtime.lan_authorized === true ? 'owner-lan' : 'owner-local',
    external: false,
    owner_authorized: runtime.owner_authorized !== false,
    allowed_for_project: runtime.allowed_for_project !== false,
    access_controls_bypassed: false,
    account_rotation: false,
    quota_evasion: false,
    credential_harvesting: false,
    terms_verified: true,
    privacy_verified: true,
    automation_permission: 'allowed',
    authentication_type: 'none',
    payment_method_required: false,
    billing_enabled: false,
    payment_method_present: false,
    paid_fallback: false,
    overage_possible: false,
    auto_upgrade_enabled: false,
    external_charge_possible: false,
    billing_risk: 'none',
    zero_cost_verified: true,
    cost_confirmed_zero: runtime.cost_confirmed_zero === true,
    quota_verified: true,
    quota_unlimited: true,
    quota_remaining: null,
    monetary_cost_per_unit_eur: 0,
    supported_workloads: [...workloads],
    maximum_concurrency: Math.max(1, Number(runtime.maximum_concurrency || hardware.cpu_threads || 1)),
    gpu_memory_mb: Math.max(0, Number(hardware.total_gpu_memory_mb || 0)),
    cpu_threads: Math.max(1, Number(hardware.cpu_threads || hardware.logical_cores || 1)),
    ram_mb: Math.max(0, Number(hardware.total_memory_mb || hardware.ram_mb || 0)),
    availability_score: 100,
    reliability_score: Number(runtime.reliability_score || 95),
    privacy_score: 100,
    metadata: { hostname, local: true, node_id: runtime.node_id || null, resources }
  };
}

export function opportunityEvaluationToComputeCandidate(evaluation = {}, now = new Date()) {
  const opportunity = evaluation.opportunity || evaluation;
  const kind = String(opportunity.kind || '').toLowerCase();
  if (kind !== 'compute' && kind !== 'inference_api') return null;
  const capabilities = opportunity.supported_capabilities || [];
  return {
    candidate_id: opportunity.opportunity_id || `compute-${safeId(opportunity.provider_name || opportunity.service_name)}`,
    resource_id: opportunity.opportunity_id || `compute-${safeId(opportunity.provider_name || opportunity.service_name)}`,
    source_type: kind === 'compute' ? 'official-free-program' : 'official-community-pool',
    external: true,
    owner_authorized: true,
    allowed_for_project: opportunity.commercial_use === 'allowed' || opportunity.commercial_use === 'noncommercial-only',
    access_controls_bypassed: false,
    account_rotation: false,
    quota_evasion: false,
    credential_harvesting: false,
    terms_verified: Array.isArray(evaluation.evidence) && evaluation.evidence.length > 0,
    privacy_verified: Boolean(opportunity.privacy_url),
    automation_permission: opportunity.automation_permission,
    authentication_type: opportunity.authentication_type || 'unknown',
    account_required: opportunity.account_required === true,
    identity_verification_required: opportunity.identity_verification_required === true,
    payment_method_required: opportunity.payment_method_required === true,
    billing_enabled: false,
    payment_method_present: false,
    paid_fallback: false,
    overage_possible: false,
    auto_upgrade_enabled: false,
    external_charge_possible: false,
    billing_risk: 'none',
    zero_cost_verified: opportunity.zero_cost_verified === true,
    cost_confirmed_zero: opportunity.zero_cost_verified === true,
    quota_verified: opportunity.quota_verified === true,
    quota_unlimited: false,
    quota_remaining: Number(opportunity.free_quota || 0),
    free_quota_minutes: opportunity.free_quota_unit === 'minutes' ? Number(opportunity.free_quota || 0) : 0,
    monetary_cost_per_unit_eur: 0,
    supported_workloads: workloadMap(capabilities),
    maximum_concurrency: Math.max(1, Number(opportunity.metadata?.maximum_concurrency || 1)),
    gpu_memory_mb: Math.max(0, Number(opportunity.metadata?.gpu_memory_mb || 0)),
    cpu_threads: Math.max(0, Number(opportunity.metadata?.cpu_threads || 0)),
    ram_mb: Math.max(0, Number(opportunity.metadata?.ram_mb || 0)),
    availability_score: Number(opportunity.metadata?.availability_score || 50),
    reliability_score: Number(opportunity.metadata?.reliability_score || 50),
    privacy_score: Number(opportunity.metadata?.privacy_score || 50),
    zero_cost_evidence_at: evaluation.evaluated_at || now.toISOString(),
    last_pricing_check: evaluation.evaluated_at || now.toISOString(),
    last_terms_check: evaluation.evaluated_at || now.toISOString(),
    metadata: { opportunity, evaluation }
  };
}

export function computeCandidateToRegistryResource(candidate = {}, assessment = {}, now = new Date()) {
  const local = candidate.external !== true;
  return {
    resource_id: candidate.resource_id || candidate.candidate_id,
    provider_name: local ? 'Owner-controlled Matrix node' : candidate.metadata?.opportunity?.provider_name || 'Approved free compute',
    service_name: candidate.metadata?.hostname || candidate.metadata?.opportunity?.service_name || candidate.resource_id,
    capability_types: assessment.supported_workloads || candidate.supported_workloads || [],
    resource_tier: local ? 1 : 3,
    official_documentation_url: candidate.metadata?.opportunity?.documentation_url || null,
    terms_url: candidate.metadata?.opportunity?.terms_url || null,
    privacy_url: candidate.metadata?.opportunity?.privacy_url || null,
    account_owner: local ? 'owner-controlled' : 'owner-approved external account',
    authentication_type: candidate.authentication_type || 'none',
    credential_reference: null,
    approved_for_automation: assessment.state === 'approved-auto',
    approved_data_classes: local ? ['public', 'internal', 'confidential', 'restricted'] : ['public'],
    prohibited_data_classes: local ? [] : ['internal', 'confidential', 'restricted'],
    free_quota_amount: candidate.quota_unlimited ? null : candidate.quota_remaining,
    free_quota_unit: candidate.quota_unlimited ? 'unlimited owner capacity' : 'verified free allocation',
    quota_remaining: candidate.quota_remaining,
    quota_verified: candidate.quota_verified === true,
    quota_unlimited: candidate.quota_unlimited === true,
    billing_enabled: false,
    billing_risk: 'none',
    payment_method_present: false,
    monetary_cost_per_unit_eur: 0,
    quality_score: Math.min(100, assessment.capacity_score || 0),
    reliability_score: candidate.reliability_score || 0,
    privacy_score: candidate.privacy_score || 0,
    provenance_score: local ? 100 : 90,
    quota_efficiency_score: 100,
    last_health_check: now.toISOString(),
    health_status: 'healthy',
    last_terms_check: candidate.last_terms_check || now.toISOString(),
    last_quota_check: now.toISOString(),
    supported_job_types: (assessment.supported_workloads || []).map(item => item === 'llm' ? 'llm.generate' : item === 'deterministic' ? 'deterministic.hash' : item),
    maximum_payload: 8 * 1024 * 1024,
    concurrency_limit: assessment.maximum_concurrency || 1,
    fallback_resource_ids: [],
    implementation_status: 'production',
    adapter_id: local ? 'matrix-local-agent' : 'owner-approved-free-compute',
    adapter_version: '1.0.0',
    enabled: assessment.state === 'approved-auto',
    manual_approval_required: !local,
    allowed_hosts: [],
    metadata: { ...candidate.metadata, source_type: candidate.source_type, capacity_score: assessment.capacity_score, supported_workloads: assessment.supported_workloads, owner_authorized: true, external: !local },
    notes: 'Admitted by the lawful zero-spend capacity-growth controller.',
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

export async function runCapacityGrowthCycle({
  localRuntimes = [], opportunityEvaluations = [], activeResources = [], queuedJobs = [], registerResource, now = new Date(), maximumExternalResources = 3
} = {}) {
  if (typeof registerResource !== 'function') throw new TypeError('registerResource is required');
  const candidates = [
    ...localRuntimes.map(runtime => localRuntimeToComputeCandidate(runtime, now)),
    ...opportunityEvaluations.map(item => opportunityEvaluationToComputeCandidate(item, now)).filter(Boolean)
  ];
  const portfolio = buildCapacityPortfolio({ candidates, activeResources, now, maximumExternalResources });
  const admitted = [];
  const candidateById = new Map(candidates.map(item => [item.candidate_id, item]));
  for (const assessment of portfolio.auto_admit) {
    const candidate = candidateById.get(assessment.candidate_id);
    const resource = computeCandidateToRegistryResource(candidate, assessment, now);
    const registered = await registerResource(resource);
    admitted.push(registered || resource);
  }
  const resources = [...activeResources, ...admitted];
  const allocation = allocateCapacity({ portfolio, jobs: queuedJobs, resources });
  return {
    ok: true,
    generated_at: now.toISOString(),
    discovered_candidates: candidates.length,
    admitted,
    owner_approval_queue: portfolio.owner_approval_queue,
    quarantined: portfolio.quarantined,
    portfolio,
    allocation,
    zero_spend_lock: true,
    paid_fallback_possible: false
  };
}

export const capacityGrowthInternals = { safeId, workloadMap };
