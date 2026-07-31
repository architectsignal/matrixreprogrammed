import assert from 'node:assert/strict';
import { assertZeroSpendInvariant, evaluateZeroSpendInvariant, zeroSpendReceipt, ZERO_SPEND_INVARIANT_CODE } from '../ai-management/policy-engine/zero-spend-invariant.mjs';
import { evaluateResource } from '../ai-management/policy-engine/zero-spend-policy.mjs';

const now = new Date('2026-07-31T16:00:00.000Z');
const certifiedExternal = {
  resource_id: 'certified-free-provider',
  resource_tier: 3,
  enabled: true,
  manual_approval_required: false,
  approved_for_automation: true,
  implementation_status: 'production',
  monetary_cost_per_unit_eur: 0,
  billing_enabled: false,
  payment_method_present: false,
  payment_method_required: false,
  paid_fallback: false,
  overage_possible: false,
  auto_upgrade_enabled: false,
  external_charge_possible: false,
  billing_risk: 'none',
  zero_cost_verified: true,
  zero_cost_evidence_at: '2026-07-31T15:00:00.000Z',
  quota_verified: true,
  quota_unlimited: false,
  quota_remaining: 100,
  quota_reserved: 0,
  hard_stop_threshold: 5,
  authentication_type: 'none',
  approved_data_classes: ['public'],
  prohibited_data_classes: ['internal', 'confidential', 'restricted'],
  supported_job_types: ['public-data.fetch'],
  capability_types: ['retrieval'],
  quality_score: 90,
  provenance_score: 90,
  last_health_check: '2026-07-31T15:00:00.000Z',
  health_status: 'healthy',
  last_terms_check: '2026-07-31T15:00:00.000Z',
  terms_revalidation_due: '2026-08-07T15:00:00.000Z',
  last_quota_check: '2026-07-31T15:00:00.000Z',
  allowed_hosts: ['example.test']
};

const invariant = evaluateZeroSpendInvariant(certifiedExternal, { now, requireCurrentEvidence: true });
assert.equal(invariant.ok, true);
assert.equal(assertZeroSpendInvariant(certifiedExternal, { now, requireCurrentEvidence: true }).ok, true);
assert.deepEqual(zeroSpendReceipt(certifiedExternal, { now, requireCurrentEvidence: true }), {
  cost_confirmed_zero: true,
  billing_risk: 'none',
  external_charge_possible: false,
  invariant_code: ZERO_SPEND_INVARIANT_CODE,
  verified_at: now.toISOString(),
  violations: []
});

for (const mutation of [
  { monetary_cost_per_unit_eur: 0.000001 },
  { billing_enabled: true },
  { payment_method_present: true },
  { paid_fallback: true },
  { overage_possible: true },
  { auto_upgrade_enabled: true },
  { external_charge_possible: true },
  { billing_risk: 'metered' },
  { zero_cost_verified: false },
  { quota_verified: false },
  { quota_remaining: 0 },
  { zero_cost_evidence_at: '2026-07-01T00:00:00.000Z' }
]) {
  const result = evaluateZeroSpendInvariant({ ...certifiedExternal, ...mutation }, { now, requireCurrentEvidence: true });
  assert.equal(result.ok, false, `mutation should violate invariant: ${JSON.stringify(mutation)}`);
  assert.throws(
    () => assertZeroSpendInvariant({ ...certifiedExternal, ...mutation }, { now, requireCurrentEvidence: true }),
    error => error?.code === ZERO_SPEND_INVARIANT_CODE
  );
}

const job = {
  data_class: 'public',
  job_type: 'public-data.fetch',
  capability_type: 'retrieval',
  payload: { url: 'https://example.test/data', quota_units: 1 },
  requirements: { minimum_quality_score: 0, minimum_provenance_score: 0 }
};
assert.equal(evaluateResource(certifiedExternal, job, { now, zeroSpendLock: true, externalEnabled: true }).eligible, true);
const paidDecision = evaluateResource({ ...certifiedExternal, paid_fallback: true }, job, { now, zeroSpendLock: true, externalEnabled: true });
assert.equal(paidDecision.eligible, false);
assert(paidDecision.reasons.includes('zero-spend-invariant:paid-fallback-enabled-or-unknown'));

console.log('Zero-spend invariant passed: any cost, billing path, payment method, overage, paid fallback, stale evidence or unverified quota is rejected before broker execution.');
