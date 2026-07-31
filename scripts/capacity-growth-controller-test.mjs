import assert from 'node:assert/strict';
import { runCapacityGrowthCycle } from '../ai-management/compute-capacity/capacity-growth-controller.mjs';

const now = new Date('2026-07-31T20:00:00.000Z');
const registered = [];

const result = await runCapacityGrowthCycle({
  now,
  localRuntimes: [{
    node_id: 'node-owner-gpu-1',
    owner_authorized: true,
    allowed_for_project: true,
    cost_confirmed_zero: true,
    maximum_concurrency: 2,
    hardware: { hostname: 'matrix-node-1', cpu_threads: 16, total_memory_mb: 65536, total_gpu_memory_mb: 16384 },
    resources: [{ capability_types: ['llm', 'embedding'], supported_job_types: ['llm.generate'], metadata: { local: true } }]
  }],
  opportunityEvaluations: [{
    opportunity: {
      opportunity_id: 'opportunity-free-gpu', kind: 'compute', provider_name: 'Official Provider', service_name: 'Free GPU',
      documentation_url: 'https://provider.example/docs', terms_url: 'https://provider.example/terms', privacy_url: 'https://provider.example/privacy',
      automation_permission: 'allowed', commercial_use: 'allowed', zero_cost_verified: true, quota_verified: true,
      free_quota: 120, free_quota_unit: 'minutes', account_required: true, authentication_type: 'token', payment_method_required: false,
      supported_capabilities: ['gpu inference'], metadata: { maximum_concurrency: 1, gpu_memory_mb: 24576 }
    },
    evidence: ['official-material-confirms-zero-cost-access', 'official-material-confirms-automation-permission'],
    evaluated_at: now.toISOString()
  }],
  activeResources: [],
  queuedJobs: [
    { job_id: 'job-llm', priority: 'P1', capability_type: 'llm', created_at: 1 },
    { job_id: 'job-embedding', priority: 'P2', capability_type: 'embedding', created_at: 2 },
    { job_id: 'job-search', priority: 'P3', capability_type: 'search', created_at: 3 }
  ],
  registerResource: async resource => { registered.push(resource); return resource; }
});

assert.equal(result.ok, true);
assert.equal(result.zero_spend_lock, true);
assert.equal(result.paid_fallback_possible, false);
assert.equal(result.discovered_candidates, 2);
assert.equal(registered.length, 1, 'only owner-controlled local capacity should auto-admit');
assert.equal(registered[0].resource_id, 'node-owner-gpu-1');
assert.equal(registered[0].enabled, true);
assert.equal(registered[0].billing_enabled, false);
assert.equal(registered[0].payment_method_present, false);
assert.equal(registered[0].monetary_cost_per_unit_eur, 0);
assert.equal(result.owner_approval_queue.length, 1, 'external compute must await owner approval');
assert.equal(result.owner_approval_queue[0].candidate_id, 'opportunity-free-gpu');
assert.equal(result.allocation.assignments.length, 2, 'local capacity should accept its supported workloads');
assert.deepEqual(result.allocation.assignments.map(item => item.job_id), ['job-llm', 'job-embedding']);
assert.ok(result.allocation.assignments.every(item => item.monetary_ceiling_eur === 0));
assert.ok(result.allocation.assignments.every(item => item.reversible === true));
assert.deepEqual(result.allocation.deferred, [{ job_id: 'job-search', reason: 'no-lawful-zero-spend-capacity' }]);

const unsafe = await runCapacityGrowthCycle({
  now,
  localRuntimes: [{
    node_id: 'unsafe-node', owner_authorized: false, allowed_for_project: true, cost_confirmed_zero: true,
    hardware: { hostname: 'unsafe', cpu_threads: 8 }, resources: []
  }],
  registerResource: async resource => resource
});
assert.equal(unsafe.admitted.length, 0);
assert.equal(unsafe.quarantined.length, 1);
assert.ok(unsafe.quarantined[0].blockers.includes('owner-authorization-missing'));

console.log('Capacity growth controller end-to-end zero-spend tests passed.');
