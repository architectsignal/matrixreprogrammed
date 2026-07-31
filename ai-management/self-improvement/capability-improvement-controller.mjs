import { evaluateZeroSpendInvariant } from '../policy-engine/zero-spend-invariant.mjs';

const ALLOWED_IMPROVEMENTS = new Set([
  'public_data',
  'local_inference',
  'remote_free_compute',
  'storage',
  'search',
  'monitoring'
]);

function clamp(value, minimum = 0, maximum = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : minimum;
}

function capabilityGap(target = 0, current = 0) {
  return clamp(target) - clamp(current);
}

function improvementScore(candidate = {}, gap = 0) {
  const utility = clamp(candidate.utility_score ?? 50);
  const reliability = clamp(candidate.reliability_score ?? 50);
  const privacy = clamp(candidate.privacy_score ?? 50);
  const quota = clamp(candidate.quota_score ?? 50);
  const integration = clamp(candidate.integration_confidence ?? 50);
  const riskPenalty = clamp(candidate.risk_score ?? 0);
  return Math.round((gap * 0.35) + (utility * 0.2) + (reliability * 0.15) + (privacy * 0.1) + (quota * 0.1) + (integration * 0.1) - (riskPenalty * 0.4));
}

function zeroSpendSubject(candidate = {}) {
  return {
    resource_tier: Number(candidate.resource_tier || 3),
    external: candidate.external !== false,
    monetary_cost_per_unit_eur: candidate.monetary_cost_per_unit_eur ?? candidate.cost_per_unit ?? 0,
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
    quota_remaining: candidate.quota_remaining ?? candidate.free_quota,
    zero_cost_evidence_at: candidate.zero_cost_evidence_at,
    last_pricing_check: candidate.last_pricing_check,
    last_terms_check: candidate.last_terms_check
  };
}

export function assessCapabilityGaps({ targets = {}, current = {} } = {}) {
  return Object.keys(targets)
    .filter(capability => ALLOWED_IMPROVEMENTS.has(capability))
    .map(capability => ({
      capability,
      target: clamp(targets[capability]),
      current: clamp(current[capability]),
      gap: capabilityGap(targets[capability], current[capability])
    }))
    .filter(item => item.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.capability.localeCompare(b.capability));
}

export function planCapabilityImprovements({ gaps = [], candidates = [], now = new Date(), maximumPlans = 5 } = {}) {
  const gapByCapability = new Map(gaps.map(item => [item.capability, item]));
  const plans = [];
  const quarantined = [];

  for (const candidate of candidates) {
    const capability = String(candidate.capability_type || '');
    const gap = gapByCapability.get(capability);
    if (!gap) continue;

    const blockers = [];
    if (!ALLOWED_IMPROVEMENTS.has(capability)) blockers.push('capability-not-approved');
    if (candidate.automation_permission !== 'allowed') blockers.push('automation-permission-not-explicit');
    if (candidate.terms_verified !== true) blockers.push('terms-not-verified');
    if (candidate.privacy_verified !== true) blockers.push('privacy-not-verified');
    if (candidate.account_required === true) blockers.push('account-required');
    if (candidate.identity_verification_required === true) blockers.push('identity-verification-required');
    if (candidate.authentication_type && candidate.authentication_type !== 'none') blockers.push('credentials-required');

    const invariant = evaluateZeroSpendInvariant(zeroSpendSubject(candidate), {
      now,
      requireCurrentEvidence: candidate.external !== false
    });
    blockers.push(...invariant.violations);

    if (blockers.length) {
      quarantined.push({
        candidate_id: candidate.candidate_id || candidate.opportunity_id || null,
        capability,
        state: 'quarantined',
        blockers: [...new Set(blockers)]
      });
      continue;
    }

    plans.push({
      candidate_id: candidate.candidate_id || candidate.opportunity_id || null,
      capability,
      gap: gap.gap,
      score: improvementScore(candidate, gap.gap),
      action: capability === 'public_data' ? 'adapter-factory-certify' : 'bounded-resource-benchmark',
      maximum_probe_requests: 2,
      maximum_probe_bytes: Math.min(1024 * 1024, Math.max(1024, Number(candidate.maximum_probe_bytes || 262144))),
      maximum_probe_duration_ms: Math.min(15000, Math.max(1000, Number(candidate.maximum_probe_duration_ms || 5000))),
      zero_spend_lock: true,
      data_classes: ['public'],
      activation_state: 'pending-certification'
    });
  }

  plans.sort((a, b) => b.score - a.score || String(a.candidate_id).localeCompare(String(b.candidate_id)));
  return { plans: plans.slice(0, Math.max(0, Number(maximumPlans || 0))), quarantined };
}

export function evaluateResourceRegression(resource = {}, observations = {}, { now = new Date() } = {}) {
  const invariant = evaluateZeroSpendInvariant(zeroSpendSubject({ ...resource, ...observations }), {
    now,
    requireCurrentEvidence: resource.external !== false
  });
  const blockers = [...invariant.violations];
  if (Number(observations.consecutive_failures || 0) >= 3) blockers.push('repeated-health-failure');
  if (Number(observations.success_rate ?? 1) < 0.8) blockers.push('success-rate-below-threshold');
  if (Number(observations.error_rate ?? 0) > 0.2) blockers.push('error-rate-above-threshold');
  if (observations.terms_changed === true) blockers.push('terms-changed-revalidation-required');
  if (observations.host_changed === true) blockers.push('provider-host-changed');

  const uniqueBlockers = [...new Set(blockers)];
  return {
    resource_id: resource.resource_id || null,
    healthy: uniqueBlockers.length === 0,
    action: uniqueBlockers.length === 0 ? 'retain' : 'suspend-and-quarantine',
    blockers: uniqueBlockers,
    checked_at: now.toISOString()
  };
}

export async function runCapabilityImprovementCycle({
  targets = {},
  current = {},
  candidates = [],
  resources = [],
  observations = {},
  certifyCandidate,
  benchmarkCandidate,
  registerResource,
  suspendResource,
  now = new Date(),
  maximumPlans = 5
} = {}) {
  const gaps = assessCapabilityGaps({ targets, current });
  const { plans, quarantined } = planCapabilityImprovements({ gaps, candidates, now, maximumPlans });
  const admitted = [];
  const failed = [];
  const suspended = [];

  for (const plan of plans) {
    try {
      const candidate = candidates.find(item => (item.candidate_id || item.opportunity_id) === plan.candidate_id);
      const certification = await certifyCandidate(candidate, plan);
      if (!certification?.certified) throw new Error('candidate-not-certified');
      const benchmark = await benchmarkCandidate(candidate, certification, plan);
      if (!benchmark?.passed || benchmark?.cost_confirmed_zero !== true) throw new Error('benchmark-not-zero-cost-or-failed');
      const registration = await registerResource(candidate, certification, benchmark, plan);
      admitted.push({ candidate_id: plan.candidate_id, resource_id: registration?.resource_id || null, score: plan.score });
    } catch (error) {
      failed.push({ candidate_id: plan.candidate_id, reason: error?.message || 'improvement-cycle-failed' });
    }
  }

  for (const resource of resources) {
    const regression = evaluateResourceRegression(resource, observations[resource.resource_id] || {}, { now });
    if (regression.action === 'suspend-and-quarantine') {
      await suspendResource(resource, regression);
      suspended.push(regression);
    }
  }

  return {
    generated_at: now.toISOString(),
    gaps,
    planned: plans,
    admitted,
    suspended,
    quarantined,
    failed,
    zero_spend_lock: true
  };
}

export const capabilityImprovementInternals = {
  ALLOWED_IMPROVEMENTS,
  clamp,
  capabilityGap,
  improvementScore,
  zeroSpendSubject
};
