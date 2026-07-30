PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_resources (
  resource_id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  capability_types_json TEXT NOT NULL,
  resource_tier INTEGER NOT NULL CHECK (resource_tier BETWEEN 0 AND 4),
  official_documentation_url TEXT,
  terms_url TEXT,
  privacy_url TEXT,
  status_url TEXT,
  licence TEXT,
  account_owner TEXT,
  authentication_type TEXT NOT NULL,
  credential_reference TEXT,
  approved_for_automation INTEGER NOT NULL DEFAULT 0 CHECK (approved_for_automation IN (0,1)),
  approved_data_classes_json TEXT NOT NULL,
  prohibited_data_classes_json TEXT NOT NULL,
  free_quota_amount REAL,
  free_quota_unit TEXT,
  quota_reset_period TEXT,
  quota_reset_time TEXT,
  quota_remaining REAL,
  quota_reserved REAL NOT NULL DEFAULT 0 CHECK (quota_reserved >= 0),
  hard_stop_threshold REAL NOT NULL DEFAULT 0 CHECK (hard_stop_threshold >= 0),
  quota_verified INTEGER NOT NULL DEFAULT 0 CHECK (quota_verified IN (0,1)),
  quota_unlimited INTEGER NOT NULL DEFAULT 0 CHECK (quota_unlimited IN (0,1)),
  billing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (billing_enabled = 0),
  billing_risk TEXT NOT NULL,
  payment_method_present INTEGER NOT NULL DEFAULT 0 CHECK (payment_method_present = 0),
  monetary_cost_per_unit_eur REAL NOT NULL DEFAULT 0 CHECK (monetary_cost_per_unit_eur = 0),
  quality_score REAL NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  reliability_score REAL NOT NULL CHECK (reliability_score BETWEEN 0 AND 100),
  latency_score REAL NOT NULL CHECK (latency_score BETWEEN 0 AND 100),
  privacy_score REAL NOT NULL CHECK (privacy_score BETWEEN 0 AND 100),
  provenance_score REAL NOT NULL CHECK (provenance_score BETWEEN 0 AND 100),
  quota_efficiency_score REAL NOT NULL CHECK (quota_efficiency_score BETWEEN 0 AND 100),
  last_health_check TEXT,
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy','degraded','unknown','unhealthy','cooldown')),
  last_terms_check TEXT,
  terms_revalidation_due TEXT,
  last_quota_check TEXT,
  last_success TEXT,
  last_failure TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  average_latency REAL NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 1,
  error_rate REAL NOT NULL DEFAULT 0,
  supported_job_types_json TEXT NOT NULL,
  maximum_payload INTEGER NOT NULL DEFAULT 0,
  rate_limit TEXT,
  concurrency_limit INTEGER NOT NULL DEFAULT 1,
  fallback_resource_ids_json TEXT NOT NULL DEFAULT '[]',
  implementation_status TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  manual_approval_required INTEGER NOT NULL DEFAULT 1 CHECK (manual_approval_required IN (0,1)),
  allowed_hosts_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_resources_eligibility
  ON ai_resources(enabled, approved_for_automation, implementation_status, resource_tier);

CREATE TABLE IF NOT EXISTS ai_jobs (
  job_id TEXT PRIMARY KEY,
  parent_job_id TEXT,
  objective_id TEXT,
  job_type TEXT NOT NULL,
  capability_type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4','P5')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public','internal','confidential','restricted')),
  payload_hash TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  deduplication_key TEXT NOT NULL,
  selected_resource_id TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(selected_resource_id) REFERENCES ai_resources(resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_queue ON ai_jobs(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_dedupe ON ai_jobs(deduplication_key, status);

CREATE TABLE IF NOT EXISTS ai_quota_reservations (
  reservation_id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('reserved','committed','released','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(resource_id) REFERENCES ai_resources(resource_id),
  FOREIGN KEY(job_id) REFERENCES ai_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_quota_reservations_active
  ON ai_quota_reservations(resource_id, status, expires_at);

CREATE TABLE IF NOT EXISTS ai_result_cache (
  task_signature TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  data_class TEXT NOT NULL,
  result_json TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(resource_id) REFERENCES ai_resources(resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_result_cache_expiry ON ai_result_cache(expires_at);

CREATE TABLE IF NOT EXISTS ai_audit_log (
  action_id TEXT PRIMARY KEY,
  job_id TEXT,
  parent_job_id TEXT,
  actor TEXT NOT NULL,
  agent TEXT NOT NULL,
  resource_id TEXT,
  resource_version TEXT,
  model_id TEXT,
  model_version TEXT,
  prompt_template_version TEXT,
  input_hash TEXT,
  output_hash TEXT,
  source_urls_json TEXT NOT NULL DEFAULT '[]',
  source_timestamps_json TEXT NOT NULL DEFAULT '[]',
  decision_reason TEXT,
  candidate_resources_json TEXT NOT NULL DEFAULT '[]',
  excluded_resources_json TEXT NOT NULL DEFAULT '[]',
  selected_resource TEXT,
  utility_score REAL,
  quota_before REAL,
  quota_after REAL,
  latency REAL,
  cost_confirmed_zero INTEGER NOT NULL DEFAULT 0 CHECK (cost_confirmed_zero IN (0,1)),
  validation_result TEXT,
  publication_result TEXT,
  review_requirement TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_job ON ai_audit_log(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_audit_resource ON ai_audit_log(resource_id, created_at);

CREATE TABLE IF NOT EXISTS ai_feature_flags (
  flag_name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  value_json TEXT,
  reason TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_feature_flags(flag_name, enabled, value_json, reason, updated_by, updated_at) VALUES
  ('AI_RESOURCE_BROKER_ENABLED', 0, NULL, 'D1 migration and owner verification required before Cloudflare runtime activation.', 'migration', CURRENT_TIMESTAMP),
  ('AI_RESOURCE_EXTERNAL_ENABLED', 0, NULL, 'External runtime resources start disabled.', 'migration', CURRENT_TIMESTAMP),
  ('AI_RESOURCE_LOCAL_ONLY', 1, NULL, 'Safe local-only default.', 'migration', CURRENT_TIMESTAMP),
  ('AI_RESOURCE_ZERO_SPEND_LOCK', 1, '{"cost_ceiling_eur":0}', 'Paid fallback is prohibited.', 'migration', CURRENT_TIMESTAMP),
  ('AI_RESOURCE_BACKGROUND_ENABLED', 0, NULL, 'Background work requires operational approval.', 'migration', CURRENT_TIMESTAMP),
  ('AI_RESOURCE_SCOUT_ENABLED', 0, NULL, 'Scout requires later sandbox and approval-queue rollout.', 'migration', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ai_resources (
  resource_id,provider_name,service_name,capability_types_json,resource_tier,licence,account_owner,
  authentication_type,approved_for_automation,approved_data_classes_json,prohibited_data_classes_json,
  quota_verified,quota_unlimited,billing_risk,quality_score,reliability_score,latency_score,privacy_score,
  provenance_score,quota_efficiency_score,last_health_check,health_status,last_terms_check,last_quota_check,
  supported_job_types_json,maximum_payload,rate_limit,concurrency_limit,implementation_status,adapter_id,
  adapter_version,enabled,manual_approval_required,allowed_hosts_json,notes,created_at,updated_at
) VALUES (
  'local-deterministic-v1','Matrix Reprogrammed','Deterministic local code','["deterministic"]',0,
  'repository licence','owner-controlled local machine','none',1,
  '["public","internal","confidential","restricted"]','[]',1,1,'none',100,100,100,100,100,100,
  CURRENT_TIMESTAMP,'healthy',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,
  '["deterministic.hash","deterministic.json-parse","deterministic.canonicalize-url","deterministic.normalize-text"]',
  8388608,'local machine pressure',8,'production','deterministic-local','1.0.0',1,0,'[]',
  'Tier 0 local code path; no model or network call.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO ai_resources (
  resource_id,provider_name,service_name,capability_types_json,resource_tier,official_documentation_url,
  terms_url,privacy_url,licence,authentication_type,approved_for_automation,approved_data_classes_json,
  prohibited_data_classes_json,free_quota_amount,free_quota_unit,quota_reset_period,quota_reset_time,
  quota_remaining,quota_reserved,hard_stop_threshold,quota_verified,quota_unlimited,billing_risk,
  quality_score,reliability_score,latency_score,privacy_score,provenance_score,quota_efficiency_score,
  last_health_check,health_status,last_terms_check,terms_revalidation_due,last_quota_check,supported_job_types_json,
  maximum_payload,rate_limit,concurrency_limit,implementation_status,adapter_id,adapter_version,enabled,
  manual_approval_required,allowed_hosts_json,notes,created_at,updated_at
) VALUES (
  'federal-register-public-api-v1','Office of the Federal Register / GPO','FederalRegister.gov public API',
  '["public_data","government_records"]',3,
  'https://www.federalregister.gov/developers/documentation/api/v1',
  'https://www.federalregister.gov/reader-aids/government-policy-and-ofr-procedures/about-this-site',
  'https://www.federalregister.gov/reader-aids/government-policy-and-ofr-procedures/privacy',
  'Federal Register material is reproducible under 1 CFR 2.6; verify the official edition for legal reliance.',
  'none',1,'["public"]','["internal","confidential","restricted"]',100,
  'operator-capped requests per UTC day','daily','00:00 UTC',100,0,10,1,0,'none',92,90,82,92,98,90,
  CURRENT_TIMESTAMP,'healthy',CURRENT_TIMESTAMP,'2026-08-29T00:00:00.000Z',CURRENT_TIMESTAMP,
  '["public-data.fetch"]',8388608,'100 requests/day operator safety ceiling',1,'production',
  'approved-public-source-http','1.0.0',1,0,'["www.federalregister.gov"]',
  'Public records only; API output is informational and the official edition remains authoritative.',
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);
