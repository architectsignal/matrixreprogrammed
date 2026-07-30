import { AdapterError } from '../adapter-contract.mjs';
import { isLoopbackUrl } from '../../local-runtime/hardware-detector.mjs';

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function normalizeMessages(job) {
  if (Array.isArray(job.payload?.messages) && job.payload.messages.length) {
    return job.payload.messages.slice(0, 100).map(message => ({
      role: ['system', 'user', 'assistant'].includes(message?.role) ? message.role : 'user',
      content: String(message?.content || '').slice(0, 500000)
    }));
  }
  return [{ role: 'user', content: String(job.payload?.prompt || '').slice(0, 500000) }];
}

function endpointFor(resource) {
  const endpoint = resource?.metadata?.endpoint;
  if (!endpoint || !isLoopbackUrl(endpoint)) throw new AdapterError('Local LLM endpoint must be loopback-only', { code: 'LOCAL_ENDPOINT_BLOCKED' });
  return String(endpoint).replace(/\/+$/, '');
}

async function requestJson(fetchImpl, url, body, timeoutMs) {
  if (!isLoopbackUrl(url)) throw new AdapterError('Local LLM request refused a non-loopback URL', { code: 'LOCAL_ENDPOINT_BLOCKED' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new AdapterError('Local LLM returned invalid JSON', { code: 'LOCAL_MODEL_INVALID_JSON' }); }
    if (!response.ok) throw new AdapterError(`Local LLM returned HTTP ${response.status}`, { code: 'LOCAL_MODEL_HTTP_ERROR', retryable: response.status >= 500, details: { status: response.status, payload } });
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new AdapterError('Local LLM request timed out', { code: 'LOCAL_MODEL_TIMEOUT', retryable: true });
    if (error instanceof AdapterError) throw error;
    throw new AdapterError(String(error?.message || error), { code: 'LOCAL_MODEL_REQUEST_FAILED', retryable: true });
  } finally { clearTimeout(timer); }
}

export class OpenAiCompatibleLocalAdapter {
  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.adapter_id = 'local-openai-compatible';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource) {
    if (job.job_type !== 'llm.generate') throw new AdapterError(`Unsupported local model job type: ${job.job_type}`, { code: 'UNSUPPORTED_JOB' });
    const endpoint = endpointFor(resource);
    const protocol = String(resource.metadata?.protocol || 'openai').toLowerCase();
    const model = resource.metadata?.model_id || resource.service_name;
    const messages = normalizeMessages(job);
    const temperature = boundedNumber(job.payload?.temperature, 0.2, 0, 1.5);
    const maxTokens = Math.round(boundedNumber(job.payload?.max_tokens ?? job.payload?.max_completion_tokens, 1024, 1, 16384));
    const timeoutMs = Math.round(boundedNumber(job.requirements?.maximum_latency_ms, 120000, 1000, 600000));

    let payload;
    let response;
    if (protocol === 'ollama') {
      payload = { model, messages, stream: false, options: { temperature, num_predict: maxTokens } };
      response = await requestJson(this.fetchImpl, `${endpoint}/api/chat`, payload, timeoutMs);
    } else {
      payload = { model, messages, temperature, max_tokens: maxTokens, stream: false };
      response = await requestJson(this.fetchImpl, `${endpoint}/v1/chat/completions`, payload, timeoutMs);
    }

    const text = protocol === 'ollama'
      ? response?.message?.content
      : response?.choices?.[0]?.message?.content ?? response?.choices?.[0]?.text;
    if (!String(text || '').trim()) throw new AdapterError('Local LLM returned no usable text', { code: 'LOCAL_MODEL_EMPTY_RESULT' });
    const retrievedAt = this.clock().toISOString();
    return {
      ok: true,
      output: {
        text: String(text),
        model,
        protocol,
        usage: response?.usage || { prompt_tokens: response?.prompt_eval_count || null, completion_tokens: response?.eval_count || null },
        finish_reason: response?.choices?.[0]?.finish_reason || response?.done_reason || null
      },
      provenance: {
        source_urls: [],
        retrieved_at: retrievedAt,
        transformation: 'owner-controlled-local-llm-inference',
        model_id: model,
        adapter_id: this.adapter_id,
        adapter_version: this.adapter_version,
        external_network_used: false,
        endpoint_scope: 'loopback-only'
      }
    };
  }
}

export const localLlmAdapterInternals = { boundedNumber, normalizeMessages, endpointFor, requestJson };
