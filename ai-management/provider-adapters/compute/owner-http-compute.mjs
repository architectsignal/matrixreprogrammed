import { AdapterError } from '../adapter-contract.mjs';
import {
  assertHttpsEndpoint,
  assertRemoteComputeJob,
  computeProvenance,
  readResponseBounded,
  resolveCredential
} from './compute-adapter-guard.mjs';

const JOB_TYPES = [
  'remote-compute.execute',
  'remote-compute.status',
  'remote-compute.cancel',
  'remote-compute.reserve',
  'remote-compute.release'
];
const TASK_TYPE = /^[a-z0-9][a-z0-9._-]{1,119}$/;
const JOB_HANDLE = /^[a-zA-Z0-9._:-]{3,240}$/;

function operationFor(job) {
  if (job.job_type === 'remote-compute.reserve') return String(job.payload.operation || 'execute');
  if (job.job_type === 'remote-compute.release') return String(job.payload.operation || 'status');
  return job.job_type.replace('remote-compute.', '');
}

function routePath(resource, operation) {
  const routes = resource.metadata?.routes || {};
  const value = String(routes[operation] || `/${operation}`).trim();
  if (!/^\/[a-zA-Z0-9_./-]{1,200}$/.test(value) || value.includes('..')) {
    throw new AdapterError('Owner compute route is invalid', { code: 'OWNER_COMPUTE_ROUTE_INVALID' });
  }
  return value;
}

export class OwnerHttpComputeAdapter {
  constructor({ fetchImpl = globalThis.fetch, environment = process.env, clock = () => new Date(), maximumBytes = 4 * 1024 * 1024 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.environment = environment;
    this.clock = clock;
    this.maximumBytes = maximumBytes;
    this.adapter_id = 'owner-http-compute';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource) {
    assertRemoteComputeJob(job, resource, JOB_TYPES);
    const operation = operationFor(job);
    if (!['execute', 'status', 'cancel'].includes(operation)) {
      throw new AdapterError(`Unsupported owner compute operation: ${operation}`, { code: 'OWNER_COMPUTE_OPERATION_BLOCKED' });
    }
    const endpoint = assertHttpsEndpoint(resource.metadata?.endpoint_url, resource.allowed_hosts);
    const token = resolveCredential(resource, this.environment);
    const payload = { operation, public_data_only: true, cost_ceiling_eur: 0 };

    if (operation === 'execute') {
      const taskType = String(job.payload.task_type || '');
      if (!TASK_TYPE.test(taskType)) throw new AdapterError('Owner compute task_type is invalid', { code: 'OWNER_COMPUTE_TASK_TYPE_INVALID' });
      const allowedTaskTypes = Array.isArray(resource.metadata?.allowed_task_types) ? resource.metadata.allowed_task_types : [];
      if (!allowedTaskTypes.includes(taskType)) throw new AdapterError('Owner compute task type is not allowlisted', { code: 'OWNER_COMPUTE_TASK_TYPE_NOT_ALLOWLISTED' });
      payload.task_type = taskType;
      payload.public_manifest = job.payload.public_manifest || {};
      payload.idempotency_key = job.idempotency_key;
      payload.maximum_runtime_seconds = Math.max(30, Math.min(Number(job.payload.maximum_runtime_seconds || 900), Number(resource.metadata?.maximum_runtime_seconds || 3600)));
    } else {
      const handle = String(job.payload.job_handle || '');
      if (!JOB_HANDLE.test(handle)) throw new AdapterError('Owner compute job handle is invalid', { code: 'OWNER_COMPUTE_JOB_HANDLE_INVALID' });
      payload.job_handle = handle;
    }

    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > 512 * 1024) throw new AdapterError('Owner compute manifest is too large', { code: 'OWNER_COMPUTE_MANIFEST_TOO_LARGE' });
    const requestUrl = new URL(routePath(resource, operation), endpoint);
    const timeoutMs = Math.max(5_000, Math.min(Number(job.requirements?.maximum_latency_ms || 60_000), 10 * 60 * 1000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(requestUrl.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'x-cost-ceiling-eur': '0',
          'x-data-class': 'public',
          'user-agent': 'MatrixReprogrammedZeroSpendCompute/1.0'
        },
        body,
        redirect: 'error',
        signal: controller.signal
      });
      const read = await readResponseBounded(response, this.maximumBytes);
      let result;
      try { result = read.text ? JSON.parse(read.text) : {}; }
      catch { throw new AdapterError('Owner compute endpoint returned invalid JSON', { code: 'OWNER_COMPUTE_INVALID_JSON' }); }
      if (!response.ok || result?.ok === false) {
        const quota = response.status === 429 || /quota|zero[- ]cost|billing|credit/i.test(String(result?.error || read.text));
        throw new AdapterError(`Owner compute endpoint rejected ${operation}`, {
          code: quota ? 'REMOTE_QUOTA_EXHAUSTED' : 'OWNER_COMPUTE_REQUEST_FAILED',
          retryable: !quota && response.status >= 500,
          details: { status: response.status, error: String(result?.error || '').slice(0, 500) }
        });
      }
      if (Number(result?.cost_eur || 0) !== 0 || result?.billing_enabled === true) {
        throw new AdapterError('Owner compute endpoint failed the returned zero-spend proof', { code: 'REMOTE_ZERO_SPEND_PROOF_FAILED' });
      }
      const retrievedAt = this.clock().toISOString();
      return {
        ok: true,
        output: {
          provider: 'owner-approved-http-compute',
          operation,
          result,
          response_hash: read.hash,
          cost_confirmed_zero: true
        },
        provenance: computeProvenance({
          resource,
          adapterId: this.adapter_id,
          adapterVersion: this.adapter_version,
          operation,
          sourceUrls: [requestUrl.toString(), resource.official_documentation_url],
          retrievedAt,
          contentHash: read.hash
        })
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw new AdapterError('Owner compute endpoint timed out', { code: 'REMOTE_COMPUTE_TIMEOUT', retryable: true });
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(String(error?.message || error), { code: 'OWNER_COMPUTE_REQUEST_FAILED', retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

export const ownerHttpAdapterInternals = { JOB_TYPES, TASK_TYPE, JOB_HANDLE, operationFor, routePath };
