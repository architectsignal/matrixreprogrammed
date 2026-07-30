export class AdapterError extends Error {
  constructor(message, { code = 'ADAPTER_ERROR', retryable = false, details = {} } = {}) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function assertAdapter(adapter) {
  if (!adapter || typeof adapter.execute !== 'function') throw new TypeError('Adapter must implement execute(job, resource, context)');
  if (!adapter.adapter_id) throw new TypeError('Adapter must declare adapter_id');
  if (!adapter.adapter_version) throw new TypeError('Adapter must declare adapter_version');
  return adapter;
}

export function validateAdapterResult(result, { requiresProvenance = true, external = false } = {}) {
  const errors = [];
  if (!result || typeof result !== 'object') errors.push('result must be an object');
  if (result?.ok === false) errors.push('adapter returned ok=false');
  if (requiresProvenance && external) {
    if (!Array.isArray(result?.provenance?.source_urls) || !result.provenance.source_urls.length) errors.push('external result has no source URL');
    if (!result?.provenance?.retrieved_at) errors.push('external result has no retrieval timestamp');
    if (!result?.provenance?.adapter_id) errors.push('external result has no adapter identity');
  }
  return errors;
}
