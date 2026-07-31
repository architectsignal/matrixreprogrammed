import { AdapterError } from '../adapter-contract.mjs';

const ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const PROVIDER_SUFFIX = ':publicai';
const MAX_TERMS_AGE_MS = 24 * 60 * 60 * 1000;

function fail(message, code, details = {}) {
  throw new AdapterError(message, { code, retryable: false, details });
}

function asDate(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? new Date(time) : null;
}

export function assertHuggingFacePublicAiResource(resource = {}, now = new Date()) {
  if (resource.provider_name !== 'Hugging Face') fail('Provider must be Hugging Face', 'PROVIDER_MISMATCH');
  if (resource.adapter_id !== 'huggingface-publicai-zero-spend') fail('Adapter identity mismatch', 'ADAPTER_MISMATCH');
  if (resource.approved_for_automation !== true) fail('Owner automation approval is required', 'OWNER_APPROVAL_REQUIRED');
  if (resource.manual_approval_required !== false) fail('Resource must have completed owner approval', 'OWNER_APPROVAL_INCOMPLETE');
  if (resource.billing_enabled !== false) fail('Billing must be disabled', 'BILLING_ENABLED');
  if (resource.payment_method_present !== false) fail('Payment methods are forbidden', 'PAYMENT_METHOD_PRESENT');
  if (resource.billing_risk !== 'none') fail('Billing risk must be none', 'BILLING_RISK');
  if (resource.paid_fallback === true || resource.metadata?.paid_fallback === true) fail('Paid fallback is forbidden', 'PAID_FALLBACK');
  if (Number(resource.monetary_cost_per_unit_eur || 0) !== 0) fail('Resource cost must be exactly EUR 0', 'NON_ZERO_COST');
  if (resource.quota_verified !== true) fail('Free quota must be verified', 'QUOTA_UNVERIFIED');
  if (Number(resource.quota_remaining || resource.free_quota_amount || 0) <= 0) fail('Verified free quota is exhausted', 'QUOTA_EXHAUSTED');
  if (resource.authentication_type !== 'bearer-token') fail('A bearer token reference is required', 'AUTHENTICATION_INVALID');
  if (!resource.credential_reference || !String(resource.credential_reference).startsWith('secret:')) fail('Credential must be a secret reference', 'CREDENTIAL_REFERENCE_INVALID');
  if (!Array.isArray(resource.approved_data_classes) || !resource.approved_data_classes.includes('public')) fail('Public data approval is required', 'PUBLIC_DATA_NOT_APPROVED');
  for (const restricted of ['internal', 'confidential', 'restricted']) {
    if (!Array.isArray(resource.prohibited_data_classes) || !resource.prohibited_data_classes.includes(restricted)) fail(`${restricted} data must be prohibited`, 'PRIVATE_DATA_BOUNDARY_MISSING');
  }
  if (!Array.isArray(resource.supported_job_types) || !resource.supported_job_types.includes('llm.generate.external-public')) fail('External public LLM job type is not approved', 'JOB_TYPE_NOT_APPROVED');
  if (!Array.isArray(resource.allowed_hosts) || resource.allowed_hosts.length !== 1 || resource.allowed_hosts[0] !== 'router.huggingface.co') fail('Hugging Face router host must be the sole allowlisted host', 'HOST_ALLOWLIST_INVALID');
  const termsChecked = asDate(resource.last_terms_check);
  const quotaChecked = asDate(resource.last_quota_check);
  if (!termsChecked || now.getTime() - termsChecked.getTime() > MAX_TERMS_AGE_MS) fail('Pricing and terms verification is stale', 'TERMS_STALE');
  if (!quotaChecked || now.getTime() - quotaChecked.getTime() > MAX_TERMS_AGE_MS) fail('Quota verification is stale', 'QUOTA_STALE');
  if (resource.enabled !== true || resource.implementation_status !== 'production') fail('Resource is not enabled for production', 'RESOURCE_DISABLED');
  return true;
}

export class HuggingFacePublicAiZeroSpendAdapter {
  constructor({ fetchImpl = globalThis.fetch, secretResolver } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    if (typeof secretResolver !== 'function') throw new TypeError('secretResolver is required');
    this.fetchImpl = fetchImpl;
    this.secretResolver = secretResolver;
    this.adapter_id = 'huggingface-publicai-zero-spend';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource, context = {}) {
    const now = context.now instanceof Date ? context.now : new Date();
    assertHuggingFacePublicAiResource(resource, now);
    if (job?.job_type !== 'llm.generate.external-public') fail('Only llm.generate.external-public is allowed', 'JOB_TYPE_BLOCKED');
    if (job?.data_class !== 'public') fail('Only public data may be sent externally', 'DATA_CLASS_BLOCKED');
    if (Number(job?.requirements?.cost_ceiling_eur ?? 0) !== 0) fail('Job cost ceiling must be EUR 0', 'JOB_COST_CEILING');
    const prompt = String(job?.payload?.prompt || '');
    if (!prompt || prompt.length > 12000) fail('Prompt is missing or exceeds the external public limit', 'PROMPT_INVALID');
    const configuredModel = String(resource.metadata?.model_id || 'swiss-ai/Apertus-8B-Instruct-2509');
    const model = configuredModel.endsWith(PROVIDER_SUFFIX) ? configuredModel : `${configuredModel}${PROVIDER_SUFFIX}`;
    if (!model.endsWith(PROVIDER_SUFFIX)) fail('Provider pinning failed', 'PROVIDER_NOT_PINNED');
    const token = await this.secretResolver(resource.credential_reference);
    if (!token || !String(token).startsWith('hf_')) fail('Hugging Face token is unavailable', 'CREDENTIAL_UNAVAILABLE');
    const response = await this.fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'matrixreprogrammed-zero-spend/1.0' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false, max_tokens: Math.min(512, Number(job?.payload?.max_tokens || 256)), temperature: 0 }),
      signal: AbortSignal.timeout(60000)
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 1000) }; }
    if (!response.ok) fail(`Hugging Face PublicAI returned HTTP ${response.status}`, 'PROVIDER_HTTP_ERROR', { status: response.status, payload });
    const output = payload?.choices?.[0]?.message?.content;
    if (!output) fail('Provider returned no completion', 'EMPTY_COMPLETION');
    return {
      ok: true,
      output,
      model,
      provider: 'publicai',
      cost_confirmed_zero: true,
      monetary_cost_eur: 0,
      paid_fallback_used: false,
      completed_at: now.toISOString(),
      provenance: {
        source_urls: ['https://huggingface.co/docs/inference-providers/en/providers/publicai'],
        retrieved_at: now.toISOString(),
        adapter_id: this.adapter_id,
        adapter_version: this.adapter_version
      }
    };
  }
}
