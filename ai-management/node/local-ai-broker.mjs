import { ResourceRegistry } from '../resource-registry/resource-registry.mjs';
import { ResourceBroker } from '../resource-broker/resource-broker.mjs';
import { InMemoryQuotaManager } from '../quota-manager/quota-manager.mjs';
import { StructuredAuditLogger } from '../observability/structured-logger.mjs';
import { OpenAiCompatibleLocalAdapter } from '../provider-adapters/local/openai-compatible-local.mjs';
import { detectLocalRuntime } from '../local-runtime/hardware-detector.mjs';
import { localModelScoreAdjuster, modelCompatibility, routeLocalModel } from '../local-runtime/model-router.mjs';

export async function createLocalAiBroker({
  inventory = null,
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  sleep,
  random
} = {}) {
  const runtime = inventory || await detectLocalRuntime({ fetchImpl, clock });
  const registry = new ResourceRegistry(runtime.resources || []);
  const logger = new StructuredAuditLogger({ actor: 'local-ai-manager', agent: 'local-model-router', clock });
  const broker = new ResourceBroker({
    registry,
    adapters: [new OpenAiCompatibleLocalAdapter({ fetchImpl, clock })],
    quotaManager: new InMemoryQuotaManager(),
    logger,
    policyContext: {
      zeroSpendLock: true,
      externalEnabled: false,
      localOnly: true,
      resourceEligibilityEvaluator: (resource, job, context) => modelCompatibility(resource, job, context),
      resourceScoreAdjuster: (resource, job, context) => localModelScoreAdjuster(resource, job, context)
    },
    clock,
    sleep,
    random
  });
  return { broker, registry, logger, runtime };
}

export async function routeLocalInference(input = {}, options = {}) {
  const system = await createLocalAiBroker(options);
  const job = {
    job_type: 'llm.generate',
    capability_type: 'llm',
    priority: input.priority || 'P2',
    data_class: input.data_class || 'internal',
    payload: {
      prompt: input.prompt,
      messages: input.messages,
      task_profile: input.task_profile || 'reasoning',
      temperature: input.temperature ?? 0.2,
      max_tokens: input.max_tokens ?? 1200
    },
    requirements: {
      cost_ceiling_eur: 0,
      minimum_quality_score: input.minimum_quality_score ?? 60,
      minimum_provenance_score: 0,
      maximum_latency_ms: input.maximum_latency_ms ?? 300000,
      maximum_attempts: input.maximum_attempts ?? 2,
      requires_provenance: true,
      cacheable: input.cacheable === true,
      cache_ttl_seconds: input.cache_ttl_seconds ?? 0,
      allow_cpu_fallback: input.allow_cpu_fallback !== false
    },
    metadata: { task_profile: input.task_profile || 'reasoning' }
  };
  const route = routeLocalModel(await system.registry.list(), job, { now: options.clock?.() || new Date() });
  if (!route.selected) {
    const error = new Error('No compatible local model is currently available');
    error.code = 'NO_LOCAL_MODEL_AVAILABLE';
    error.details = { excluded: route.excluded, detected_servers: system.runtime.servers || [] };
    throw error;
  }
  const result = await system.broker.execute(job);
  return { ...result, routing: { selected_resource: route.selected.resource.resource_id, route_score: route.selected.route_score, candidates: route.eligible.map(item => ({ resource_id: item.resource.resource_id, route_score: item.route_score })) }, runtime: { detected_at: system.runtime.detected_at, hardware: system.runtime.hardware } };
}
