import assert from 'node:assert/strict';
import { AutonomousCapabilityDirector } from '../ai-management/autonomy/capability-director.mjs';

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

console.log('Capability Director tests passed: limited local hardware triggers public remote offload, unavailable capacity defers safely, expiry blocks routing and low-pressure work stays local.');
