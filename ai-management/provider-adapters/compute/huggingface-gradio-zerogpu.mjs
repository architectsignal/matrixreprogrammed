import { AdapterError } from '../adapter-contract.mjs';
import {
  assertHttpsEndpoint,
  assertRemoteComputeJob,
  collectPublicInputUrls,
  computeProvenance,
  readResponseBounded,
  resolveCredential
} from './compute-adapter-guard.mjs';

const JOB_TYPES = ['remote-compute.execute', 'remote-compute.reserve'];
const API_NAME = /^\/[a-zA-Z0-9_.-]{1,120}$/;
const QUOTA_ERROR = /(?:quota|gpu time|rate limit|usage limit).*(?:exhaust|exceed|remain|reset|limit)|(?:exhaust|exceed).*(?:quota|gpu)/i;

function normalizeApiName(value) {
  const name = String(value || '/predict').trim();
  const normalized = name.startsWith('/') ? name : `/${name}`;
  if (!API_NAME.test(normalized)) throw new AdapterError('Gradio API name is invalid', { code: 'HF_API_NAME_INVALID' });
  return normalized;
}

function parseSse(text) {
  const events = [];
  let event = 'message';
  let data = [];
  const flush = () => {
    if (!data.length) return;
    events.push({ event, data: data.join('\n') });
    event = 'message';
    data = [];
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line) { flush(); continue; }
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  flush();
  return events;
}

function parseJson(value, fallback = value) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export class HuggingFaceGradioZeroGpuAdapter {
  constructor({ fetchImpl = globalThis.fetch, environment = process.env, clock = () => new Date(), maximumBytes = 2 * 1024 * 1024 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.environment = environment;
    this.clock = clock;
    this.maximumBytes = maximumBytes;
    this.adapter_id = 'huggingface-gradio-zerogpu';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource) {
    assertRemoteComputeJob(job, resource, JOB_TYPES);
    const endpoint = assertHttpsEndpoint(resource.metadata?.endpoint_url, resource.allowed_hosts);
    const token = resolveCredential(resource, this.environment);
    const apiName = normalizeApiName(job.payload.api_name || resource.metadata?.default_api_name || '/predict');
    const allowedApiNames = Array.isArray(resource.metadata?.allowed_api_names)
      ? resource.metadata.allowed_api_names.map(normalizeApiName)
      : [apiName];
    if (!allowedApiNames.includes(apiName)) throw new AdapterError('Gradio API name is not allowlisted for this resource', { code: 'HF_API_NAME_NOT_ALLOWLISTED' });

    const publicInputs = job.payload.public_inputs;
    if (!Array.isArray(publicInputs) && !(publicInputs && typeof publicInputs === 'object')) {
      throw new AdapterError('Hugging Face remote compute requires public_inputs as an array or object', { code: 'HF_PUBLIC_INPUTS_REQUIRED' });
    }
    const requestBody = JSON.stringify({ data: Array.isArray(publicInputs) ? publicInputs : Object.values(publicInputs) });
    if (new TextEncoder().encode(requestBody).byteLength > 256 * 1024) {
      throw new AdapterError('Hugging Face request exceeds the public manifest limit', { code: 'HF_REQUEST_TOO_LARGE' });
    }

    const timeoutMs = Math.max(10_000, Math.min(Number(job.requirements?.maximum_latency_ms || 5 * 60 * 1000), 10 * 60 * 1000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const endpointName = apiName.slice(1);
    const submitUrl = new URL(`/gradio_api/call/${encodeURIComponent(endpointName)}`, endpoint);
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': 'MatrixReprogrammedZeroSpendCompute/1.0'
    };

    try {
      const submitted = await this.fetchImpl(submitUrl.toString(), {
        method: 'POST', headers, body: requestBody, redirect: 'error', signal: controller.signal
      });
      const submittedBody = await readResponseBounded(submitted, 128 * 1024);
      if (!submitted.ok) {
        const quota = submitted.status === 429 || QUOTA_ERROR.test(submittedBody.text);
        throw new AdapterError(`Hugging Face Space returned HTTP ${submitted.status}`, {
          code: quota ? 'REMOTE_QUOTA_EXHAUSTED' : 'HF_SUBMIT_FAILED',
          retryable: !quota && submitted.status >= 500,
          details: { status: submitted.status, response: submittedBody.text.slice(0, 1000) }
        });
      }
      const eventId = String(parseJson(submittedBody.text, {})?.event_id || '');
      if (!/^[a-zA-Z0-9_-]{3,200}$/.test(eventId)) throw new AdapterError('Hugging Face Space did not return a valid event ID', { code: 'HF_EVENT_ID_MISSING' });

      const resultUrl = new URL(`/gradio_api/call/${encodeURIComponent(endpointName)}/${encodeURIComponent(eventId)}`, endpoint);
      const completed = await this.fetchImpl(resultUrl.toString(), {
        method: 'GET',
        headers: { accept: 'text/event-stream', authorization: `Bearer ${token}`, 'user-agent': headers['user-agent'] },
        redirect: 'error',
        signal: controller.signal
      });
      const completedBody = await readResponseBounded(completed, this.maximumBytes);
      if (!completed.ok) {
        const quota = completed.status === 429 || QUOTA_ERROR.test(completedBody.text);
        throw new AdapterError(`Hugging Face Space result returned HTTP ${completed.status}`, {
          code: quota ? 'REMOTE_QUOTA_EXHAUSTED' : 'HF_RESULT_FAILED',
          retryable: !quota && completed.status >= 500,
          details: { status: completed.status, response: completedBody.text.slice(0, 1000) }
        });
      }

      const events = parseSse(completedBody.text);
      const errorEvent = events.find(item => item.event === 'error');
      if (errorEvent) {
        const quota = QUOTA_ERROR.test(errorEvent.data);
        throw new AdapterError(`Hugging Face Space execution failed: ${errorEvent.data.slice(0, 500)}`, {
          code: quota ? 'REMOTE_QUOTA_EXHAUSTED' : 'HF_EXECUTION_FAILED', retryable: false
        });
      }
      const completion = [...events].reverse().find(item => item.event === 'complete');
      if (!completion) throw new AdapterError('Hugging Face Space stream ended without a complete event', { code: 'HF_INCOMPLETE_RESULT', retryable: true });
      const result = parseJson(completion.data);
      const retrievedAt = this.clock().toISOString();
      return {
        ok: true,
        output: {
          provider: 'hugging-face',
          operation: 'execute',
          api_name: apiName,
          event_id: eventId,
          result,
          response_hash: completedBody.hash,
          cost_confirmed_zero: true
        },
        provenance: computeProvenance({
          resource,
          adapterId: this.adapter_id,
          adapterVersion: this.adapter_version,
          operation: 'execute',
          sourceUrls: [endpoint.toString(), resource.official_documentation_url, ...collectPublicInputUrls(job.payload)],
          retrievedAt,
          contentHash: completedBody.hash
        })
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw new AdapterError('Hugging Face Space execution timed out', { code: 'REMOTE_COMPUTE_TIMEOUT', retryable: true });
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(String(error?.message || error), { code: 'HF_REQUEST_FAILED', retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

export const huggingFaceAdapterInternals = { JOB_TYPES, API_NAME, QUOTA_ERROR, normalizeApiName, parseSse, parseJson };
