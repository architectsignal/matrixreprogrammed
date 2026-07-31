import assert from 'node:assert/strict';
import { ZeroCostOfficialHttpAdapter } from '../ai-management/provider-adapters/opportunities/zero-cost-official-http.mjs';

const fixedNow = new Date('2026-07-31T15:00:00.000Z');
const resource = {
  resource_id: 'opportunity-official-test',
  billing_enabled: false,
  payment_method_present: false,
  billing_risk: 'none',
  monetary_cost_per_unit_eur: 0,
  quota_verified: true,
  approved_for_automation: true,
  authentication_type: 'none',
  credential_reference: null,
  approved_data_classes: ['public'],
  prohibited_data_classes: ['internal', 'confidential', 'restricted'],
  allowed_hosts: ['data.example.gov'],
  maximum_payload: 1024 * 1024,
  enabled: true,
  implementation_status: 'production'
};

const fetchImpl = async (url, init) => {
  assert.equal(url, 'https://data.example.gov/feed.json');
  assert.equal(init.method, 'GET');
  assert.equal(init.headers.has('authorization'), false);
  return new Response(JSON.stringify({ records: [{ id: 1 }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

const adapter = new ZeroCostOfficialHttpAdapter({ fetchImpl, clock: () => fixedNow });
const result = await adapter.execute({
  job_type: 'public-data.fetch',
  data_class: 'public',
  payload: { url: 'https://data.example.gov/feed.json', method: 'GET' },
  requirements: { maximum_latency_ms: 5000 }
}, resource);
assert.equal(result.ok, true);
assert.equal(result.cost.amount, 0);
assert.equal(result.cost.billing_possible, false);
assert.equal(result.policy.credentials_used, false);
assert.equal(result.policy.data_class, 'public');
assert.equal(result.provenance.adapter_id, 'zero-cost-official-http');

for (const mutation of [
  { payment_method_present: true },
  { billing_enabled: true },
  { monetary_cost_per_unit_eur: 0.01 },
  { authentication_type: 'api-key' },
  { credential_reference: 'secret:provider' },
  { quota_verified: false },
  { enabled: false },
  { implementation_status: 'candidate-adapter-required' }
]) {
  await assert.rejects(() => adapter.execute({
    job_type: 'public-data.fetch', data_class: 'public',
    payload: { url: 'https://data.example.gov/feed.json', method: 'GET' }, requirements: {}
  }, { ...resource, ...mutation }), error => error?.code === 'OPPORTUNITY_RESOURCE_NOT_ADMISSIBLE');
}

await assert.rejects(() => adapter.execute({
  job_type: 'llm.generate', data_class: 'public', payload: { url: 'https://data.example.gov/feed.json' }, requirements: {}
}, resource), error => error?.code === 'JOB_TYPE_BLOCKED');

await assert.rejects(() => adapter.execute({
  job_type: 'public-data.fetch', data_class: 'internal', payload: { url: 'https://data.example.gov/feed.json' }, requirements: {}
}, resource), error => error?.code === 'DATA_CLASS_BLOCKED');

console.log('Opportunity adapter tests passed: a verified official zero-cost source executed, while billing, credential, quota, disabled, unreviewed-adapter and non-public job variants failed closed.');
