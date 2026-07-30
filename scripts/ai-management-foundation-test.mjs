import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJob } from '../ai-management/core/jobs.mjs';
import { ResourceRegistry, createLocalResource } from '../ai-management/resource-registry/resource-registry.mjs';
import { evaluateResource, rankResources } from '../ai-management/policy-engine/zero-spend-policy.mjs';
import { InMemoryQuotaManager } from '../ai-management/quota-manager/quota-manager.mjs';
import { StructuredAuditLogger, redact } from '../ai-management/observability/structured-logger.mjs';
import { AdapterError } from '../ai-management/provider-adapters/adapter-contract.mjs';
import { DeterministicLocalAdapter } from '../ai-management/provider-adapters/local/deterministic-local.mjs';
import { ApprovedPublicSourceHttpAdapter } from '../ai-management/provider-adapters/datasets/approved-public-source-http.mjs';
import { ResourceBroker } from '../ai-management/resource-broker/resource-broker.mjs';
import { createInvestigationBroker, investigationSourceResource } from '../ai-management/node/investigation-broker.mjs';

const root = process.cwd();
const fixedNow = new Date('2026-07-30T12:00:00.000Z');
const clock = () => fixedNow;

for (const relative of [
  'AGENTS.md',
  'docs/adr/0001-autonomous-free-resource-orchestration.md',
  'docs/AI_MANAGEMENT_IMPLEMENTATION_MAP.md',
  'ai-management/TASK_LEDGER.md',
  'ai-management/schemas/job.schema.json',
  'ai-management/schemas/resource.schema.json',
  'ai-management/config/resources.json',
  'migrations/phase9_ai_resource_orchestration.sql',
  'src/worker-ai-management.js'
]) assert.ok(fs.existsSync(path.join(root, relative)), `Missing ${relative}`);

const jobSchema = JSON.parse(fs.readFileSync(path.join(root, 'ai-management/schemas/job.schema.json'), 'utf8'));
const resourceSchema = JSON.parse(fs.readFileSync(path.join(root, 'ai-management/schemas/resource.schema.json'), 'utf8'));
const seeds = JSON.parse(fs.readFileSync(path.join(root, 'ai-management/config/resources.json'), 'utf8'));
assert.equal(jobSchema.properties.requirements.properties.cost_ceiling_eur.const, 0);
assert.equal(resourceSchema.properties.billing_enabled.const, false);
assert.equal(resourceSchema.properties.payment_method_present.const, false);
assert.ok(seeds.resources.some(resource => resource.resource_id === 'local-deterministic-v1'));
assert.ok(seeds.resources.some(resource => resource.resource_id === 'federal-register-public-api-v1'));

const job = await createJob({
  job_type: 'deterministic.hash',
  capability_type: 'deterministic',
  priority: 'P1',
  data_class: 'confidential',
  payload: { value: 'evidence' },
  requirements: { cost_ceiling_eur: 0, requires_provenance: true, cacheable: true }
}, clock);
assert.equal(job.requirements.cost_ceiling_eur, 0);
assert.match(job.idempotency_key, /^idem-/);

const local = createLocalResource(fixedNow.toISOString());
const localRegistry = new ResourceRegistry([local]);
const localLogger = new StructuredAuditLogger({ clock });
const localBroker = new ResourceBroker({
  registry: localRegistry,
  adapters: [new DeterministicLocalAdapter()],
  quotaManager: new InMemoryQuotaManager(),
  logger: localLogger,
  policyContext: { zeroSpendLock: true, externalEnabled: false, localOnly: true },
  clock,
  sleep: async () => {},
  random: () => 0
});
const localResult = await localBroker.execute(job);
assert.equal(localResult.selected_resource, 'local-deterministic-v1');
assert.equal(localResult.cost_confirmed_zero, true);
assert.equal(localResult.output.sha256.length, 64);
assert.equal(localLogger.records.at(-1).validation_result, 'passed');
const cachedLocal = await localBroker.execute(job);
assert.equal(cachedLocal.cache_hit, true);
assert.equal(cachedLocal.duplicate_work_prevented, true);

const paid = { ...local, resource_id: 'paid-resource', monetary_cost_per_unit_eur: 0.001, billing_risk: 'high' };
const paidDecision = evaluateResource(paid, job, { zeroSpendLock: true, externalEnabled: true, localOnly: false, now: fixedNow });
assert.equal(paidDecision.eligible, false);
assert.ok(paidDecision.reasons.includes('non-zero-monetary-cost'));
assert.ok(paidDecision.reasons.includes('billing-risk-not-zero'));

const quotaTight = { ...local, resource_id: 'quota-tight', quota_unlimited: false, quota_remaining: 1, hard_stop_threshold: 1 };
const quotaDecision = evaluateResource(quotaTight, job, { zeroSpendLock: true, externalEnabled: true, localOnly: false, now: fixedNow });
assert.equal(quotaDecision.eligible, false);
assert.ok(quotaDecision.reasons.includes('quota-safety-margin-reached'));

const source = {
  id: 'test-api',
  label: 'Test official API',
  authority: 'primary-official',
  type: 'json',
  url: 'https://www.federalregister.gov/api/v1/documents.json',
  resourcePolicy: {
    approvedForAutomation: true,
    zeroSpendVerified: true,
    quotaVerified: true,
    billingRisk: 'none',
    hardDailyRequestCeiling: 20,
    officialDocumentationUrl: 'https://www.federalregister.gov/developers/documentation/api/v1',
    termsUrl: 'https://www.federalregister.gov/reader-aids/government-policy-and-ofr-procedures/about-this-site',
    privacyUrl: 'https://www.federalregister.gov/reader-aids/government-policy-and-ofr-procedures/privacy',
    lastTermsCheck: '2026-07-30T00:00:00.000Z',
    lastQuotaCheck: '2026-07-30T00:00:00.000Z',
    termsRevalidationDue: '2026-08-29T00:00:00.000Z'
  }
};
const priorState = { sources: { 'test-api': { status: 'fetched', checkedAt: '2026-07-30T08:00:00.000Z' } } };
const sourceResource = investigationSourceResource(source, { priorState, now: fixedNow, dailyLimit: 20 });
assert.equal(sourceResource.enabled, true);
assert.equal(sourceResource.billing_enabled, false);
assert.equal(sourceResource.health_status, 'healthy');

let fetchCalls = 0;
const fakeFetch = async url => {
  fetchCalls += 1;
  return new Response(JSON.stringify({ results: [{ title: 'Public record' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
};
const investigation = createInvestigationBroker({
  sources: [source], priorState, fetchImpl: fakeFetch, environment: {}, now: fixedNow,
  sleep: async () => {}, random: () => 0
});
const fetchJob = {
  job_type: 'public-data.fetch', capability_type: 'public_data', priority: 'P2', data_class: 'public',
  payload: { url: source.url, method: 'GET', maximum_bytes: 1024 * 1024 },
  requirements: {
    cost_ceiling_eur: 0, minimum_quality_score: 80, minimum_provenance_score: 80,
    maximum_latency_ms: 1000, maximum_attempts: 2, requires_provenance: true,
    cacheable: true, cache_ttl_seconds: 300
  }
};
const fetched = await investigation.broker.execute(fetchJob);
assert.equal(fetched.selected_resource, 'investigation-source-test-api');
assert.equal(fetched.output.status, 200);
assert.equal(fetched.cost_confirmed_zero, true);
assert.deepEqual(fetched.provenance.source_urls, [source.url]);
const fetchedAgain = await investigation.broker.execute(fetchJob);
assert.equal(fetchedAgain.cache_hit, true);
assert.equal(fetchCalls, 1, 'cache must prevent duplicate external requests');

const externalOff = createInvestigationBroker({
  sources: [source], priorState, fetchImpl: fakeFetch,
  environment: { AI_RESOURCE_EXTERNAL_ENABLED: 'false' }, now: fixedNow,
  sleep: async () => {}, random: () => 0
});
await assert.rejects(() => externalOff.broker.execute(fetchJob), error => error.code === 'NO_ELIGIBLE_ZERO_COST_RESOURCE');

await assert.rejects(
  () => new ApprovedPublicSourceHttpAdapter({ fetchImpl: fakeFetch }).execute(
    { ...job, job_type: 'public-data.fetch', capability_type: 'public_data', data_class: 'public', payload: { url: 'https://127.0.0.1/private', method: 'GET' } },
    { ...sourceResource, allowed_hosts: ['127.0.0.1'] }
  ),
  error => error instanceof AdapterError && error.code === 'SSRF_TARGET_BLOCKED'
);

function externalResource(id, score) {
  return {
    ...sourceResource,
    resource_id: id,
    quality_score: score,
    reliability_score: score,
    latency_score: score,
    adapter_id: 'fallback-test',
    allowed_hosts: ['example.test'],
    quota_remaining: 20,
    hard_stop_threshold: 2
  };
}
const fallbackLogger = new StructuredAuditLogger({ clock });
const fallbackBroker = new ResourceBroker({
  registry: new ResourceRegistry([externalResource('primary-free', 99), externalResource('fallback-free', 90)]),
  adapters: [{
    adapter_id: 'fallback-test', adapter_version: '1.0.0',
    async execute(_job, resource) {
      if (resource.resource_id === 'primary-free') throw new AdapterError('temporary failure', { code: 'PROVIDER_REQUEST_FAILED', retryable: true });
      return { ok: true, output: { value: 'fallback' }, provenance: { source_urls: ['https://example.test/data'], retrieved_at: fixedNow.toISOString(), adapter_id: 'fallback-test', adapter_version: '1.0.0' } };
    }
  }],
  logger: fallbackLogger,
  policyContext: { zeroSpendLock: true, externalEnabled: true, localOnly: false },
  clock,
  sleep: async () => {},
  random: () => 0
});
const fallbackResult = await fallbackBroker.execute({
  ...fetchJob,
  payload: { url: 'https://example.test/data' },
  requirements: { ...fetchJob.requirements, cacheable: false, maximum_attempts: 2 }
});
assert.equal(fallbackResult.selected_resource, 'fallback-free');
assert.equal(fallbackResult.attempts, 2);
assert.ok(fallbackLogger.records.some(record => record.selected_resource === 'primary-free' && record.validation_result === 'failed'));
assert.equal(fallbackLogger.records.at(-1).selected_resource, 'fallback-free');

const ranked = rankResources([externalResource('low', 70), externalResource('high', 95)], await createJob({ ...fetchJob, payload: { url: 'https://example.test/data' } }, clock), {
  zeroSpendLock: true, externalEnabled: true, localOnly: false, now: fixedNow
});
assert.equal(ranked.eligible[0].resource.resource_id, 'high');

const redacted = redact({ authorization: 'Bearer secret', url: 'https://example.test/?api_key=SECRET&safe=yes' });
assert.equal(redacted.authorization, '[REDACTED]');
assert.match(redacted.url, /api_key=%5BREDACTED%5D/);
assert.doesNotMatch(JSON.stringify(redacted), /SECRET/);

const investigationSource = fs.readFileSync(path.join(root, 'scripts/run-investigation-machine.js'), 'utf8');
const productionSource = fs.readFileSync(path.join(root, 'src/worker-production.js'), 'utf8');
const wranglerToml = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/phase9_ai_resource_orchestration.sql'), 'utf8');
assert.doesNotMatch(investigationSource, /await\s+fetch\s*\(/, 'Investigator must not dispatch network requests directly');
assert.doesNotMatch(investigationSource, /USER_AGENT[^\n]*@[a-z0-9.-]+\.[a-z]{2,}/i, 'Default HTTP identification must not disclose a personal email address');
assert.match(investigationSource, /resourceBroker\.execute\(/);
assert.match(investigationSource, /costConfirmedZero/);
assert.match(productionSource, /isAiManagementRoute/);
assert.match(productionSource, /cloudflare-worker-ai-management/);
for (const flag of ['AI_RESOURCE_BROKER_ENABLED', 'AI_RESOURCE_EXTERNAL_ENABLED', 'AI_RESOURCE_LOCAL_ONLY', 'AI_RESOURCE_ZERO_SPEND_LOCK', 'AI_RESOURCE_SCOUT_ENABLED']) {
  assert.match(wranglerToml, new RegExp(`${flag} = `), `Missing ${flag}`);
}
for (const table of ['ai_resources', 'ai_jobs', 'ai_quota_reservations', 'ai_result_cache', 'ai_audit_log', 'ai_feature_flags']) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `Missing ${table}`);
}

console.log('AI management foundation tests passed: zero-spend exclusions, quota safety, local routing, approved public-data routing, cache, fallback, SSRF blocking, redaction, audit, and Investigator integration.');
