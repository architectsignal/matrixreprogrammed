import { createJob, sha256 } from '../core/jobs.mjs';
import { rankResources } from '../policy-engine/zero-spend-policy.mjs';
import { InMemoryQuotaManager, QuotaUnavailableError } from '../quota-manager/quota-manager.mjs';
import { StructuredAuditLogger } from '../observability/structured-logger.mjs';
import { assertAdapter, validateAdapterResult } from '../provider-adapters/adapter-contract.mjs';

export class BrokerError extends Error {
  constructor(message, { code = 'RESOURCE_BROKER_ERROR', details = {} } = {}) {
    super(message);
    this.name = 'BrokerError';
    this.code = code;
    this.details = details;
  }
}

class Semaphore {
  constructor(limit = 1) {
    this.limit = Math.max(1, Number(limit || 1));
    this.active = 0;
    this.waiters = [];
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise(resolve => this.waiters.push(resolve)).then(() => {
      this.active += 1;
      return () => this.release();
    });
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

export class ResourceBroker {
  constructor({
    registry,
    adapters = [],
    quotaManager = new InMemoryQuotaManager(),
    logger = new StructuredAuditLogger(),
    policyContext = {},
    clock = () => new Date(),
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    random = Math.random
  } = {}) {
    if (!registry?.list || !registry?.recordSuccess || !registry?.recordFailure) throw new TypeError('A Resource Registry is required');
    this.registry = registry;
    this.adapters = new Map(adapters.map(adapter => {
      assertAdapter(adapter);
      return [adapter.adapter_id, adapter];
    }));
    this.quotaManager = quotaManager;
    this.logger = logger;
    this.policyContext = { zeroSpendLock: true, externalEnabled: true, localOnly: false, ...policyContext };
    this.clock = clock;
    this.sleep = sleep;
    this.random = random;
    this.cache = new Map();
    this.inflight = new Map();
    this.semaphores = new Map();
  }

  semaphore(resource) {
    if (!this.semaphores.has(resource.resource_id)) {
      this.semaphores.set(resource.resource_id, new Semaphore(resource.concurrency_limit || 1));
    }
    return this.semaphores.get(resource.resource_id);
  }

  readCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (cached.expires_at <= this.clock().getTime()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  async execute(input) {
    const job = await createJob(input, this.clock);
    const cached = job.requirements.cacheable ? this.readCache(job.deduplication_key) : null;
    if (cached) {
      await this.logger.emit({
        job_id: job.job_id,
        parent_job_id: job.parent_job_id,
        resource_id: cached.selected_resource,
        resource_version: cached.provenance?.adapter_version || null,
        input_hash: await this.logger.hashPayload(job.payload),
        source_urls: cached.provenance?.source_urls || [],
        source_timestamps: cached.provenance?.retrieved_at ? [cached.provenance.retrieved_at] : [],
        decision_reason: 'Verified result cache satisfied the canonical task signature.',
        candidate_resources: [cached.selected_resource],
        selected_resource: cached.selected_resource,
        utility_score: cached.utility_score,
        cost_confirmed_zero: true,
        validation_result: 'cache-hit'
      });
      return { ...cached, job_id: job.job_id, cache_hit: true, duplicate_work_prevented: true };
    }
    if (this.inflight.has(job.deduplication_key)) {
      const result = await this.inflight.get(job.deduplication_key);
      await this.logger.emit({
        job_id: job.job_id,
        parent_job_id: job.parent_job_id,
        resource_id: result.selected_resource,
        resource_version: result.provenance?.adapter_version || null,
        input_hash: await this.logger.hashPayload(job.payload),
        source_urls: result.provenance?.source_urls || [],
        source_timestamps: result.provenance?.retrieved_at ? [result.provenance.retrieved_at] : [],
        decision_reason: 'An equivalent in-flight job satisfied the deduplication key.',
        candidate_resources: [result.selected_resource],
        selected_resource: result.selected_resource,
        utility_score: result.utility_score,
        cost_confirmed_zero: true,
        validation_result: 'in-flight-deduplicated'
      });
      return { ...result, job_id: job.job_id, cache_hit: false, duplicate_work_prevented: true };
    }
    const execution = this.dispatch(job).finally(() => this.inflight.delete(job.deduplication_key));
    this.inflight.set(job.deduplication_key, execution);
    return execution;
  }

  async dispatch(job) {
    const inputHash = await this.logger.hashPayload(job.payload);
    const resources = await this.registry.list();
    const decision = rankResources(resources, job, { ...this.policyContext, now: this.clock() });
    const candidates = decision.eligible.map(item => item.resource.resource_id);
    if (!decision.eligible.length) {
      await this.logger.emit({
        job_id: job.job_id,
        parent_job_id: job.parent_job_id,
        input_hash: inputHash,
        candidate_resources: [],
        excluded_resources: decision.excluded,
        decision_reason: 'No resource passed the zero-spend, terms, quota, health, privacy, and capability gates.',
        cost_confirmed_zero: true,
        validation_result: 'not-dispatched',
        error: 'NO_ELIGIBLE_ZERO_COST_RESOURCE'
      });
      throw new BrokerError('No eligible zero-cost resource is available', {
        code: 'NO_ELIGIBLE_ZERO_COST_RESOURCE', details: { excluded_resources: decision.excluded }
      });
    }

    const failures = [];
    let attempts = 0;
    const maximumAttempts = job.requirements.maximum_attempts;
    const attemptPlan = [];
    while (attemptPlan.length < maximumAttempts) {
      for (const candidate of decision.eligible) {
        attemptPlan.push(candidate);
        if (attemptPlan.length >= maximumAttempts) break;
      }
    }
    const nonRetryableResources = new Set();
    for (const candidate of attemptPlan) {
      const resource = candidate.resource;
      if (nonRetryableResources.has(resource.resource_id)) continue;
      const adapter = this.adapters.get(resource.adapter_id);
      attempts += 1;
      let reservation;
      let quotaFinalized = false;
      const started = this.clock().getTime();
      try {
        if (!adapter) throw new BrokerError(`No adapter registered for ${resource.adapter_id}`, { code: 'ADAPTER_NOT_REGISTERED' });
        reservation = await this.quotaManager.reserve(resource, job, Number(job.payload.quota_units || 1));
        const releaseSemaphore = await this.semaphore(resource).acquire();
        let result;
        try { result = await adapter.execute(job, resource, { attempt: attempts }); }
        finally { releaseSemaphore(); }
        const committed = await this.quotaManager.commit(reservation);
        quotaFinalized = true;
        const latency = Math.max(0, this.clock().getTime() - started);
        const validationErrors = validateAdapterResult(result, {
          requiresProvenance: job.requirements.requires_provenance,
          external: Number(resource.resource_tier) >= 3
        });
        if (validationErrors.length) throw new BrokerError(`Adapter result validation failed: ${validationErrors.join('; ')}`, { code: 'RESULT_VALIDATION_FAILED' });
        await this.registry.recordSuccess(resource.resource_id, latency, this.clock().toISOString());
        const outputHash = await sha256(result.output);
        const envelope = {
          ok: true,
          job_id: job.job_id,
          job_type: job.job_type,
          selected_resource: resource.resource_id,
          resource_tier: resource.resource_tier,
          utility_score: candidate.utility_score,
          cost_confirmed_zero: true,
          cache_hit: false,
          duplicate_work_prevented: false,
          attempts,
          output: result.output,
          provenance: result.provenance,
          completed_at: this.clock().toISOString()
        };
        await this.logger.emit({
          job_id: job.job_id,
          parent_job_id: job.parent_job_id,
          resource_id: resource.resource_id,
          resource_version: resource.adapter_version,
          input_hash: inputHash,
          output_hash: outputHash,
          source_urls: result.provenance?.source_urls || [],
          source_timestamps: result.provenance?.retrieved_at ? [result.provenance.retrieved_at] : [],
          decision_reason: 'Highest-utility resource that passed every hard zero-spend exclusion.',
          candidate_resources: candidates,
          excluded_resources: decision.excluded,
          selected_resource: resource.resource_id,
          utility_score: candidate.utility_score,
          quota_before: reservation.quota_before,
          quota_after: committed?.quota_after ?? null,
          latency,
          cost_confirmed_zero: true,
          validation_result: 'passed'
        });
        if (job.requirements.cacheable && job.requirements.cache_ttl_seconds > 0) {
          this.cache.set(job.deduplication_key, {
            expires_at: this.clock().getTime() + job.requirements.cache_ttl_seconds * 1000,
            value: envelope
          });
        }
        return envelope;
      } catch (error) {
        const latency = Math.max(0, this.clock().getTime() - started);
        if (reservation && !quotaFinalized) await this.quotaManager.commit(reservation).catch(() => null);
        const retryable = error?.retryable === true || error instanceof QuotaUnavailableError ||
          ['PROVIDER_TIMEOUT', 'PROVIDER_REQUEST_FAILED', 'PROVIDER_HTTP_ERROR'].includes(error?.code);
        if (!retryable) nonRetryableResources.add(resource.resource_id);
        const cooldown = attempts >= 3 ? Math.min(15 * 60 * 1000, 1000 * (2 ** Math.min(attempts, 8))) : 0;
        await this.registry.recordFailure(resource.resource_id, error?.message || error, this.clock().toISOString(), cooldown);
        failures.push({ resource_id: resource.resource_id, code: error?.code || 'DISPATCH_FAILED', error: String(error?.message || error), retryable });
        await this.logger.emit({
          job_id: job.job_id,
          parent_job_id: job.parent_job_id,
          resource_id: resource.resource_id,
          resource_version: resource.adapter_version,
          input_hash: inputHash,
          decision_reason: 'Provider attempt failed; broker will retry safely or fall back within the total retry budget.',
          candidate_resources: candidates,
          excluded_resources: decision.excluded,
          selected_resource: resource.resource_id,
          utility_score: candidate.utility_score,
          quota_before: reservation?.quota_before ?? null,
          latency,
          cost_confirmed_zero: true,
          validation_result: 'failed',
          error: `${error?.code || 'DISPATCH_FAILED'}: ${error?.message || error}`
        });
        if (retryable && attempts < maximumAttempts) {
          const backoff = Math.min(2000, 100 * (2 ** (attempts - 1))) + Math.floor(this.random() * 100);
          await this.sleep(backoff);
        }
      }
    }
    throw new BrokerError('Every eligible zero-cost resource failed safely', {
      code: 'ALL_ZERO_COST_RESOURCES_FAILED', details: { failures, excluded_resources: decision.excluded }
    });
  }
}

export const brokerInternals = { Semaphore };
