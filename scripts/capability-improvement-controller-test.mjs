import assert from 'node:assert/strict';
import {
  assessCapabilityGaps,
  planCapabilityImprovements,
  evaluateResourceRegression,
  runCapabilityImprovementCycle
} from '../ai-management/self-improvement/capability-improvement-controller.mjs';

const now = new Date('2026-07-31T18:00:00.000Z');
const baseCandidate = {
  candidate_id: 'candidate-free-public-data',
  capability_type: 'public_data',
  external: true,
  automation_permission: 'allowed',
  terms_verified: true,
  privacy_verified: true,
  account_required: false,
  identity_verification_required: false,
  authentication_type: 'none',
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
  quota_verified: true,
  quota_unlimited: false,
  free_quota: 100,
  zero_cost_evidence_at: now.toISOString(),
  utility_score: 90,
  reliability_score: 85,
  privacy_score: 95,
  quota_score: 80,
  integration_confidence: 90,
  risk_score: 5
};

const gaps = assessCapabilityGaps({
  targets: { public_data: 90, remote_free_compute: 80, search: 70, forbidden: 100 },
  current: { public_data: 40, remote_free_compute: 20, search: 70, forbidden: 0 }
});
assert.deepEqual(gaps.map(item => item.capability), ['remote_free_compute', 'public_data']);

const planned = planCapabilityImprovements({ gaps, candidates: [baseCandidate], now });
assert.equal(planned.plans.length, 1);
assert.equal(planned.plans[0].action, 'adapter-factory-certify');
assert.equal(planned.plans[0].zero_spend_lock, true);
assert.deepEqual(planned.plans[0].data_classes, ['public']);

for (const mutation of [
  { payment_method_present: true },
  { payment_method_required: true },
  { billing_enabled: true },
  { paid_fallback: true },
  { overage_possible: true },
  { auto_upgrade_enabled: true },
  { external_charge_possible: true },
  { billing_risk: 'unknown' },
  { zero_cost_verified: false },
  { quota_verified: false },
  { free_quota: 0 },
  { automation_permission: 'unknown' },
  { terms_verified: false },
  { privacy_verified: false },
  { account_required: true },
  { identity_verification_required: true },
  { authentication_type: 'api_key' }
]) {
  const result = planCapabilityImprovements({ gaps, candidates: [{ ...baseCandidate, ...mutation }], now });
  assert.equal(result.plans.length, 0, `unsafe candidate must not be planned: ${JSON.stringify(mutation)}`);
  assert.equal(result.quarantined.length, 1);
}

const healthy = evaluateResourceRegression({ ...baseCandidate, resource_id: 'resource-safe' }, {
  consecutive_failures: 0,
  success_rate: 0.99,
  error_rate: 0.01
}, { now });
assert.equal(healthy.action, 'retain');

const regressed = evaluateResourceRegression({ ...baseCandidate, resource_id: 'resource-bad' }, {
  payment_method_present: true,
  consecutive_failures: 3,
  success_rate: 0.5,
  error_rate: 0.5
}, { now });
assert.equal(regressed.action, 'suspend-and-quarantine');
assert.ok(regressed.blockers.includes('payment-method-present-required-or-unknown'));
assert.ok(regressed.blockers.includes('repeated-health-failure'));

const calls = [];
const cycle = await runCapabilityImprovementCycle({
  targets: { public_data: 90 },
  current: { public_data: 40 },
  candidates: [baseCandidate],
  resources: [{ ...baseCandidate, resource_id: 'resource-regressed' }],
  observations: {
    'resource-regressed': { terms_changed: true, success_rate: 0.6, error_rate: 0.4 }
  },
  now,
  certifyCandidate: async candidate => {
    calls.push(`certify:${candidate.candidate_id}`);
    return { certified: true, certification_state: 'sandbox-certified' };
  },
  benchmarkCandidate: async candidate => {
    calls.push(`benchmark:${candidate.candidate_id}`);
    return { passed: true, cost_confirmed_zero: true, latency_ms: 100 };
  },
  registerResource: async candidate => {
    calls.push(`register:${candidate.candidate_id}`);
    return { resource_id: 'resource-new' };
  },
  suspendResource: async resource => {
    calls.push(`suspend:${resource.resource_id}`);
  }
});

assert.deepEqual(calls, [
  'certify:candidate-free-public-data',
  'benchmark:candidate-free-public-data',
  'register:candidate-free-public-data',
  'suspend:resource-regressed'
]);
assert.equal(cycle.admitted.length, 1);
assert.equal(cycle.suspended.length, 1);
assert.equal(cycle.zero_spend_lock, true);

const failedCycle = await runCapabilityImprovementCycle({
  targets: { public_data: 90 },
  current: { public_data: 40 },
  candidates: [baseCandidate],
  resources: [],
  now,
  certifyCandidate: async () => ({ certified: true }),
  benchmarkCandidate: async () => ({ passed: true, cost_confirmed_zero: false }),
  registerResource: async () => {
    throw new Error('must-not-register');
  },
  suspendResource: async () => {}
});
assert.equal(failedCycle.admitted.length, 0);
assert.equal(failedCycle.failed.length, 1);
assert.equal(failedCycle.failed[0].reason, 'benchmark-not-zero-cost-or-failed');

console.log('Capability improvement controller tests passed: gap detection, zero-spend planning, bounded certification, broker admission and automatic regression suspension.');
