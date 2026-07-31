import assert from 'node:assert/strict';
import { assertNoSensitivePayload } from '../ai-management/provider-adapters/compute/compute-adapter-guard.mjs';
import { computeScoutInternals } from '../ai-management/compute-resource-scout/compute-resource-scout.mjs';
import { OwnerHttpComputeAdapter } from '../ai-management/provider-adapters/compute/owner-http-compute.mjs';
import { createRemoteComputeBroker } from '../ai-management/node/remote-compute-broker.mjs';

for (const blockedPayload of [
  { prompt: 'blocked' },
  { user_prompt: 'blocked' },
  { private_data: 'blocked' },
  { member_email: 'member@example.org' },
  { access_token: 'blocked' },
  { apiKey: 'blocked' }
]) {
  assert.throws(() => assertNoSensitivePayload(blockedPayload), /forbidden for remote compute/);
}

assert.equal(computeScoutInternals.publicHttpsUrl('https://127.0.0.1/private'), null);
assert.equal(computeScoutInternals.publicHttpsUrl('https://localhost/private'), null);
assert.equal(computeScoutInternals.publicHttpsUrl('https://user:pass@example.org/data'), null);
assert.equal(computeScoutInternals.publicHttpsUrl('https://example.org/data')?.hostname, 'example.org');

const redirectProbe = await computeScoutInternals.fetchEvidence(async () => new Response('', {
  status: 302,
  headers: { location: 'https://127.0.0.1/private' }
}), 'https://example.org/start');
assert.equal(redirectProbe.ok, false);
assert.equal(redirectProbe.error, 'redirect-target-blocked');

const resource = {
  resource_id: 'remote-compute-owner-test',
  provider_name: 'Owner Test',
  capability_types: ['remote_compute'],
  resource_tier: 2,
  official_documentation_url: 'https://compute.example.org/docs',
  authentication_type: 'environment_secret',
  credential_reference: 'OWNER_TEST_TOKEN',
  approved_for_automation: true,
  approved_data_classes: ['public'],
  prohibited_data_classes: ['internal', 'confidential', 'restricted'],
  supported_job_types: ['remote-compute.execute'],
  implementation_status: 'experimental',
  monetary_cost_per_unit_eur: 0,
  billing_enabled: false,
  payment_method_present: false,
  billing_risk: 'none',
  quota_verified: true,
  quota_unlimited: false,
  quota_remaining: 10,
  quota_reserved: 0,
  hard_stop_threshold: 1,
  maximum_payload: 1024 * 1024,
  enabled: true,
  manual_approval_required: false,
  allowed_hosts: ['compute.example.org'],
  metadata: {
    remote_compute: true,
    public_workloads_only: true,
    prompt_transfer_allowed: false,
    owner_onboarding_completed: true,
    automation_permission_verified: true,
    billing_hard_stop_confirmed: true,
    endpoint_url: 'https://compute.example.org',
    allowed_task_types: ['public-site-analysis'],
    routes: { execute: '/jobs' },
    expires_at: '2099-01-01T00:00:00.000Z'
  }
};
const job = {
  job_type: 'remote-compute.execute',
  data_class: 'public',
  payload: {
    task_type: 'public-site-analysis',
    public_manifest: { source_urls: ['https://matrixreprogrammed.com/sitemap.xml'] }
  },
  requirements: { maximum_latency_ms: 60_000 },
  idempotency_key: 'hardening-test'
};

const missingCostProof = new OwnerHttpComputeAdapter({
  environment: { OWNER_TEST_TOKEN: 'test' },
  fetchImpl: async () => new Response(JSON.stringify({ ok: true, billing_enabled: false }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
});
await assert.rejects(() => missingCostProof.execute(job, resource), error => error?.code === 'REMOTE_ZERO_SPEND_PROOF_FAILED');

const missingBillingProof = new OwnerHttpComputeAdapter({
  environment: { OWNER_TEST_TOKEN: 'test' },
  fetchImpl: async () => new Response(JSON.stringify({ ok: true, cost_eur: 0 }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
});
await assert.rejects(() => missingBillingProof.execute(job, resource), error => error?.code === 'REMOTE_ZERO_SPEND_PROOF_FAILED');

const registry = {
  async list() { return []; },
  async recordSuccess() {},
  async recordFailure() {}
};
const broker = createRemoteComputeBroker({
  registry,
  adapters: [],
  policyContext: {
    zeroSpendLock: false,
    resourceEligibilityEvaluator() { return { eligible: true, reasons: [] }; }
  }
});
assert.equal(broker.policyContext.zeroSpendLock, true);
const boundaryDecision = broker.policyContext.resourceEligibilityEvaluator({
  metadata: {
    remote_compute: true,
    public_workloads_only: false,
    prompt_transfer_allowed: false,
    expires_at: '2099-01-01T00:00:00.000Z'
  }
}, { data_class: 'public' }, { now: new Date('2026-07-31T09:00:00.000Z') });
assert.equal(boundaryDecision.eligible, false);
assert.ok(boundaryDecision.reasons.includes('public-only-boundary-missing'));

console.log('Remote compute hardening tests passed: sensitive aliases, redirect SSRF, explicit runtime cost proof and mandatory broker policy all fail closed.');
