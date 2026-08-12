import assert from 'node:assert/strict';
import { opportunityHunterWorkerInternals } from '../src/worker-opportunity-hunter.js';

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
assert.equal(resource.implementation_status, 'candidate-adapter-required');
assert.equal(resource.metadata.activation_blocked_until_adapter_ready, true);

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
assert.deepEqual(defaults.map(item => item.opportunity_id), ['official-kaggle-notebooks-free-gpu', 'official-hugging-face-zerogpu']);
assert.ok(defaults.every(item => item.automation_permission === 'unknown' && item.payment_method_required === false));
assert.ok(defaults.every(item => item.metadata.owner_onboarding_required === true));

console.log('Opportunity Hunter Worker tests passed: zero-spend persistence, adapter-ready activation gate, and owner-action rejection.');
