const JSON_FIELDS = [
  'capability_types',
  'approved_data_classes',
  'prohibited_data_classes',
  'supported_job_types',
  'fallback_resource_ids',
  'allowed_hosts',
  'metadata'
];

const BOOLEAN_FIELDS = [
  'approved_for_automation',
  'quota_verified',
  'quota_unlimited',
  'billing_enabled',
  'payment_method_present',
  'enabled',
  'manual_approval_required'
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function fromRow(row = {}) {
  const resource = { ...row };
  for (const field of JSON_FIELDS) {
    const key = `${field}_json`;
    if (key in resource) {
      try { resource[field] = JSON.parse(resource[key] || (field === 'metadata' ? '{}' : '[]')); } catch { resource[field] = field === 'metadata' ? {} : []; }
      delete resource[key];
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (field in resource) resource[field] = Boolean(resource[field]);
  }
  return resource;
}

export class ResourceRegistry {
  constructor(resources = []) {
    this.resources = new Map();
    for (const resource of resources) this.register(resource);
  }

  register(resource) {
    if (!resource?.resource_id) throw new TypeError('resource_id is required');
    const normalized = clone(resource);
    for (const field of JSON_FIELDS) {
      if (field === 'metadata') normalized[field] = normalized[field] && typeof normalized[field] === 'object' && !Array.isArray(normalized[field]) ? normalized[field] : {};
      else normalized[field] = Array.isArray(normalized[field]) ? normalized[field] : [];
    }
    this.resources.set(normalized.resource_id, normalized);
    return clone(normalized);
  }

  async get(resourceId) { return clone(this.resources.get(resourceId) || null); }
  async list() { return [...this.resources.values()].map(clone); }

  async update(resourceId, patch = {}) {
    const current = this.resources.get(resourceId);
    if (!current) return null;
    const next = { ...current, ...clone(patch), updated_at: patch.updated_at || new Date().toISOString() };
    this.resources.set(resourceId, next);
    return clone(next);
  }

  async recordSuccess(resourceId, latencyMs, at = new Date().toISOString()) {
    const current = this.resources.get(resourceId);
    if (!current) return null;
    const previousRate = Number(current.success_rate ?? 1);
    const previousLatency = Number(current.average_latency || 0);
    return this.update(resourceId, {
      last_success: at, last_health_check: at, health_status: 'healthy', consecutive_failures: 0,
      reliability_score: Number((Number(current.reliability_score || 0) * 0.9 + 10).toFixed(4)),
      success_rate: Number((previousRate * 0.9 + 0.1).toFixed(6)), error_rate: Number(((1 - previousRate) * 0.9).toFixed(6)),
      average_latency: Number((previousLatency ? previousLatency * 0.8 + latencyMs * 0.2 : latencyMs).toFixed(2))
    });
  }

  async recordFailure(resourceId, error, at = new Date().toISOString(), cooldownMs = 0) {
    const current = this.resources.get(resourceId);
    if (!current) return null;
    const failures = Number(current.consecutive_failures || 0) + 1;
    const previousRate = Number(current.success_rate ?? 1);
    return this.update(resourceId, {
      last_failure: at, last_health_check: at, last_error: String(error || '').slice(0, 500),
      health_status: failures >= 3 ? 'cooldown' : 'degraded', consecutive_failures: failures,
      reliability_score: Number((Number(current.reliability_score || 0) * 0.9).toFixed(4)),
      success_rate: Number((previousRate * 0.9).toFixed(6)), error_rate: Number((1 - previousRate * 0.9).toFixed(6)),
      cooldown_until: cooldownMs > 0 ? new Date(Date.parse(at) + cooldownMs).toISOString() : current.cooldown_until || null
    });
  }
}

export class D1ResourceRegistry {
  constructor(database) {
    if (!database?.prepare) throw new TypeError('A D1 database binding is required');
    this.database = database;
  }

  async get(resourceId) {
    const row = await this.database.prepare('SELECT * FROM ai_resources WHERE resource_id=? LIMIT 1').bind(resourceId).first();
    return row ? fromRow(row) : null;
  }

  async list() {
    const result = await this.database.prepare('SELECT * FROM ai_resources ORDER BY resource_tier, resource_id').all();
    return (result?.results || []).map(fromRow);
  }

  async upsert(resource) {
    const arrays = Object.fromEntries(JSON_FIELDS.map(field => [field, JSON.stringify(field === 'metadata' ? (resource[field] || {}) : (resource[field] || []))]));
    await this.database.prepare(`INSERT INTO ai_resources (
      resource_id,provider_name,service_name,capability_types_json,resource_tier,official_documentation_url,terms_url,privacy_url,status_url,licence,account_owner,
      authentication_type,credential_reference,approved_for_automation,approved_data_classes_json,prohibited_data_classes_json,free_quota_amount,free_quota_unit,
      quota_reset_period,quota_reset_time,quota_remaining,quota_reserved,hard_stop_threshold,quota_verified,quota_unlimited,billing_enabled,billing_risk,
      payment_method_present,monetary_cost_per_unit_eur,quality_score,reliability_score,latency_score,privacy_score,provenance_score,quota_efficiency_score,
      last_health_check,health_status,last_terms_check,terms_revalidation_due,last_quota_check,last_success,last_failure,consecutive_failures,cooldown_until,
      average_latency,success_rate,error_rate,supported_job_types_json,maximum_payload,rate_limit,concurrency_limit,fallback_resource_ids_json,
      implementation_status,adapter_id,adapter_version,enabled,manual_approval_required,allowed_hosts_json,metadata_json,notes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(resource_id) DO UPDATE SET
      provider_name=excluded.provider_name,service_name=excluded.service_name,capability_types_json=excluded.capability_types_json,resource_tier=excluded.resource_tier,
      official_documentation_url=excluded.official_documentation_url,terms_url=excluded.terms_url,privacy_url=excluded.privacy_url,status_url=excluded.status_url,
      licence=excluded.licence,account_owner=excluded.account_owner,authentication_type=excluded.authentication_type,credential_reference=excluded.credential_reference,
      approved_for_automation=excluded.approved_for_automation,approved_data_classes_json=excluded.approved_data_classes_json,prohibited_data_classes_json=excluded.prohibited_data_classes_json,
      free_quota_amount=excluded.free_quota_amount,free_quota_unit=excluded.free_quota_unit,quota_reset_period=excluded.quota_reset_period,quota_reset_time=excluded.quota_reset_time,
      quota_remaining=excluded.quota_remaining,quota_reserved=excluded.quota_reserved,hard_stop_threshold=excluded.hard_stop_threshold,quota_verified=excluded.quota_verified,
      quota_unlimited=excluded.quota_unlimited,billing_enabled=excluded.billing_enabled,billing_risk=excluded.billing_risk,payment_method_present=excluded.payment_method_present,
      monetary_cost_per_unit_eur=excluded.monetary_cost_per_unit_eur,quality_score=excluded.quality_score,reliability_score=excluded.reliability_score,
      latency_score=excluded.latency_score,privacy_score=excluded.privacy_score,provenance_score=excluded.provenance_score,quota_efficiency_score=excluded.quota_efficiency_score,
      last_health_check=excluded.last_health_check,health_status=excluded.health_status,last_terms_check=excluded.last_terms_check,terms_revalidation_due=excluded.terms_revalidation_due,
      last_quota_check=excluded.last_quota_check,last_success=excluded.last_success,last_failure=excluded.last_failure,consecutive_failures=excluded.consecutive_failures,
      cooldown_until=excluded.cooldown_until,average_latency=excluded.average_latency,success_rate=excluded.success_rate,error_rate=excluded.error_rate,
      supported_job_types_json=excluded.supported_job_types_json,maximum_payload=excluded.maximum_payload,rate_limit=excluded.rate_limit,concurrency_limit=excluded.concurrency_limit,
      fallback_resource_ids_json=excluded.fallback_resource_ids_json,implementation_status=excluded.implementation_status,adapter_id=excluded.adapter_id,
      adapter_version=excluded.adapter_version,enabled=excluded.enabled,manual_approval_required=excluded.manual_approval_required,allowed_hosts_json=excluded.allowed_hosts_json,
      metadata_json=excluded.metadata_json,notes=excluded.notes,updated_at=excluded.updated_at`).bind(
      resource.resource_id,resource.provider_name || null,resource.service_name || null,arrays.capability_types,Number(resource.resource_tier || 0),resource.official_documentation_url || null,resource.terms_url || null,
      resource.privacy_url || null,resource.status_url || null,resource.licence || null,resource.account_owner || null,resource.authentication_type || 'none',resource.credential_reference || null,
      resource.approved_for_automation ? 1 : 0,arrays.approved_data_classes,arrays.prohibited_data_classes,resource.free_quota_amount ?? null,resource.free_quota_unit || null,
      resource.quota_reset_period || null,resource.quota_reset_time || null,resource.quota_remaining ?? null,resource.quota_reserved || 0,resource.hard_stop_threshold || 0,
      resource.quota_verified ? 1 : 0,resource.quota_unlimited ? 1 : 0,0,resource.billing_risk || 'unknown',0,0,resource.quality_score || 0,resource.reliability_score || 0,
      resource.latency_score || 0,resource.privacy_score || 0,resource.provenance_score || 0,resource.quota_efficiency_score || 0,resource.last_health_check || null,
      resource.health_status || 'unknown',resource.last_terms_check || null,resource.terms_revalidation_due || null,resource.last_quota_check || null,resource.last_success || null,
      resource.last_failure || null,resource.consecutive_failures || 0,resource.cooldown_until || null,resource.average_latency || 0,resource.success_rate ?? 1,resource.error_rate || 0,
      arrays.supported_job_types,resource.maximum_payload || 0,resource.rate_limit || null,resource.concurrency_limit || 1,arrays.fallback_resource_ids,resource.implementation_status || 'disabled',
      resource.adapter_id || null,resource.adapter_version || '1.0.0',resource.enabled ? 1 : 0,resource.manual_approval_required ? 1 : 0,arrays.allowed_hosts,arrays.metadata,
      resource.notes || null,resource.created_at || new Date().toISOString(),resource.updated_at || new Date().toISOString()
    ).run();
    return this.get(resource.resource_id);
  }

  async recordSuccess(resourceId, latencyMs, at = new Date().toISOString()) {
    await this.database.prepare(`UPDATE ai_resources SET last_success=?, last_health_check=?, health_status='healthy', consecutive_failures=0,
      reliability_score=MIN(100, reliability_score*0.9+10),
      success_rate=MIN(1, success_rate*0.9+0.1), error_rate=MAX(0, error_rate*0.9),
      average_latency=CASE WHEN average_latency=0 THEN ? ELSE average_latency*0.8+?*0.2 END,
      cooldown_until=NULL, updated_at=? WHERE resource_id=?`).bind(at, at, latencyMs, latencyMs, at, resourceId).run();
    return this.get(resourceId);
  }

  async recordFailure(resourceId, error, at = new Date().toISOString(), cooldownMs = 0) {
    const cooldown = cooldownMs > 0 ? new Date(Date.parse(at) + cooldownMs).toISOString() : null;
    await this.database.prepare(`UPDATE ai_resources SET last_failure=?, last_health_check=?,
      health_status=CASE WHEN consecutive_failures+1>=3 THEN 'cooldown' ELSE 'degraded' END,
      reliability_score=MAX(0, reliability_score*0.9),
      consecutive_failures=consecutive_failures+1,success_rate=MAX(0, success_rate*0.9),error_rate=MIN(1, 1-success_rate*0.9),
      cooldown_until=CASE WHEN consecutive_failures+1>=3 THEN ? ELSE cooldown_until END,
      notes=SUBSTR(COALESCE(notes,'') || ' | last error: ' || ?, 1, 2000), updated_at=? WHERE resource_id=?`)
      .bind(at, at, cooldown, String(error || '').slice(0, 500), at, resourceId).run();
    return this.get(resourceId);
  }
}

export function createLocalResource(now = new Date().toISOString()) {
  return {
    resource_id: 'local-deterministic-v1', provider_name: 'Matrix Reprogrammed', service_name: 'Deterministic local code', capability_types: ['deterministic'], resource_tier: 0,
    official_documentation_url: null, terms_url: null, privacy_url: null, status_url: null, licence: 'repository licence', account_owner: 'owner-controlled local machine',
    authentication_type: 'none', credential_reference: null, approved_for_automation: true, approved_data_classes: ['public', 'internal', 'confidential', 'restricted'], prohibited_data_classes: [],
    free_quota_amount: null, free_quota_unit: 'local operation', quota_reset_period: null, quota_reset_time: null, quota_remaining: null, quota_reserved: 0, hard_stop_threshold: 0,
    quota_verified: true, quota_unlimited: true, billing_enabled: false, billing_risk: 'none', payment_method_present: false, monetary_cost_per_unit_eur: 0,
    quality_score: 100, reliability_score: 100, latency_score: 100, privacy_score: 100, provenance_score: 100, quota_efficiency_score: 100,
    last_health_check: now, health_status: 'healthy', last_terms_check: now, terms_revalidation_due: null, last_quota_check: now, last_success: null, last_failure: null,
    consecutive_failures: 0, cooldown_until: null, average_latency: 0, success_rate: 1, error_rate: 0,
    supported_job_types: ['deterministic.hash', 'deterministic.json-parse', 'deterministic.canonicalize-url', 'deterministic.normalize-text'], maximum_payload: 8388608,
    rate_limit: 'local machine pressure', concurrency_limit: 8, fallback_resource_ids: [], implementation_status: 'production', adapter_id: 'deterministic-local', adapter_version: '1.0.0',
    enabled: true, manual_approval_required: false, allowed_hosts: [], metadata: { local: true, deterministic: true }, notes: 'Tier 0 local code path.', created_at: now, updated_at: now
  };
}

export const registryInternals = { fromRow, JSON_FIELDS, BOOLEAN_FIELDS };
