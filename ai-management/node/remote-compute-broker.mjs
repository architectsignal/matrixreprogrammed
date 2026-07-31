import { ResourceRegistry } from '../resource-registry/resource-registry.mjs';
import { ResourceBroker } from '../resource-broker/resource-broker.mjs';
import { createComputeAdapters } from '../provider-adapters/compute/remote-compute-session.mjs';

const SUBMIT_TYPES = new Set(['remote-compute.execute', 'remote-compute.submit']);
const RELEASE_TYPES = new Set(['remote-compute.status', 'remote-compute.collect', 'remote-compute.cancel']);

function remoteResources(resources = []) {
  return resources.filter(resource => resource?.metadata?.remote_compute === true);
}

function normalizeJobForResources(input, resources) {
  const requested = String(input.job_type || '');
  if (resources.some(resource => (resource.supported_job_types || []).includes(requested))) return input;
  if (SUBMIT_TYPES.has(requested) && resources.some(resource => (resource.supported_job_types || []).includes('remote-compute.reserve'))) {
    return {
      ...input,
      job_type: 'remote-compute.reserve',
      payload: { ...(input.payload || {}), operation: requested.replace('remote-compute.', '') },
      metadata: { ...(input.metadata || {}), requested_job_type: requested, compatibility_mapping: true }
    };
  }
  if (RELEASE_TYPES.has(requested) && resources.some(resource => (resource.supported_job_types || []).includes('remote-compute.release'))) {
    return {
      ...input,
      job_type: 'remote-compute.release',
      payload: { ...(input.payload || {}), operation: requested.replace('remote-compute.', '') },
      metadata: { ...(input.metadata || {}), requested_job_type: requested, compatibility_mapping: true }
    };
  }
  return input;
}

function normalizeRemoteComputeInput(input = {}) {
  return {
    ...input,
    priority: input.priority || 'P3',
    data_class: input.data_class || 'public',
    capability_type: 'remote_compute',
    requirements: {
      ...(input.requirements || {}),
      cost_ceiling_eur: 0,
      maximum_attempts: 1,
      cacheable: false,
      requires_provenance: true
    }
  };
}

export function createRemoteComputeBroker({
  resources = [],
  adapters,
  registry,
  policyContext = {},
  ...adapterOptions
} = {}) {
  const computeResources = remoteResources(resources);
  const resourceRegistry = registry || new ResourceRegistry(computeResources);
  const callerEligibilityEvaluator = typeof policyContext.resourceEligibilityEvaluator === 'function'
    ? policyContext.resourceEligibilityEvaluator
    : null;
  return new ResourceBroker({
    registry: resourceRegistry,
    adapters: adapters || createComputeAdapters(adapterOptions),
    policyContext: {
      ...policyContext,
      zeroSpendLock: true,
      externalEnabled: policyContext.externalEnabled !== false,
      localOnly: policyContext.localOnly === true,
      resourceEligibilityEvaluator(resource, job, context) {
        const reasons = [];
        const now = context?.now instanceof Date ? context.now.getTime() : Date.now();
        if (resource?.metadata?.remote_compute !== true) reasons.push('not-remote-compute');
        if (resource?.metadata?.public_workloads_only !== true) reasons.push('public-only-boundary-missing');
        if (resource?.metadata?.prompt_transfer_allowed !== false) reasons.push('prompt-transfer-boundary-missing');
        if (resource?.metadata?.expires_at && Date.parse(resource.metadata.expires_at) <= now) reasons.push('compute-session-expired');
        if (job.data_class !== 'public') reasons.push('remote-compute-public-data-only');
        if (callerEligibilityEvaluator) {
          const callerDecision = callerEligibilityEvaluator(resource, job, context);
          if (callerDecision?.eligible === false) {
            reasons.push(...(callerDecision.reasons || ['resource-incompatible-with-job']));
          }
        }
        return { eligible: reasons.length === 0, reasons };
      }
    }
  });
}

export async function executeRemoteComputeJob(input, options = {}) {
  const resources = remoteResources(options.resources || []);
  const broker = options.broker || createRemoteComputeBroker({ ...options, resources });
  const normalized = normalizeJobForResources(normalizeRemoteComputeInput(input), resources);
  return broker.execute(normalized);
}

export async function executeRemoteComputeQueue({
  jobs = [],
  resources = [],
  maximumJobs = 1,
  ...options
} = {}) {
  const limit = Math.max(0, Math.min(Number(maximumJobs || 0), 5));
  const results = [];
  const queue = jobs.filter(job => job?.status === 'queued').slice(0, limit);
  for (const job of queue) {
    if (job.data_class && job.data_class !== 'public') {
      results.push({ job_id: job.job_id || null, status: 'blocked', error: 'remote-compute-public-data-only' });
      continue;
    }
    try {
      const result = await executeRemoteComputeJob(job, { ...options, resources });
      results.push({ job_id: job.job_id || result.job_id, status: 'completed', result });
    } catch (error) {
      results.push({
        job_id: job.job_id || null,
        status: 'failed-safe',
        code: error?.code || 'REMOTE_COMPUTE_FAILED',
        error: String(error?.message || error).slice(0, 1000)
      });
    }
  }
  return {
    ok: true,
    queued: jobs.filter(job => job?.status === 'queued').length,
    attempted: queue.length,
    completed: results.filter(item => item.status === 'completed').length,
    blocked_or_failed: results.filter(item => item.status !== 'completed').length,
    results,
    cost_confirmed_zero: true
  };
}

export const remoteComputeBrokerInternals = {
  SUBMIT_TYPES,
  RELEASE_TYPES,
  remoteResources,
  normalizeJobForResources,
  normalizeRemoteComputeInput
};
