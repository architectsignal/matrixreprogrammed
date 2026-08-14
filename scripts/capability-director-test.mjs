import assert from 'node:assert/strict';
import { AutonomousCapabilityDirector } from '../ai-management/autonomy/capability-director.mjs';
import {
  brokerResourceFromComputeEvaluation,
  candidateFromComputeProvider
} from '../ai-management/compute-resource-scout/compute-resource-scout.mjs';

const clock = () => new Date('2026-07-31T08:00:00.000Z');
const director = new AutonomousCapabilityDirector({ clock, maximumRemoteJobs: 2 });
const siteReport = {
  generated_at: clock().toISOString(),
  scanned_pages: 1735,
  total_issues: 1816,
  issue_counts: {
    'unversioned-static-assets': 44,
    'duplicate-id': 12,
    'meta-description-missing': 800
  }
};
const localRuntime = {
  hardware: { total_gpu_memory_mb: 4607, free_gpu_memory_mb: 2100 },
  resources: [{ resource_id: 'local-qwen3-14b' }, { resource_id: 'local-small-model' }]
};
const computeResource = {
  resource_id: 'remote-compute-owner-donated-gpu',
  provider_name: 'Owner Donated GPU',
  enabled: true,
  billing_enabled: false,
  payment_method_present: false,
  billing_risk: 'none',
  monetary_cost_per_unit_eur: 0,
  quota_verified: true,
  quota_remaining: 10,
  hard_stop_threshold: 1,
  free_quota_unit: 'jobs per day',
  terms_revalidation_due: '2026-08-07T00:00:00.000Z',
  metadata: {
    remote_compute: true,
    public_workloads_only: true,
    prompt_transfer_allowed: false,
    expires_at: '2026-08-01T00:00:00.000Z'
  }
};

const withoutCompute = director.plan({ siteReport, localRuntime, computeResources: [] });
assert.equal(withoutCompute.local_pressure.level, 'high');
assert.equal(withoutCompute.remote_preferred, true);
assert.equal(withoutCompute.queued_jobs.length, 0);
assert.ok(withoutCompute.deferred_tasks.every(task => task.reason === 'no-approved-zero-spend-remote-compute'));

const withCompute = director.plan({ siteReport, localRuntime, computeResources: [computeResource] });
assert.equal(withCompute.eligible_remote_resources.length, 1);
assert.equal(withCompute.queued_jobs.length, 2);
for (const job of withCompute.queued_jobs) {
  assert.equal(job.data_class, 'public');
  assert.equal(job.requirements.cost_ceiling_eur, 0);
  assert.equal(job.requirements.requires_provenance, true);
  assert.equal(job.metadata.public_data_only, true);
  assert.equal('prompt' in job.payload, false);
  assert.equal('messages' in job.payload, false);
  assert.ok(job.payload.public_manifest.sitemap_url.startsWith('https://matrixreprogrammed.com/'));
}

const expired = director.plan({
  siteReport,
  localRuntime,
  computeResources: [{ ...computeResource, metadata: { ...computeResource.metadata, expires_at: '2026-07-31T07:59:59.000Z' } }]
});
assert.equal(expired.eligible_remote_resources.length, 0);
assert.equal(expired.queued_jobs.length, 0);

const lowPressure = director.plan({
  siteReport: { scanned_pages: 40, total_issues: 4, issue_counts: {} },
  localRuntime: { hardware: { total_gpu_memory_mb: 24576, free_gpu_memory_mb: 20000 }, resources: [] },
  computeResources: [computeResource]
});
assert.equal(lowPressure.local_pressure.level, 'low');
assert.equal(lowPressure.remote_preferred, false);
assert.equal(lowPressure.queued_jobs.length, 0);

const constrainedSystemMemory = director.plan({
  siteReport: { scanned_pages: 120, total_issues: 100, issue_counts: {} },
  localRuntime: {
    hardware: {
      total_gpu_memory_mb: 24576,
      free_gpu_memory_mb: 20000,
      total_memory_mb: 16384,
      free_memory_mb: 1800,
      resource_pressure: { can_accept_local_jobs: false }
    },
    resources: []
  },
  computeResources: [computeResource]
});
assert.equal(constrainedSystemMemory.local_pressure.level, 'high');
assert.ok(constrainedSystemMemory.local_pressure.reasons.includes('local-host-deferred-for-memory-pressure'));
assert.equal(constrainedSystemMemory.remote_preferred, true);
assert.equal(constrainedSystemMemory.queued_jobs.length, 1);

const providerCandidate = candidateFromComputeProvider({
  provider_id: 'owner-donated-gpu',
  provider_name: 'Owner Donated GPU',
  service_name: 'Owner HTTPS compute',
  access_method: 'automatic_api',
  endpoint_url: 'https://compute.example.org',
  official_documentation_url: 'https://compute.example.org/docs',
  terms_url: 'https://compute.example.org/terms',
  privacy_url: 'https://compute.example.org/privacy',
  owner_onboarding_completed: true,
  automation_permission_verified: true,
  billing_hard_stop_confirmed: true,
  payment_method_present: false,
  zero_spend_verified: true,
  quota_verified: true,
  free_quota_amount: 10,
  free_quota_unit: 'jobs per day',
  session_max_minutes: 30,
  credential_reference: 'OWNER_COMPUTE_TOKEN',
  terms_last_verified: clock().toISOString(),
  terms_revalidation_due: '2026-08-07T00:00:00.000Z',
  quota_last_verified: clock().toISOString(),
  metadata: {
    execution_adapter: 'owner-http-compute',
    execution_transport: 'https_api',
    supported_job_types: ['remote-compute.execute'],
    allowed_task_types: ['public-site-analysis'],
    routes: { execute: '/jobs', status: '/status', cancel: '/cancel', forbidden: '/admin' },
    maximum_runtime_seconds: 900,
    token: 'must-not-survive'
  }
}, clock());
assert.equal(providerCandidate.metadata.execution_adapter, 'owner-http-compute');
assert.deepEqual(providerCandidate.metadata.allowed_task_types, ['public-site-analysis']);
assert.equal('token' in providerCandidate.metadata, false);
assert.equal('forbidden' in providerCandidate.metadata.routes, false);

const routedResource = brokerResourceFromComputeEvaluation({
  approved: true,
  classification: 'automatic',
  confidence: 100,
  candidate: providerCandidate,
  evaluated_at: clock().toISOString()
}, clock());
assert.equal(routedResource.metadata.execution_adapter, 'owner-http-compute');
assert.deepEqual(routedResource.metadata.allowed_task_types, ['public-site-analysis']);
assert.equal(routedResource.metadata.remote_compute, true);
assert.equal(routedResource.metadata.public_workloads_only, true);
assert.equal(routedResource.metadata.prompt_transfer_allowed, false);
assert.equal('token' in routedResource.metadata, false);

console.log('Capability Director tests passed: limited local hardware triggers bounded public offload, unavailable capacity defers safely, expiry blocks routing, low-pressure work stays local and allowlisted provider execution metadata reaches the broker without secrets.');
