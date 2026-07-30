import { sha256 } from '../core/jobs.mjs';

const SECRET_KEY = /(authorization|cookie|api[_-]?key|token|secret|password|credential|signature)/i;
const SECRET_QUERY = /^(api[_-]?key|access[_-]?token|token|secret|password|signature|sig)$/i;

function sanitizeUrl(value) {
  try {
    const url = new URL(String(value));
    for (const key of [...url.searchParams.keys()]) if (SECRET_QUERY.test(key)) url.searchParams.set(key, '[REDACTED]');
    url.username = '';
    url.password = '';
    return url.toString();
  } catch { return String(value).slice(0, 1000); }
}

export function redact(value, key = '') {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) return sanitizeUrl(value);
    return value.length > 4000 ? `${value.slice(0, 4000)}...` : value;
  }
  return value;
}

function actionId() {
  return `action-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export class StructuredAuditLogger {
  constructor({ sink, actor = 'matrix-runtime', agent = 'resource-broker', clock = () => new Date() } = {}) {
    this.records = [];
    this.sink = sink;
    this.actor = actor;
    this.agent = agent;
    this.clock = clock;
  }

  async emit(event = {}) {
    const record = redact({
      action_id: event.action_id || actionId(),
      job_id: event.job_id || null,
      parent_job_id: event.parent_job_id || null,
      actor: event.actor || this.actor,
      agent: event.agent || this.agent,
      resource_id: event.resource_id || null,
      resource_version: event.resource_version || null,
      model_id: event.model_id || null,
      model_version: event.model_version || null,
      prompt_template_version: event.prompt_template_version || null,
      input_hash: event.input_hash || null,
      output_hash: event.output_hash || null,
      source_urls: event.source_urls || [],
      source_timestamps: event.source_timestamps || [],
      decision_reason: event.decision_reason || null,
      candidate_resources: event.candidate_resources || [],
      excluded_resources: event.excluded_resources || [],
      selected_resource: event.selected_resource || null,
      utility_score: event.utility_score ?? null,
      quota_before: event.quota_before ?? null,
      quota_after: event.quota_after ?? null,
      latency: event.latency ?? null,
      cost_confirmed_zero: event.cost_confirmed_zero === true,
      validation_result: event.validation_result || null,
      publication_result: event.publication_result || 'not-requested',
      review_requirement: event.review_requirement || 'none',
      error: event.error ? String(event.error).slice(0, 1000) : null,
      created_at: event.created_at || this.clock().toISOString()
    });
    this.records.push(record);
    if (this.sink) await this.sink(record);
    return record;
  }

  async hashPayload(payload) {
    return sha256(redact(payload));
  }
}

export function createD1AuditSink(database) {
  if (!database?.prepare) throw new TypeError('A D1 database binding is required');
  return async record => database.prepare(`INSERT INTO ai_audit_log (
    action_id,job_id,parent_job_id,actor,agent,resource_id,resource_version,model_id,model_version,
    prompt_template_version,input_hash,output_hash,source_urls_json,source_timestamps_json,decision_reason,
    candidate_resources_json,excluded_resources_json,selected_resource,utility_score,quota_before,quota_after,
    latency,cost_confirmed_zero,validation_result,publication_result,review_requirement,error,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    record.action_id, record.job_id, record.parent_job_id, record.actor, record.agent, record.resource_id,
    record.resource_version, record.model_id, record.model_version, record.prompt_template_version,
    record.input_hash, record.output_hash, JSON.stringify(record.source_urls), JSON.stringify(record.source_timestamps),
    record.decision_reason, JSON.stringify(record.candidate_resources), JSON.stringify(record.excluded_resources),
    record.selected_resource, record.utility_score, record.quota_before, record.quota_after, record.latency,
    record.cost_confirmed_zero ? 1 : 0, record.validation_result, record.publication_result,
    record.review_requirement, record.error, record.created_at
  ).run();
}

export const loggerInternals = { sanitizeUrl, SECRET_KEY, SECRET_QUERY };
