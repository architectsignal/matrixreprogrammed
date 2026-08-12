import assert from 'node:assert/strict';
import { assessComputeCandidate, buildCapacityPortfolio, allocateCapacity } from '../ai-management/compute-capacity/compute-capacity-manager.mjs';

const now = new Date('2026-07-31T20:00:00.000Z');
const evidenceTime = '2026-07-31T19:00:00.000Z';

const local = {
  candidate_id: 'owner-node-a',
  resource_id: 'owner-node-a',
  source_type: 'owner-local',
  external: false,
  owner_authorized: true,
  allowed_for_project: true,
  automation_permission: 'allowed',
  terms_verified: true,
  privacy_verified: true,
  payment_method_required: false,
  payment_method_present: false,
  billing_enabled: false,
  billing_risk: 'none',
  monetary_cost_per_unit_eur: 0,
  zero_cost_verified: true,
  cost_confirmed_zero: true,
  quota_verified: true,
  quota_unlimited: true,
  maximum_concurrency: 2,
  cpu_threads: 16,
  ram_mb: 65536,
  gpu_memory_mb: 16384,
  supported_workloads: ['deterministic', 'embedding', 'llm']
};

const officialFree = {
  candidate_id: 'official-free-gpu',
  resource_id: 'official-free-gpu',
  source_type: 'official-free-program',
  external: true,
  owner_authorized: true,
  allowed_for_project: true,
  automation_permission: 'allowed',
  terms_verified: true,
  privacy_verified: true,
  account_required: false,
  identity_verification_required: false,
  authentication_type: 'none',
  payment_method_required: false,
  payment_method_present: false,
  billing_enabled: false,
  paid_fallback: false,
  overage_possible: false,
  auto_upgrade_enabled: false,
  external_charge_possible: false,
  billing_risk: 'none',
  monetary_cost_per_unit_eur: 0,
  zero_cost_verified: true,
  cost_confirmed_zero: true,
  quota_verified: true,
  quota_remaining: 120,
  free_quota_minutes: 120,
  zero_cost_evidence_at: evidenceTime,
  last_pricing_check: evidenceTime,
  last_terms_check: evidenceTime,
  maximum_concurrency: 1,
  gpu_memory_mb: 24576,
  supported_workloads: ['embedding', 'classification', 'llm']
};

const unsafe = {
  ...officialFree,
  candidate_id: 'rotating-free-accounts',
  resource_id: 'rotating-free-accounts',
  account_rotation: true,
  quota_evasion: true
};

const localAssessment = assessComputeCandidate(local, { now });
assert.equal(localAssessment.state, 'approved-auto');
assert.equal(localAssessment.auto_admissible, true);
assert.equal(localAssessment.blockers.length, 0);

const officialAssessment = assessComputeCandidate(officialFree, { now });
assert.equal(officialAssessment.state, 'awaiting-owner');
assert.deepEqual(officialAssessment.owner_actions, ['owner-capacity-approval-required']);
assert.equal(officialAssessment.blockers.length, 0);

const unsafeAssessment = assessComputeCandidate(unsafe, { now });
assert.equal(unsafeAssessment.state, 'quarantined');
assert.ok(unsafeAssessment.blockers.includes('account-rotation-forbidden'));
assert.ok(unsafeAssessment.blockers.includes('quota-evasion-forbidden'));

const portfolio = buildCapacityPortfolio({ candidates: [local, officialFree, unsafe], activeResources: [], now });
assert.equal(portfolio.auto_admit.length, 1);
assert.equal(portfolio.owner_approval_queue.length, 1);
assert.equal(portfolio.recommended_external_shortlist.length, 1);
assert.equal(portfolio.quarantined.length, 1);
assert.ok(portfolio.projected_capacity_score > portfolio.current_capacity_score);
assert.equal(portfolio.policy.payment_methods_forbidden, true);
assert.equal(portfolio.policy.access_control_bypass_forbidden, true);

const filteredPortfolio = buildCapacityPortfolio({
  candidates: [],
  now,
  activeResources: [
    { ...local, enabled: true, approved_for_automation: true, capability_types: ['llm'], health_status: 'healthy' },
    { ...local, resource_id: 'disabled-compute', enabled: false, approved_for_automation: true, capability_types: ['llm'], health_status: 'healthy' },
    { ...local, resource_id: 'public-api-not-compute', enabled: true, approved_for_automation: true, capability_types: ['public_data'], supported_workloads: [], health_status: 'healthy' }
  ]
});
assert.ok(filteredPortfolio.current_capacity_score > 0, 'usable compute contributes to current capacity');
assert.equal(filteredPortfolio.current_capacity_score, buildCapacityPortfolio({
  candidates: [], now, activeResources: [{ ...local, enabled: true, approved_for_automation: true, capability_types: ['llm'], health_status: 'healthy' }]
}).current_capacity_score, 'disabled and non-compute resources must not inflate current capacity');

const networkedLocalAssessment = assessComputeCandidate({ ...local, candidate_id: 'networked-local', external_network_used: true }, { now });
assert.equal(networkedLocalAssessment.state, 'quarantined');
assert.ok(networkedLocalAssessment.blockers.includes('external-network-use-forbidden'));

const resources = [{ ...local, enabled: true }];
const allocation = allocateCapacity({
  portfolio,
  resources,
  jobs: [
    { job_id: 'job-1', workload: 'llm', priority: 'P1', created_at: 1 },
    { job_id: 'job-2', workload: 'embedding', priority: 'P2', created_at: 2 },
    { job_id: 'job-3', workload: 'classification', priority: 'P3', created_at: 3 }
  ]
});
assert.equal(allocation.assignments.length, 2);
assert.equal(allocation.deferred.length, 1);
assert.equal(allocation.deferred[0].reason, 'no-lawful-zero-spend-capacity');
for (const assignment of allocation.assignments) {
  assert.equal(assignment.monetary_ceiling_eur, 0);
  assert.equal(assignment.reversible, true);
}

console.log(JSON.stringify({ ok: true, localAssessment, officialAssessment, unsafeAssessment, portfolio, allocation }, null, 2));
