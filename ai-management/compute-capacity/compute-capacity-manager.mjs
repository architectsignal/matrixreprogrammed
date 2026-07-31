import { evaluateZeroSpendInvariant } from '../policy-engine/zero-spend-invariant.mjs';

const ALLOWED_SOURCES = new Set(['owner-local', 'owner-lan', 'official-free-program', 'official-community-pool']);
const AUTO_ADMIT_SOURCES = new Set(['owner-local', 'owner-lan']);
const ALLOWED_WORKLOADS = new Set(['deterministic', 'embedding', 'rerank', 'classification', 'summarization', 'llm']);

function clamp(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : minimum;
}

function safeArray(value, maximum = 100) {
  return Array.isArray(value) ? value.slice(0, maximum) : [];
}

function normalizedCapacity(candidate = {}) {
  const gpuMemoryMb = Math.max(0, Number(candidate.gpu_memory_mb || 0));
  const cpuThreads = Math.max(0, Number(candidate.cpu_threads || 0));
  const ramMb = Math.max(0, Number(candidate.ram_mb || 0));
  const quotaMinutes = Math.max(0, Number(candidate.free_quota_minutes || 0));
  const availability = clamp(candidate.availability_score ?? 50, 0, 100);
  const reliability = clamp(candidate.reliability_score ?? 50, 0, 100);
  const privacy = clamp(candidate.privacy_score ?? 50, 0, 100);
  const accelerator = gpuMemoryMb > 0 ? Math.log2(1 + gpuMemoryMb / 1024) * 18 : 0;
  const cpu = Math.log2(1 + cpuThreads) * 8;
  const memory = Math.log2(1 + ramMb / 1024) * 5;
  const quota = Math.log2(1 + quotaMinutes) * 4;
  return Math.round(accelerator + cpu + memory + quota + availability * 0.15 + reliability * 0.2 + privacy * 0.15);
}

function zeroSpendSubject(candidate = {}) {
  return {
    resource_tier: Number(candidate.resource_tier || (candidate.external ? 3 : 1)),
    external: candidate.external === true,
    monetary_cost_per_unit_eur: candidate.monetary_cost_per_unit_eur ?? 0,
    billing_enabled: candidate.billing_enabled,
    payment_method_present: candidate.payment_method_present,
    payment_method_required: candidate.payment_method_required,
    paid_fallback: candidate.paid_fallback,
    overage_possible: candidate.overage_possible,
    auto_upgrade_enabled: candidate.auto_upgrade_enabled,
    external_charge_possible: candidate.external_charge_possible,
    billing_risk: candidate.billing_risk,
    zero_cost_verified: candidate.zero_cost_verified,
    cost_confirmed_zero: candidate.cost_confirmed_zero,
    quota_verified: candidate.quota_verified,
    quota_unlimited: candidate.quota_unlimited,
    quota_remaining: candidate.quota_remaining ?? candidate.free_quota_minutes,
    zero_cost_evidence_at: candidate.zero_cost_evidence_at,
    last_pricing_check: candidate.last_pricing_check,
    last_terms_check: candidate.last_terms_check
  };
}

export function assessComputeCandidate(candidate = {}, { now = new Date() } = {}) {
  const sourceType = String(candidate.source_type || '');
  const blockers = [];
  const ownerActions = [];

  if (!ALLOWED_SOURCES.has(sourceType)) blockers.push('source-type-not-approved');
  if (candidate.owner_authorized !== true) blockers.push('owner-authorization-missing');
  if (candidate.access_controls_bypassed === true) blockers.push('access-control-bypass-forbidden');
  if (candidate.account_rotation === true) blockers.push('account-rotation-forbidden');
  if (candidate.quota_evasion === true) blockers.push('quota-evasion-forbidden');
  if (candidate.credential_harvesting === true) blockers.push('credential-harvesting-forbidden');
  if (candidate.terms_verified !== true) blockers.push('terms-not-verified');
  if (candidate.privacy_verified !== true) blockers.push('privacy-not-verified');
  if (candidate.automation_permission !== 'allowed') blockers.push('automation-permission-not-explicit');
  if (candidate.allowed_for_project !== true) blockers.push('project-use-not-explicitly-allowed');
  if (candidate.payment_method_required === true) blockers.push('payment-method-required');
  if (candidate.identity_verification_required === true) ownerActions.push('owner-identity-verification-required');
  if (candidate.account_required === true) ownerActions.push('owner-account-onboarding-required');
  if (candidate.authentication_type && candidate.authentication_type !== 'none') ownerActions.push('owner-credential-installation-required');
  if (!AUTO_ADMIT_SOURCES.has(sourceType)) ownerActions.push('owner-capacity-approval-required');

  const invariant = evaluateZeroSpendInvariant(zeroSpendSubject(candidate), {
    now,
    requireCurrentEvidence: candidate.external === true
  });
  blockers.push(...invariant.violations);

  const workloads = safeArray(candidate.supported_workloads, 20).filter(item => ALLOWED_WORKLOADS.has(String(item)));
  if (!workloads.length) blockers.push('no-supported-workloads');
  if (Number(candidate.maximum_concurrency || 0) < 1) blockers.push('invalid-concurrency');
  if (candidate.external === true && Number(candidate.free_quota_minutes || 0) <= 0) blockers.push('positive-free-quota-required');

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueOwnerActions = [...new Set(ownerActions)];
  const autoAdmissible = uniqueBlockers.length === 0 && uniqueOwnerActions.length === 0 && AUTO_ADMIT_SOURCES.has(sourceType);
  const state = uniqueBlockers.length ? 'quarantined' : autoAdmissible ? 'approved-auto' : 'awaiting-owner';

  return {
    candidate_id: candidate.candidate_id || candidate.resource_id || null,
    source_type: sourceType,
    state,
    auto_admissible: autoAdmissible,
    capacity_score: normalizedCapacity(candidate),
    supported_workloads: workloads,
    maximum_concurrency: clamp(candidate.maximum_concurrency || 1, 1, 64),
    free_quota_minutes: Math.max(0, Number(candidate.free_quota_minutes || 0)),
    blockers: uniqueBlockers,
    owner_actions: uniqueOwnerActions,
    zero_spend_lock: true,
    assessed_at: now.toISOString()
  };
}

export function buildCapacityPortfolio({ candidates = [], activeResources = [], now = new Date(), maximumExternalResources = 3 } = {}) {
  const assessments = candidates.map(candidate => assessComputeCandidate(candidate, { now }));
  const activeIds = new Set(activeResources.map(resource => resource.resource_id));
  const approvedLocal = assessments.filter(item => item.state === 'approved-auto' && !activeIds.has(item.candidate_id));
  const ownerQueue = assessments.filter(item => item.state === 'awaiting-owner');
  const quarantined = assessments.filter(item => item.state === 'quarantined');
  const externalApproved = ownerQueue
    .filter(item => item.owner_actions.length === 1 && item.owner_actions[0] === 'owner-capacity-approval-required')
    .sort((a, b) => b.capacity_score - a.capacity_score)
    .slice(0, Math.max(0, Number(maximumExternalResources || 0)));

  const currentPotential = activeResources.reduce((sum, resource) => sum + normalizedCapacity(resource), 0);
  const autoPotential = approvedLocal.reduce((sum, item) => sum + item.capacity_score, 0);
  const ownerApprovedPotential = externalApproved.reduce((sum, item) => sum + item.capacity_score, 0);

  return {
    generated_at: now.toISOString(),
    current_capacity_score: currentPotential,
    immediately_admissible_capacity_score: autoPotential,
    owner_approval_capacity_score: ownerApprovedPotential,
    projected_capacity_score: currentPotential + autoPotential + ownerApprovedPotential,
    auto_admit: approvedLocal,
    owner_approval_queue: ownerQueue.sort((a, b) => b.capacity_score - a.capacity_score),
    recommended_external_shortlist: externalApproved,
    quarantined,
    policy: {
      zero_spend_lock: true,
      payment_methods_forbidden: true,
      quota_evasion_forbidden: true,
      account_rotation_forbidden: true,
      credential_harvesting_forbidden: true,
      access_control_bypass_forbidden: true,
      external_compute_requires_owner_approval: true
    }
  };
}

export function allocateCapacity({ portfolio, jobs = [], resources = [] } = {}) {
  const resourceById = new Map(resources.map(resource => [resource.resource_id, resource]));
  const assignments = [];
  const deferred = [];
  const capacity = new Map(resources.map(resource => [resource.resource_id, clamp(resource.maximum_concurrency || 1, 1, 64)]));

  const orderedJobs = [...jobs].sort((a, b) => String(a.priority || 'P4').localeCompare(String(b.priority || 'P4')) || Number(a.created_at || 0) - Number(b.created_at || 0));
  for (const job of orderedJobs) {
    const workload = String(job.workload || job.capability_type || '');
    const eligible = resources
      .filter(resource => resource.enabled !== false)
      .filter(resource => resource.owner_authorized === true)
      .filter(resource => safeArray(resource.supported_workloads, 20).includes(workload))
      .filter(resource => (capacity.get(resource.resource_id) || 0) > 0)
      .filter(resource => assessComputeCandidate(resource).state !== 'quarantined')
      .sort((a, b) => normalizedCapacity(b) - normalizedCapacity(a));
    const selected = eligible[0];
    if (!selected) {
      deferred.push({ job_id: job.job_id || null, reason: 'no-lawful-zero-spend-capacity' });
      continue;
    }
    capacity.set(selected.resource_id, capacity.get(selected.resource_id) - 1);
    assignments.push({
      job_id: job.job_id || null,
      resource_id: selected.resource_id,
      workload,
      monetary_ceiling_eur: 0,
      external_network_allowed: job.external_network_allowed === true && selected.public_retrieval_only === true,
      reversible: true
    });
  }

  return { assignments, deferred, zero_spend_lock: true, projected_capacity_score: portfolio?.projected_capacity_score || 0 };
}

export const computeCapacityInternals = {
  ALLOWED_SOURCES,
  AUTO_ADMIT_SOURCES,
  ALLOWED_WORKLOADS,
  normalizedCapacity,
  zeroSpendSubject
};
