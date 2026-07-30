const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
const DATA_CLASSES = new Set(['public', 'internal', 'confidential', 'restricted']);

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function id(prefix = 'job') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function validateJob(job) {
  const errors = [];
  if (!job || typeof job !== 'object' || Array.isArray(job)) return ['job must be an object'];
  if (!/^[a-z0-9][a-z0-9._-]{1,119}$/.test(String(job.job_type || ''))) errors.push('job_type is invalid');
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(String(job.capability_type || ''))) errors.push('capability_type is invalid');
  if (!PRIORITIES.has(job.priority)) errors.push('priority must be P0-P5');
  if (!DATA_CLASSES.has(job.data_class)) errors.push('data_class is invalid');
  if (!job.payload || typeof job.payload !== 'object' || Array.isArray(job.payload)) errors.push('payload must be an object');
  if (!job.requirements || job.requirements.cost_ceiling_eur !== 0) errors.push('cost_ceiling_eur must be exactly 0');
  if (!job.idempotency_key || String(job.idempotency_key).length < 8) errors.push('idempotency_key is required');
  if (!job.deduplication_key || String(job.deduplication_key).length < 8) errors.push('deduplication_key is required');
  return errors;
}

export async function createJob(input = {}, clock = () => new Date()) {
  const createdAt = input.created_at || clock().toISOString();
  const signatureInput = {
    job_type: input.job_type,
    capability_type: input.capability_type,
    data_class: input.data_class || 'public',
    payload: input.payload || {}
  };
  const signature = await sha256(signatureInput);
  const job = {
    job_id: input.job_id || id('job'),
    parent_job_id: input.parent_job_id || null,
    objective_id: input.objective_id || null,
    job_type: String(input.job_type || ''),
    capability_type: String(input.capability_type || ''),
    priority: input.priority || 'P3',
    data_class: input.data_class || 'public',
    payload: input.payload || {},
    requirements: {
      cost_ceiling_eur: 0,
      minimum_quality_score: Number(input.requirements?.minimum_quality_score ?? 0),
      minimum_provenance_score: Number(input.requirements?.minimum_provenance_score ?? 0),
      maximum_latency_ms: Number(input.requirements?.maximum_latency_ms ?? 25000),
      maximum_attempts: Math.max(1, Math.min(5, Number(input.requirements?.maximum_attempts ?? 2))),
      requires_provenance: input.requirements?.requires_provenance !== false,
      cacheable: input.requirements?.cacheable !== false,
      cache_ttl_seconds: Math.max(0, Number(input.requirements?.cache_ttl_seconds ?? 900))
    },
    idempotency_key: input.idempotency_key || `idem-${signature.slice(0, 48)}`,
    deduplication_key: input.deduplication_key || `dedupe-${signature.slice(0, 48)}`,
    status: input.status || 'queued',
    metadata: input.metadata || {},
    created_at: createdAt,
    deadline_at: input.deadline_at || null
  };
  const errors = validateJob(job);
  if (errors.length) throw new TypeError(`Invalid resource job: ${errors.join('; ')}`);
  return job;
}

export const jobConstants = {
  priorities: [...PRIORITIES],
  dataClasses: [...DATA_CLASSES]
};
