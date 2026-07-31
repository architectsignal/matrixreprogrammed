import assert from 'node:assert/strict';
import { evaluateResource } from '../ai-management/policy-engine/zero-spend-policy.mjs';

const now = new Date('2026-07-31T08:00:00.000Z');
const resource = {
  resource_id: 'remote-compute-test',
  capability_types: ['remote_compute'],
  resource_tier: 2,
  approved_for_automation: true,
  approved_data_classes: ['public'],
  prohibited_data_classes: ['internal', 'confidential', 'restricted'],
  supported_job_types: ['remote-compute.reserve'],
  enabled: true,
  manual_approval_required: false,
  implementation_status: 'batch',
  monetary_cost_per_unit_eur: 0,
  billing_enabled: false,
  payment_method_present: false,
  billing_risk: 'none',
  authentication_type: 'environment_secret',
  credential_reference: 'REMOTE_TOKEN',
  quota_verified: true,
  quota_unlimited: false,
  quota_remaining: 10,
  quota_reserved: 0,
  hard_stop_threshold: 1,
  quality_score: 80,
  provenance_score: 95,
  health_status: 'healthy',
  last_health_check: now.toISOString(),
  last_terms_check: now.toISOString(),
  terms_revalidation_due: '2026-08-07T00:00:00.000Z',
  last_quota_check: now.toISOString(),
  cooldown_until: null,
  allowed_hosts: [],
  metadata: { remote_compute: true }
};
const job = {
  job_type: 'remote-compute.reserve',
  capability_type: 'remote_compute',
  data_class: 'public',
  payload: { quota_units: 1 },
  requirements: { minimum_quality_score: 0, minimum_provenance_score: 0 }
};

const allowed = evaluateResource(resource, job, { now, externalEnabled: true, localOnly: false, zeroSpendLock: true });
assert.equal(allowed.eligible, true);

const staleHealth = evaluateResource({ ...resource, last_health_check: '2026-07-01T00:00:00.000Z' }, job, {
  now, externalEnabled: true, localOnly: false, zeroSpendLock: true
});
assert.equal(staleHealth.eligible, false);
assert.ok(staleHealth.reasons.includes('provider-health-unknown-stale-or-unhealthy'));

const staleQuota = evaluateResource({ ...resource, last_quota_check: '2026-07-01T00:00:00.000Z' }, job, {
  now, externalEnabled: true, localOnly: false, zeroSpendLock: true
});
assert.equal(staleQuota.eligible, false);
assert.ok(staleQuota.reasons.includes('quota-check-missing-or-stale'));

const externalDisabled = evaluateResource(resource, job, { now, externalEnabled: false, localOnly: false, zeroSpendLock: true });
assert.equal(externalDisabled.eligible, false);
assert.ok(externalDisabled.reasons.includes('external-resources-disabled'));

console.log('Remote compute policy tests passed: temporary tier-2 compute is still treated as external for health, terms, quota and enablement gates.');
