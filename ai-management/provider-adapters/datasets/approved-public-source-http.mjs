import { AdapterError } from '../adapter-contract.mjs';
import { sha256 } from '../../core/jobs.mjs';

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i;
const CREDENTIAL_QUERY = /^(api[_-]?key|access[_-]?token|token|secret|password|signature|sig)$/i;
const SAFE_CONTENT_TYPE = /(?:application\/(?:json|[^;]+\+json|xml|rss\+xml|atom\+xml)|text\/(?:html|plain|xml)|application\/octet-stream)/i;

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168);
  }
  return false;
}

function validateUrl(value, allowedHosts) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new AdapterError('The provider URL is invalid', { code: 'INVALID_PROVIDER_URL' }); }
  if (url.protocol !== 'https:') throw new AdapterError('External provider URLs must use HTTPS', { code: 'HTTPS_REQUIRED' });
  if (url.username || url.password) throw new AdapterError('Credentials are forbidden in provider URLs', { code: 'CREDENTIAL_IN_URL' });
  if (isPrivateHostname(url.hostname)) throw new AdapterError('Private or local network targets are forbidden', { code: 'SSRF_TARGET_BLOCKED' });
  const allowed = (allowedHosts || []).map(host => String(host).toLowerCase());
  if (!allowed.length || !allowed.includes(url.hostname.toLowerCase())) {
    throw new AdapterError('Provider host is not allowlisted', { code: 'HOST_NOT_ALLOWLISTED', details: { hostname: url.hostname } });
  }
  for (const key of url.searchParams.keys()) {
    if (CREDENTIAL_QUERY.test(key)) throw new AdapterError('Credential-shaped query parameters are forbidden', { code: 'CREDENTIAL_IN_URL' });
  }
  return url;
}

function safeHeaders(input = {}, userAgent) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(input || {})) {
    if (SENSITIVE_HEADER.test(key)) throw new AdapterError(`Sensitive header is forbidden: ${key}`, { code: 'CREDENTIAL_HEADER_BLOCKED' });
    headers.set(key, String(value));
  }
  headers.set('user-agent', userAgent);
  if (!headers.has('accept')) headers.set('accept', 'application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.5');
  return headers;
}

async function readBoundedBody(response, maximumBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new AdapterError(`Response exceeds ${maximumBytes} bytes`, { code: 'RESPONSE_TOO_LARGE' });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new AdapterError(`Response exceeds ${maximumBytes} bytes`, { code: 'RESPONSE_TOO_LARGE' });
  return { bytes, text: new TextDecoder('utf-8', { fatal: false }).decode(bytes) };
}

export class ApprovedPublicSourceHttpAdapter {
  constructor({ fetchImpl = globalThis.fetch, userAgent = 'MatrixReprogrammedInvestigation/2.0', maximumBytes = 8 * 1024 * 1024, clock = () => new Date() } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.userAgent = userAgent;
    this.maximumBytes = maximumBytes;
    this.clock = clock;
    this.adapter_id = 'approved-public-source-http';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource) {
    if (job.data_class !== 'public') throw new AdapterError('This adapter accepts public data only', { code: 'DATA_CLASS_BLOCKED' });
    const method = String(job.payload.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) throw new AdapterError('Only GET and bounded JSON POST are supported', { code: 'METHOD_BLOCKED' });
    const timeoutMs = Math.max(250, Math.min(Number(job.requirements.maximum_latency_ms || 25000), 60000));
    const maximumBytes = Math.min(Number(job.payload.maximum_bytes || resource.maximum_payload || this.maximumBytes), this.maximumBytes);
    const headers = safeHeaders(job.payload.headers, this.userAgent);
    let body;
    if (method === 'POST') {
      headers.set('content-type', 'application/json');
      body = typeof job.payload.body === 'string' ? job.payload.body : JSON.stringify(job.payload.body ?? {});
      if (new TextEncoder().encode(body).byteLength > Math.min(maximumBytes, 1024 * 1024)) {
        throw new AdapterError('Request body is too large', { code: 'REQUEST_TOO_LARGE' });
      }
    }

    let url = validateUrl(job.payload.url, resource.allowed_hosts);
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (let redirects = 0; redirects <= 3; redirects += 1) {
        response = await this.fetchImpl(url.toString(), { method, headers, body, redirect: 'manual', signal: controller.signal });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        if (!location) throw new AdapterError('Redirect response did not include a location', { code: 'INVALID_REDIRECT' });
        if (redirects === 3) throw new AdapterError('Too many redirects', { code: 'REDIRECT_LIMIT' });
        url = validateUrl(new URL(location, url).toString(), resource.allowed_hosts);
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw new AdapterError('Provider request timed out', { code: 'PROVIDER_TIMEOUT', retryable: true });
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(String(error?.message || error), { code: 'PROVIDER_REQUEST_FAILED', retryable: true });
    } finally {
      clearTimeout(timer);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !SAFE_CONTENT_TYPE.test(contentType)) {
      throw new AdapterError(`Unexpected response MIME type: ${contentType}`, { code: 'MIME_TYPE_BLOCKED' });
    }
    const read = await readBoundedBody(response, maximumBytes);
    if (!response.ok) {
      throw new AdapterError(`Provider returned HTTP ${response.status}`, {
        code: 'PROVIDER_HTTP_ERROR', retryable: response.status === 429 || response.status >= 500,
        details: { status: response.status }
      });
    }
    const retrievedAt = this.clock().toISOString();
    return {
      ok: true,
      output: {
        status: response.status,
        final_url: response.url || url.toString(),
        content_type: contentType,
        bytes: read.bytes.byteLength,
        body: read.text,
        body_hash: await sha256(read.text)
      },
      provenance: {
        source_urls: [response.url || url.toString()],
        requested_url: job.payload.url,
        retrieved_at: retrievedAt,
        http_status: response.status,
        content_hash: await sha256(read.text),
        adapter_id: this.adapter_id,
        adapter_version: this.adapter_version
      }
    };
  }
}

export const publicHttpInternals = { isPrivateHostname, validateUrl, safeHeaders, readBoundedBody };
