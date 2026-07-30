export const DEFAULT_UTILITY_WEIGHTS = Object.freeze({
  quality_score: 0.30,
  reliability_score: 0.20,
  latency_score: 0.15,
  provenance_score: 0.15,
  privacy_score: 0.10,
  quota_efficiency_score: 0.10
});

function dateExpired(value, now) {
  if (!value) return false;
  const time = Date.parse(value);
  return !Number.isFinite(time) || time <= now.getTime();
}

function dateStale(value, now, maximumAgeMs) {
  const time = Date.parse(value || '');
  return !Number.isFinite(time) || now.getTime() - time < 0 || now.getTime() - time > maximumAgeMs;
}

function hostAllowed(resource, job) {
  if (!job.payload?.url) return true;
  let hostname;
  try { hostname = new URL(job.payload.url).hostname.toLowerCase(); } catch { return false; }
  const allowed = resource.allowed_hosts || [];
  return !allowed.length || allowed.some(host => hostname === String(host).toLowerCase());
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, Number(value || 0)));
}

export function utilityScore(resource, weights = DEFAULT_UTILITY_WEIGHTS) {
  return Number(Object.entries(weights).reduce((total, [field, weight]) => {
    return total + clamp(resource[field]) * weight;
  }, 0).toFixed(4));
}

export function evaluateResource(resource, job, context = {}) {
  const reasons = [];
  const now = context.now instanceof Date ? context.now : new Date(context.now || Date.now());
  const external = Number(resource.resource_tier) >= 3;
  const approvedData = resource.approved_data_classes || [];
  const prohibitedData = resource.prohibited_data_classes || [];
  const supportedJobs = resource.supported_job_types || [];
  const capabilities = resource.capability_types || [];

  if (!resource.enabled) reasons.push('resource-disabled');
  if (resource.manual_approval_required) reasons.push('manual-approval-required');
  if (!resource.approved_for_automation) reasons.push('automation-not-approved');
  if (!['production', 'batch'].includes(resource.implementation_status)) reasons.push('implementation-not-approved');
  if (Number(resource.monetary_cost_per_unit_eur ?? 0) !== 0) reasons.push('non-zero-monetary-cost');
  if (resource.billing_enabled !== false) reasons.push('billing-enabled-or-unknown');
  if (resource.payment_method_present !== false) reasons.push('payment-method-present-or-unknown');
  if (resource.billing_risk !== 'none') reasons.push('billing-risk-not-zero');
  if (!['none', 'environment_secret', 'managed_identity', 'manual'].includes(resource.authentication_type)) reasons.push('authentication-type-unknown');
  if (resource.authentication_type === 'environment_secret' && !resource.credential_reference) reasons.push('credential-binding-missing');
  if (!resource.quota_verified) reasons.push('quota-unverified');
  if (!resource.quota_unlimited && resource.quota_remaining == null) reasons.push('quota-remaining-unknown');
  if (!approvedData.includes(job.data_class)) reasons.push('data-class-not-approved');
  if (prohibitedData.includes(job.data_class)) reasons.push('data-class-prohibited');
  if (!supportedJobs.includes(job.job_type)) reasons.push('job-type-unsupported');
  if (!capabilities.includes(job.capability_type)) reasons.push('capability-unsupported');
  if (Number(resource.quality_score || 0) < Number(job.requirements.minimum_quality_score || 0)) reasons.push('quality-below-requirement');
  if (Number(resource.provenance_score || 0) < Number(job.requirements.minimum_provenance_score || 0)) reasons.push('provenance-below-requirement');
  if (resource.cooldown_until && !dateExpired(resource.cooldown_until, now)) reasons.push('circuit-cooldown-active');
  if (external && (dateStale(resource.last_health_check, now, 14 * 86400000) || !['healthy', 'degraded'].includes(resource.health_status))) reasons.push('provider-health-unknown-stale-or-unhealthy');
  if (external && (!resource.last_terms_check || !resource.terms_revalidation_due || dateExpired(resource.terms_revalidation_due, now))) reasons.push('terms-check-missing-or-expired');
  if (external && dateStale(resource.last_quota_check, now, 7 * 86400000)) reasons.push('quota-check-missing-or-stale');
  if (external && context.externalEnabled === false) reasons.push('external-resources-disabled');
  if (external && context.localOnly === true) reasons.push('local-only-mode');
  if (context.zeroSpendLock === false) reasons.push('zero-spend-lock-required');
  if (!hostAllowed(resource, job)) reasons.push('resource-host-scope-mismatch');

  if (!resource.quota_unlimited && resource.quota_remaining != null) {
    const usable = Number(resource.quota_remaining) - Number(resource.quota_reserved || 0) - Number(resource.hard_stop_threshold || 0);
    if (usable < Number(job.payload?.quota_units || 1)) reasons.push('quota-safety-margin-reached');
  }

  let compatibility = null;
  if (typeof context.resourceEligibilityEvaluator === 'function') {
    try {
      compatibility = context.resourceEligibilityEvaluator(resource, job, { ...context, now });
      if (compatibility?.eligible === false) reasons.push(...(compatibility.reasons || ['resource-incompatible-with-job']));
    } catch {
      reasons.push('resource-compatibility-evaluation-failed');
    }
  }

  let score = null;
  let scoreAdjustment = 0;
  if (!reasons.length) {
    score = utilityScore(resource, context.weights || DEFAULT_UTILITY_WEIGHTS);
    if (typeof context.resourceScoreAdjuster === 'function') {
      try { scoreAdjustment = Number(context.resourceScoreAdjuster(resource, job, { ...context, now }) || 0); }
      catch { scoreAdjustment = -100; }
    }
    score = Number(clamp(score + scoreAdjustment).toFixed(4));
  }

  return { eligible: reasons.length === 0, reasons, utility_score: score, score_adjustment: scoreAdjustment, compatibility };
}

export function rankResources(resources, job, context = {}) {
  const eligible = [];
  const excluded = [];
  for (const resource of resources) {
    const decision = evaluateResource(resource, job, context);
    if (decision.eligible) eligible.push({ resource, ...decision });
    else excluded.push({ resource_id: resource.resource_id, reasons: decision.reasons, compatibility: decision.compatibility || null });
  }
  eligible.sort((left, right) =>
    right.utility_score - left.utility_score ||
    Number(left.resource.resource_tier) - Number(right.resource.resource_tier) ||
    String(left.resource.resource_id).localeCompare(String(right.resource.resource_id))
  );
  return { eligible, excluded };
}

export const policyInternals = { dateExpired, dateStale, hostAllowed, clamp };
