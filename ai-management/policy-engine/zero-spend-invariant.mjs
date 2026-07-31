export const ZERO_SPEND_INVARIANT_CODE = 'ZERO_SPEND_INVARIANT_VIOLATION';
export const ZERO_SPEND_MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function booleanIs(value, expected) {
  return value === expected;
}

function finiteZero(value) {
  return Number.isFinite(Number(value)) && Number(value) === 0;
}

function evidenceIsCurrent(value, now, maximumAgeMs) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= 0 && age <= maximumAgeMs;
}

function legacyZeroSpendCertified(subject) {
  return finiteZero(subject.monetary_cost_per_unit_eur ?? subject.cost_per_unit ?? subject.cost_eur ?? 0) &&
    subject.billing_enabled === false &&
    subject.payment_method_present === false &&
    String(subject.billing_risk || '') === 'none' &&
    (subject.zero_cost_verified === true || subject.cost_confirmed_zero === true);
}

function explicitFalseOrCertified(value, certified) {
  return value === false || (value == null && certified);
}

export function evaluateZeroSpendInvariant(subject = {}, {
  now = new Date(),
  requireCurrentEvidence = Number(subject.resource_tier || 0) >= 3 || subject.external === true,
  maximumEvidenceAgeMs = ZERO_SPEND_MAX_EVIDENCE_AGE_MS
} = {}) {
  const violations = [];
  const certifiedLegacyRecord = legacyZeroSpendCertified(subject);

  if (!finiteZero(subject.monetary_cost_per_unit_eur ?? subject.cost_per_unit ?? subject.cost_eur ?? 0)) {
    violations.push('non-zero-or-unknown-cost');
  }
  if (!booleanIs(subject.billing_enabled, false)) violations.push('billing-enabled-or-unknown');
  if (!booleanIs(subject.payment_method_present, false) || subject.payment_method_required === true) {
    violations.push('payment-method-present-required-or-unknown');
  }
  if (!explicitFalseOrCertified(subject.paid_fallback, certifiedLegacyRecord)) violations.push('paid-fallback-enabled-or-unknown');
  if (!explicitFalseOrCertified(subject.overage_possible, certifiedLegacyRecord)) violations.push('overage-possible-or-unknown');
  if (!explicitFalseOrCertified(subject.auto_upgrade_enabled, certifiedLegacyRecord)) violations.push('auto-upgrade-enabled-or-unknown');
  if (!explicitFalseOrCertified(subject.external_charge_possible, certifiedLegacyRecord)) violations.push('external-charge-possible-or-unknown');
  if (String(subject.billing_risk || 'unknown') !== 'none') violations.push('billing-risk-not-none');
  if (subject.zero_cost_verified !== true && subject.cost_confirmed_zero !== true) violations.push('zero-cost-not-verified');
  if (subject.quota_verified !== true) violations.push('quota-not-verified');

  const quotaUnlimited = subject.quota_unlimited === true;
  const quotaRemaining = Number(subject.quota_remaining ?? subject.free_quota ?? 0);
  if (!quotaUnlimited && (!Number.isFinite(quotaRemaining) || quotaRemaining <= 0)) {
    violations.push('positive-free-quota-not-proven');
  }

  if (requireCurrentEvidence && !evidenceIsCurrent(
    subject.zero_cost_evidence_at || subject.last_pricing_check || subject.last_terms_check,
    now,
    maximumEvidenceAgeMs
  )) {
    violations.push('zero-cost-evidence-missing-or-stale');
  }

  return {
    ok: violations.length === 0,
    code: violations.length ? ZERO_SPEND_INVARIANT_CODE : null,
    violations: [...new Set(violations)]
  };
}

export function assertZeroSpendInvariant(subject, options = {}) {
  const result = evaluateZeroSpendInvariant(subject, options);
  if (result.ok) return result;
  const error = new Error(`${ZERO_SPEND_INVARIANT_CODE}: ${result.violations.join(', ')}`);
  error.code = ZERO_SPEND_INVARIANT_CODE;
  error.violations = result.violations;
  throw error;
}

export function zeroSpendReceipt(subject = {}, options = {}) {
  const result = assertZeroSpendInvariant(subject, options);
  return Object.freeze({
    cost_confirmed_zero: true,
    billing_risk: 'none',
    external_charge_possible: false,
    invariant_code: ZERO_SPEND_INVARIANT_CODE,
    verified_at: (options.now instanceof Date ? options.now : new Date()).toISOString(),
    violations: result.violations
  });
}

export const zeroSpendInvariantInternals = { booleanIs, finiteZero, evidenceIsCurrent, legacyZeroSpendCertified, explicitFalseOrCertified };
