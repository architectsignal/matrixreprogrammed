import assert from 'node:assert/strict';
import { HuggingFacePublicAiZeroSpendAdapter, assertHuggingFacePublicAiResource } from '../ai-management/provider-adapters/opportunities/huggingface-publicai-zero-spend.mjs';

const now = new Date('2026-07-31T22:00:00.000Z');
const resource = {
  resource_id: 'hf-publicai-free',
  provider_name: 'Hugging Face',
  adapter_id: 'huggingface-publicai-zero-spend',
  approved_for_automation: true,
  manual_approval_required: false,
  billing_enabled: false,
  payment_method_present: false,
  billing_risk: 'none',
  paid_fallback: false,
  monetary_cost_per_unit_eur: 0,
  quota_verified: true,
  quota_remaining: 1,
  authentication_type: 'bearer-token',
  credential_reference: 'secret:HF_INFERENCE_TOKEN',
  approved_data_classes: ['public'],
  prohibited_data_classes: ['internal', 'confidential', 'restricted'],
  supported_job_types: ['llm.generate.external-public'],
  allowed_hosts: ['router.huggingface.co'],
  last_terms_check: now.toISOString(),
  last_quota_check: now.toISOString(),
  enabled: true,
  implementation_status: 'production',
  metadata: { model_id: 'swiss-ai/Apertus-8B-Instruct-2509', paid_fallback: false }
};

assert.equal(assertHuggingFacePublicAiResource(resource, now), true);

let request;
const adapter = new HuggingFacePublicAiZeroSpendAdapter({
  secretResolver: async ref => ref === 'secret:HF_INFERENCE_TOKEN' ? 'hf_test_only_not_real' : null,
  fetchImpl: async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Matrix external compute probe passed.' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
});

const result = await adapter.execute({
  job_type: 'llm.generate.external-public',
  data_class: 'public',
  payload: { prompt: 'Reply with exactly: Matrix external compute probe passed.', max_tokens: 32 },
  requirements: { cost_ceiling_eur: 0 }
}, resource, { now });

assert.equal(result.ok, true);
assert.equal(result.cost_confirmed_zero, true);
assert.equal(result.monetary_cost_eur, 0);
assert.equal(result.paid_fallback_used, false);
assert.equal(request.url, 'https://router.huggingface.co/v1/chat/completions');
assert.equal(request.body.model, 'swiss-ai/Apertus-8B-Instruct-2509:publicai');
assert.equal(request.body.stream, false);
assert.equal(request.body.temperature, 0);
assert.ok(request.options.headers.authorization.startsWith('Bearer hf_'));

for (const [patch, code] of [
  [{ payment_method_present: true }, 'PAYMENT_METHOD_PRESENT'],
  [{ billing_risk: 'possible' }, 'BILLING_RISK'],
  [{ paid_fallback: true }, 'PAID_FALLBACK'],
  [{ quota_remaining: 0 }, 'QUOTA_EXHAUSTED'],
  [{ manual_approval_required: true }, 'OWNER_APPROVAL_INCOMPLETE'],
  [{ allowed_hosts: ['router.huggingface.co', 'example.com'] }, 'HOST_ALLOWLIST_INVALID'],
  [{ last_terms_check: '2026-07-29T00:00:00.000Z' }, 'TERMS_STALE']
]) {
  assert.throws(() => assertHuggingFacePublicAiResource({ ...resource, ...patch }, now), error => error.code === code);
}

await assert.rejects(() => adapter.execute({
  job_type: 'llm.generate.external-public', data_class: 'internal', payload: { prompt: 'private' }, requirements: { cost_ceiling_eur: 0 }
}, resource, { now }), error => error.code === 'DATA_CLASS_BLOCKED');

await assert.rejects(() => adapter.execute({
  job_type: 'llm.generate.external-public', data_class: 'public', payload: { prompt: 'test' }, requirements: { cost_ceiling_eur: 0.01 }
}, resource, { now }), error => error.code === 'JOB_COST_CEILING');

console.log('Hugging Face PublicAI zero-spend activation tests passed.');
