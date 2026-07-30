import { AdapterError } from '../adapter-contract.mjs';
import { sha256 } from '../../core/jobs.mjs';

function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new AdapterError('Only HTTP(S) URLs can be canonicalised', { code: 'INVALID_URL' });
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
  const sorted = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
  url.search = '';
  for (const [key, item] of sorted) url.searchParams.append(key, item);
  return url.toString();
}

export class DeterministicLocalAdapter {
  constructor() {
    this.adapter_id = 'deterministic-local';
    this.adapter_version = '1.0.0';
  }

  async execute(job) {
    let output;
    if (job.job_type === 'deterministic.hash') {
      output = { sha256: await sha256(job.payload.value ?? job.payload) };
    } else if (job.job_type === 'deterministic.json-parse') {
      const text = String(job.payload.text ?? '');
      try { output = { value: JSON.parse(text) }; }
      catch (error) { throw new AdapterError(`Invalid JSON: ${error.message}`, { code: 'INVALID_JSON' }); }
    } else if (job.job_type === 'deterministic.canonicalize-url') {
      output = { url: canonicalizeUrl(job.payload.url) };
    } else if (job.job_type === 'deterministic.normalize-text') {
      output = { text: normalizeText(job.payload.text) };
    } else {
      throw new AdapterError(`Unsupported deterministic job type: ${job.job_type}`, { code: 'UNSUPPORTED_JOB' });
    }
    return {
      ok: true,
      output,
      provenance: {
        source_urls: [],
        retrieved_at: new Date().toISOString(),
        transformation: job.job_type,
        adapter_id: this.adapter_id,
        adapter_version: this.adapter_version
      }
    };
  }
}

export const deterministicInternals = { normalizeText, canonicalizeUrl };
