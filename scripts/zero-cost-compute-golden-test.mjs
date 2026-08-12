import assert from 'node:assert/strict';
import { createJob } from '../ai-management/core/jobs.mjs';
import { localRuntimeToComputeCandidate, computeCandidateToRegistryResource } from '../ai-management/compute-capacity/capacity-growth-controller.mjs';
import { assessComputeCandidate } from '../ai-management/compute-capacity/compute-capacity-manager.mjs';
import { StructuredAuditLogger } from '../ai-management/observability/structured-logger.mjs';
import { rankResources } from '../ai-management/policy-engine/zero-spend-policy.mjs';
import { DeterministicLocalAdapter } from '../ai-management/provider-adapters/local/deterministic-local.mjs';
import { ResourceBroker } from '../ai-management/resource-broker/resource-broker.mjs';
import { ResourceRegistry } from '../ai-management/resource-registry/resource-registry.mjs';

const now = new Date('2026-08-12T17:00:00.000Z');
const clock = () => now;
const candidate = localRuntimeToComputeCandidate({
  node_id: 'node-owner-local-cpu-golden',
  owner_authorized: true,
  allowed_for_project: true,
  cost_confirmed_zero: true,
  maximum_concurrency: 2,
  hardware: { hostname: 'owner-local-cpu-golden', cpu_threads: 8, total_memory_mb: 16384, total_gpu_memory_mb: 0 },
  resources: []
}, now);
const assessment = assessComputeCandidate(candidate, { now });
assert.equal(assessment.state, 'approved-auto');
assert.equal(assessment.auto_admissible, true);

const admitted = {
  ...computeCandidateToRegistryResource(candidate, assessment, now),
  adapter_id: 'deterministic-local',
  capability_types: ['deterministic'],
  supported_job_types: ['deterministic.hash'],
  reliability_score: 79,
  success_rate: 0.6,
  latency_score: 95,
  quality_score: 100,
  provenance_score: 100,
  privacy_score: 100,
  quota_efficiency_score: 100
};
const incumbent = {
  ...admitted,
  resource_id: 'node-owner-local-cpu-incumbent',
  service_name: 'Owner local CPU incumbent',
  reliability_score: 80
};
const jobInput = {
  job_type: 'deterministic.hash',
  capability_type: 'deterministic',
  priority: 'P4',
  data_class: 'internal',
  payload: { value: 'matrix-zero-cost-compute-golden' },
  requirements: { cost_ceiling_eur: 0, maximum_attempts: 1, cacheable: false, requires_provenance: true }
};
const normalizedJob = await createJob(jobInput, clock);
const beforeLearning = rankResources([admitted, incumbent], normalizedJob, { zeroSpendLock: true, externalEnabled: false, localOnly: true, now });
assert.equal(beforeLearning.eligible[0].resource.resource_id, incumbent.resource_id, 'incumbent should lead before the new node has an outcome');

const registry = new ResourceRegistry([admitted]);
const logger = new StructuredAuditLogger({ clock });
const broker = new ResourceBroker({
  registry,
  adapters: [new DeterministicLocalAdapter()],
  logger,
  policyContext: { zeroSpendLock: true, externalEnabled: false, localOnly: true },
  clock,
  sleep: async () => {},
  random: () => 0
});
const benchmark = await broker.execute(jobInput);
assert.equal(benchmark.ok, true);
assert.equal(benchmark.selected_resource, admitted.resource_id);
assert.equal(benchmark.output.sha256.length, 64);
assert.equal(benchmark.cost_confirmed_zero, true);
assert.equal(logger.records.at(-1).validation_result, 'passed');

const learned = await registry.get(admitted.resource_id);
assert.ok(learned.last_success);
assert.equal(learned.reliability_score, 81.1);
assert.equal(learned.success_rate, 0.64);
registry.register(incumbent);

const subsequent = await broker.execute({ ...jobInput, payload: { value: 'matrix-zero-cost-compute-follow-up' } });
assert.equal(subsequent.selected_resource, admitted.resource_id, 'subsequent routing must use the benchmark-improved reliability score');
assert.equal(subsequent.cost_confirmed_zero, true);
assert.equal(logger.records.filter(record => record.validation_result === 'passed').length, 2);

console.log('ZERO-COST COMPUTE GOLDEN TEST PASSED');
console.log('Owner-local candidate discovered, policy-approved, registered, broker-selected, benchmarked on a real SHA-256 workload at EUR 0, outcome-recorded, and preferred on the subsequent route.');
