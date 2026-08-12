import assert from 'node:assert/strict';
import { opportunityHunterWorkerInternals } from '../src/worker-opportunity-hunter.js';
import { createInvestigationBroker } from '../ai-management/node/investigation-broker.mjs';

const fixedNow = new Date('2026-07-31T16:00:00.000Z');

const approved = {
  opportunity: {
    opportunity_id: 'opportunity-public-model',
    kind: 'model',
    provider_name: 'Example',
    service_name: 'Public Model',
    official_url: 'https://example.org/model',
    documentation_url: 'https://example.org/docs',
    terms_url: 'https://example.org/terms',
    privacy_url: 'https://example.org/privacy',
    status_url: null,
    authentication_type: 'none',
    account_required: false,
    identity_verification_required: false,
    payment_method_required: false,
    automation_permission: 'allowed',
    commercial_use: 'allowed',
    zero_cost_verified: true,
    quota_verified: true,
    free_quota: 100,
    free_quota_unit: 'requests/day',
    supported_capabilities: ['model'],
    metadata: { adapter_id: 'example-adapter', supported_job_types: ['llm.generate'] }
  },
  approval_state: 'approved-auto',
  auto_activatable: true,
  confidence: 100,
  blockers: [],
  owner_actions: [],
  evaluated_at: fixedNow.toISOString()
};

const resource = opportunityHunterWorkerInternals.resourceFromEvaluation(approved, fixedNow);
assert.ok(resource);
assert.equal(resource.billing_enabled, false);
assert.equal(resource.payment_method_present, false);
assert.equal(resource.monetary_cost_per_unit_eur, 0);
assert.equal(resource.enabled, false);
assert.equal(resource.implementation_status, 'disabled');
assert.equal(resource.metadata.activation_blocked_until_adapter_ready, true);

const approvedPublic = {
  ...approved,
  opportunity: {
    ...approved.opportunity,
    opportunity_id: 'opportunity-public-api',
    kind: 'dataset',
    official_url: 'https://api.example.org/',
    supported_capabilities: ['public_data'],
    metadata: {
      adapter_id: 'zero-spend-opportunity-public-http', adapter_version: '1.0.0',
      supported_job_types: ['public-data.fetch'], maximum_payload: 1048576, concurrency_limit: 1
    }
  }
};
const publicResource = opportunityHunterWorkerInternals.resourceFromEvaluation(approvedPublic, fixedNow);
assert.equal(publicResource.enabled, true);
assert.equal(publicResource.implementation_status, 'production');
assert.equal(publicResource.adapter_id, 'zero-spend-opportunity-public-http');
assert.equal(publicResource.zero_cost_verified, true);
assert.equal(publicResource.external_charge_possible, false);
assert.equal(publicResource.metadata.activation_blocked_until_adapter_ready, false);

const runtime = createInvestigationBroker({
  additionalResources: [publicResource], now: fixedNow,
  fetchImpl: async url => new Response(JSON.stringify({ ok: true, source: String(url) }), {
    status: 200, headers: { 'content-type': 'application/json' }
  }),
  sleep: async () => {}, random: () => 0
});
const routed = await runtime.broker.execute({
  job_type: 'public-data.fetch', capability_type: 'public_data', priority: 'P2', data_class: 'public',
  payload: { url: 'https://api.example.org/records', method: 'GET', maximum_bytes: 1048576 },
  requirements: {
    cost_ceiling_eur: 0, minimum_quality_score: 60, minimum_provenance_score: 80,
    maximum_latency_ms: 1000, maximum_attempts: 1, requires_provenance: true, cacheable: false
  }
});
assert.equal(routed.selected_resource, publicResource.resource_id);
assert.equal(routed.cost_confirmed_zero, true);
assert.equal(routed.provenance.adapter_id, 'zero-spend-opportunity-public-http');

for (const mutation of [
  { account_required: true },
  { identity_verification_required: true },
  { payment_method_required: true },
  { authentication_type: 'api_key' }
]) {
  const unsafe = {
    ...approved,
    opportunity: { ...approved.opportunity, ...mutation }
  };
  assert.equal(opportunityHunterWorkerInternals.resourceFromEvaluation(unsafe, fixedNow), null);
}

assert.deepEqual(opportunityHunterWorkerInternals.configuredOpportunities({ AI_OPPORTUNITY_SEEDS_JSON: '[]' }), []);
assert.deepEqual(opportunityHunterWorkerInternals.configuredOpportunities({ AI_OPPORTUNITY_SEEDS_JSON: 'not-json' }), []);
assert.equal(opportunityHunterWorkerInternals.configuredOpportunities({ AI_OPPORTUNITY_SEEDS_JSON: JSON.stringify([approved.opportunity]) }).length, 1);
const defaults = opportunityHunterWorkerInternals.configuredOpportunities({});
assert.deepEqual(defaults.map(item => item.opportunity_id), [
  'official-sec-edgar-data-apis', 'official-usaspending-public-api',
  'official-kaggle-notebooks-free-gpu', 'official-hugging-face-zerogpu'
]);
const publicDefaults = defaults.filter(item => item.kind === 'dataset');
const computeDefaults = defaults.filter(item => item.kind === 'compute');
assert.ok(publicDefaults.every(item => item.authentication_type === 'none' && item.metadata.adapter_id === 'zero-spend-opportunity-public-http'));
assert.ok(computeDefaults.every(item => item.automation_permission === 'unknown' && item.metadata.owner_onboarding_required === true));
assert.equal(opportunityHunterWorkerInternals.requestedOpportunities({ use_defaults: true }, {}).length, 4);
assert.deepEqual(opportunityHunterWorkerInternals.requestedOpportunities({}, {}), []);

console.log('Opportunity Hunter Worker tests passed: live public API routing, zero-spend persistence, adapter-ready activation, and owner-action rejection.');
