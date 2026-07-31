import assert from 'node:assert/strict';
import { ZeroSpendOpportunityHttpAdapter } from '../ai-management/provider-adapters/opportunities/zero-spend-public-http.mjs';

const fixed = new Date('2026-07-31T18:00:00.000Z');
const fetchImpl = async url => new Response(JSON.stringify({ ok: true, url: String(url) }), {
  status: 200,
  headers: { 'content-type': 'application/json' }
});

const resource = {
  resource_id: 'opportunity-example-public-api',
  billing_enabled: false,
  monetary_cost_per_unit_eur: 0,
  payment_method_present: false,
  billing_risk: 'none',
  authentication_type: 'none',
  credential_reference: null,
  quota_verified: true,
  free_quota_amount: 100,
  approved_for_automation: true,
  approved_data_classes: ['public'],
  prohibited_data_classes: ['internal', 'confidential', 'restricted'],
  supported_job_types: ['public-data.fetch'],
  allowed_hosts: ['api.example.org'],
  implementation_status: 'production',
  enabled: true,
  maximum_payload: 1024 * 1024
};

const job = {
  job_type: 'public-data.fetch',
  data_class: 'public',
  payload: { url: 'https://api.example.org/data', method: 'GET' },
  requirements: { maximum_latency_ms: 5000 }
};

const adapter = new ZeroSpendOpportunityHttpAdapter({ fetchImpl, clock: () => fixed });
const result = await adapter.execute(job, resource);
assert.equal(result.ok, true);
assert.equal(result.cost_confirmed_zero, true);
assert.equal(result.monetary_cost_eur, 0);
assert.equal(result.provenance.adapter_id, 'zero-spend-opportunity-public-http');
assert.match(result.output.body, /"ok":true/);

await assert.rejects(() => adapter.execute({ ...job, data_class: 'internal' }, resource), error => error.code === 'DATA_CLASS_BLOCKED');
await assert.rejects(() => adapter.execute(job, { ...resource, payment_method_present: true }), error => error.code === 'PAYMENT_METHOD_PRESENT');
await assert.rejects(() => adapter.execute(job, { ...resource, quota_verified: false }), error => error.code === 'QUOTA_UNVERIFIED');
await assert.rejects(() => adapter.execute(job, { ...resource, allowed_hosts: ['api.example.org', 'other.example.org'] }), error => error.code === 'HOST_ALLOWLIST_INVALID');
await assert.rejects(() => adapter.execute({ ...job, job_type: 'llm.generate' }, resource), error => error.code === 'JOB_TYPE_BLOCKED');

console.log('Opportunity Hunter adapter tests passed: public-only execution, exact zero spend, no payment method, verified quota and strict host allowlist.');
