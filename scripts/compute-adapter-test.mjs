import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertNoSensitivePayload,
  assertRemoteComputeJob,
  assertZeroSpendRemoteResource
} from '../ai-management/provider-adapters/compute/compute-adapter-guard.mjs';
import { KaggleKernelCliAdapter } from '../ai-management/provider-adapters/compute/kaggle-kernel-cli.mjs';
import { HuggingFaceGradioZeroGpuAdapter } from '../ai-management/provider-adapters/compute/huggingface-gradio-zerogpu.mjs';
import { OwnerHttpComputeAdapter } from '../ai-management/provider-adapters/compute/owner-http-compute.mjs';
import {
  RemoteComputeSessionAdapter,
  adapterKeyForResource
} from '../ai-management/provider-adapters/compute/remote-compute-session.mjs';
import {
  executeRemoteComputeJob,
  remoteComputeBrokerInternals
} from '../ai-management/node/remote-compute-broker.mjs';

function resource(overrides = {}) {
  return {
    resource_id: 'remote-compute-owner-donated-gpu',
    provider_name: 'Owner Donated GPU',
    service_name: 'Bounded public compute',
    capability_types: ['remote_compute', 'gpu_compute'],
    resource_tier: 2,
    official_documentation_url: 'https://compute.example.org/docs',
    terms_url: 'https://compute.example.org/terms',
    privacy_url: 'https://compute.example.org/privacy',
    status_url: null,
    licence: null,
    account_owner: 'owner-controlled provider account',
    authentication_type: 'environment_secret',
    credential_reference: 'OWNER_COMPUTE_TOKEN',
    approved_for_automation: true,
    approved_data_classes: ['public'],
    prohibited_data_classes: ['internal', 'confidential', 'restricted'],
    free_quota_amount: 100,
    free_quota_unit: 'job units per day',
    quota_reset_period: 'daily',
    quota_reset_time: '00:00 UTC',
    quota_remaining: 100,
    quota_reserved: 0,
    hard_stop_threshold: 1,
    quota_verified: true,
    quota_unlimited: false,
    billing_enabled: false,
    billing_risk: 'none',
    payment_method_present: false,
    monetary_cost_per_unit_eur: 0,
    quality_score: 80,
    reliability_score: 80,
    latency_score: 70,
    privacy_score: 60,
    provenance_score: 95,
    quota_efficiency_score: 90,
    last_health_check: new Date().toISOString(),
    health_status: 'healthy',
    last_terms_check: new Date().toISOString(),
    terms_revalidation_due: '2099-01-01T00:00:00.000Z',
    last_quota_check: new Date().toISOString(),
    last_success: null,
    last_failure: null,
    consecutive_failures: 0,
    cooldown_until: null,
    average_latency: 0,
    success_rate: 1,
    error_rate: 0,
    supported_job_types: ['remote-compute.reserve', 'remote-compute.release'],
    maximum_payload: 1024 * 1024,
    rate_limit: '100 job units per day',
    concurrency_limit: 1,
    fallback_resource_ids: [],
    implementation_status: 'batch',
    adapter_id: 'remote-compute-session',
    adapter_version: '1.0.0',
    enabled: true,
    manual_approval_required: false,
    allowed_hosts: ['compute.example.org'],
    metadata: {
      remote_compute: true,
      provider_id: 'owner-donated-gpu',
      endpoint_url: 'https://compute.example.org',
      routes: { execute: '/jobs', status: '/status', cancel: '/cancel' },
      allowed_task_types: ['public-site-analysis'],
      maximum_runtime_seconds: 900,
      expires_at: '2099-01-01T00:00:00.000Z',
      owner_onboarding_completed: true,
      automation_permission_verified: true,
      billing_hard_stop_confirmed: true,
      prompt_transfer_allowed: false,
      public_workloads_only: true
    },
    notes: 'Test resource',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

const baseResource = resource();
assert.doesNotThrow(() => assertZeroSpendRemoteResource(baseResource));
assert.throws(() => assertZeroSpendRemoteResource(resource({ quota_remaining: 1 })), /zero-spend execution boundary/);
assert.throws(() => assertNoSensitivePayload({ prompt: 'do not send' }), /forbidden for remote compute/);
assert.throws(() => assertRemoteComputeJob({ job_type: 'remote-compute.reserve', data_class: 'internal', payload: {} }, baseResource, ['remote-compute.reserve']), /public workloads only/);
assert.equal(adapterKeyForResource(baseResource), 'owner-http-compute');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-compute-adapter-'));
try {
  const kaggleRoot = path.join(temporary, 'kaggle');
  const workspace = path.join(kaggleRoot, 'site-analysis');
  const outputRoot = path.join(temporary, 'outputs');
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'kernel-metadata.json'), JSON.stringify({ id: 'owner/site-analysis', title: 'Site Analysis', code_file: 'runner.py', language: 'python', kernel_type: 'script', is_private: false }));
  fs.writeFileSync(path.join(workspace, 'runner.py'), 'print("ok")\n');
  const calls = [];
  const fakeExec = async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: 'Kernel version 1 successfully pushed', stderr: '' };
  };
  const kaggleResource = resource({
    resource_id: 'remote-compute-kaggle-notebooks-free-gpu',
    provider_name: 'Kaggle',
    credential_reference: 'KAGGLE_API_TOKEN',
    allowed_hosts: ['www.kaggle.com'],
    metadata: {
      ...baseResource.metadata,
      provider_id: 'kaggle-notebooks-free-gpu',
      endpoint_url: 'https://www.kaggle.com',
      accelerator_id: 'NvidiaTeslaP100'
    }
  });
  const kaggle = new KaggleKernelCliAdapter({ execFile: fakeExec, environment: { KAGGLE_API_TOKEN: 'test-token' }, workspaceRoot: kaggleRoot, outputRoot });
  const pushed = await kaggle.execute({
    job_type: 'remote-compute.reserve', data_class: 'public', payload: { operation: 'submit', workspace_path: 'site-analysis', kernel_ref: 'owner/site-analysis' },
    requirements: { maximum_latency_ms: 60_000 }, idempotency_key: 'idem-kaggle-test'
  }, kaggleResource);
  assert.equal(pushed.ok, true);
  assert.equal(calls[0].command, 'kaggle');
  assert.deepEqual(calls[0].args.slice(0, 3), ['kernels', 'push', '-p']);
  assert.equal(pushed.output.kernel_ref, 'owner/site-analysis');

  let hfCalls = 0;
  const hfFetch = async url => {
    hfCalls += 1;
    if (String(url).includes('/gradio_api/call/predict') && hfCalls === 1) {
      return new Response(JSON.stringify({ event_id: 'evt-123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('event: complete\ndata: ["PUBLIC_OK"]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const hfResource = resource({
    resource_id: 'remote-compute-hugging-face-zerogpu',
    provider_name: 'Hugging Face',
    credential_reference: 'HF_TOKEN',
    allowed_hosts: ['owner-space.hf.space'],
    metadata: {
      ...baseResource.metadata,
      provider_id: 'hugging-face-zerogpu',
      endpoint_url: 'https://owner-space.hf.space',
      default_api_name: '/predict',
      allowed_api_names: ['/predict']
    }
  });
  const hf = new HuggingFaceGradioZeroGpuAdapter({ fetchImpl: hfFetch, environment: { HF_TOKEN: 'hf-test' } });
  const hfResult = await hf.execute({
    job_type: 'remote-compute.reserve', data_class: 'public', payload: { public_inputs: ['https://matrixreprogrammed.com/public-data.json'] },
    requirements: { maximum_latency_ms: 60_000 }, idempotency_key: 'idem-hf-test'
  }, hfResource);
  assert.equal(hfResult.ok, true);
  assert.deepEqual(hfResult.output.result, ['PUBLIC_OK']);
  await assert.rejects(() => hf.execute({
    job_type: 'remote-compute.reserve', data_class: 'public', payload: { prompt: 'blocked', public_inputs: [] },
    requirements: {}, idempotency_key: 'idem-hf-block'
  }, hfResource), /forbidden for remote compute/);

  const ownerFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, job_handle: 'job-123', received_task_type: body.task_type, cost_eur: 0, billing_enabled: false }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  const owner = new OwnerHttpComputeAdapter({ fetchImpl: ownerFetch, environment: { OWNER_COMPUTE_TOKEN: 'owner-test' } });
  const ownerResult = await owner.execute({
    job_type: 'remote-compute.reserve', data_class: 'public',
    payload: { operation: 'execute', task_type: 'public-site-analysis', public_manifest: { source_urls: ['https://matrixreprogrammed.com/sitemap.xml'] } },
    requirements: { maximum_latency_ms: 60_000 }, idempotency_key: 'idem-owner-test'
  }, baseResource);
  assert.equal(ownerResult.output.result.job_handle, 'job-123');

  const session = new RemoteComputeSessionAdapter({ adapters: [owner] });
  const sessionResult = await session.execute({
    job_type: 'remote-compute.reserve', data_class: 'public',
    payload: { operation: 'execute', task_type: 'public-site-analysis', public_manifest: { source_urls: ['https://matrixreprogrammed.com/sitemap.xml'] } },
    requirements: {}, idempotency_key: 'idem-session-test'
  }, baseResource);
  assert.equal(sessionResult.output.execution_adapter, 'owner-http-compute');

  const normalized = remoteComputeBrokerInternals.normalizeJobForResources({
    job_type: 'remote-compute.execute', payload: { task_type: 'public-site-analysis' }
  }, [baseResource]);
  assert.equal(normalized.job_type, 'remote-compute.reserve');
  assert.equal(normalized.payload.operation, 'execute');

  const brokerResult = await executeRemoteComputeJob({
    job_type: 'remote-compute.execute', capability_type: 'remote_compute', data_class: 'public',
    payload: { task_type: 'public-site-analysis', public_manifest: { source_urls: ['https://matrixreprogrammed.com/sitemap.xml'] }, quota_units: 1 },
    requirements: { maximum_attempts: 1, maximum_latency_ms: 60_000, cacheable: false }
  }, {
    resources: [baseResource],
    adapters: [session],
    environment: { OWNER_COMPUTE_TOKEN: 'owner-test' }
  });
  assert.equal(brokerResult.ok, true);
  assert.equal(brokerResult.cost_confirmed_zero, true);
  assert.equal(brokerResult.output.execution_adapter, 'owner-http-compute');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log('Compute adapter tests passed: fail-closed public-only manifests, zero-spend and expiry gates, Kaggle kernel submission, Hugging Face ZeroGPU queue execution, owner endpoint execution, provider dispatch and broker compatibility routing.');
