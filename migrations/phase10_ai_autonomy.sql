PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_resource_candidates (
  candidate_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  provider_name TEXT,
  service_name TEXT,
  discovery_method TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  evaluation_json TEXT,
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK (status IN ('discovered','evaluating','approved','quarantined','rejected')),
  approved_resource_id TEXT,
  discovered_at TEXT NOT NULL,
  evaluated_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(approved_resource_id) REFERENCES ai_resources(resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_resource_candidates_status
  ON ai_resource_candidates(status, confidence DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_local_runtime_nodes (
  node_id TEXT PRIMARY KEY,
  node_name TEXT NOT NULL,
  platform TEXT,
  architecture TEXT,
  hardware_json TEXT NOT NULL,
  server_inventory_json TEXT NOT NULL,
  model_count INTEGER NOT NULL DEFAULT 0,
  gpu_count INTEGER NOT NULL DEFAULT 0,
  total_gpu_memory_mb REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('online','stale','offline','quarantined')),
  cost_confirmed_zero INTEGER NOT NULL DEFAULT 1 CHECK (cost_confirmed_zero IN (0,1)),
  external_network_used INTEGER NOT NULL DEFAULT 0 CHECK (external_network_used IN (0,1)),
  registered_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_local_runtime_nodes_health
  ON ai_local_runtime_nodes(status, last_seen DESC);

CREATE TABLE IF NOT EXISTS ai_local_models (
  resource_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  protocol TEXT NOT NULL,
  endpoint_scope TEXT NOT NULL DEFAULT 'loopback-only',
  metadata_json TEXT NOT NULL,
  route_score REAL,
  status TEXT NOT NULL CHECK (status IN ('available','busy','stale','offline','quarantined')),
  last_seen TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(resource_id) REFERENCES ai_resources(resource_id),
  FOREIGN KEY(node_id) REFERENCES ai_local_runtime_nodes(node_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_local_models_route
  ON ai_local_models(status, route_score DESC, last_seen DESC);

CREATE TABLE IF NOT EXISTS ai_model_routing_decisions (
  decision_id TEXT PRIMARY KEY,
  task_profile TEXT NOT NULL,
  data_class TEXT NOT NULL CHECK (data_class IN ('public','internal','confidential','restricted')),
  prompt_tokens_estimate INTEGER NOT NULL CHECK (prompt_tokens_estimate > 0),
  requested_output_tokens INTEGER NOT NULL CHECK (requested_output_tokens > 0),
  selected_resource_id TEXT NOT NULL,
  candidates_json TEXT NOT NULL DEFAULT '[]',
  excluded_json TEXT NOT NULL DEFAULT '[]',
  cost_confirmed_zero INTEGER NOT NULL DEFAULT 1 CHECK (cost_confirmed_zero = 1),
  prompt_received INTEGER NOT NULL DEFAULT 0 CHECK (prompt_received = 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY(selected_resource_id) REFERENCES ai_resources(resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_model_routing_decisions_recent
  ON ai_model_routing_decisions(created_at DESC, selected_resource_id);

CREATE TABLE IF NOT EXISTS ai_site_improvement_runs (
  run_id TEXT PRIMARY KEY,
  node_id TEXT,
  scanned_pages INTEGER NOT NULL DEFAULT 0,
  files_with_findings INTEGER NOT NULL DEFAULT 0,
  total_issues INTEGER NOT NULL DEFAULT 0,
  safe_changes_applied INTEGER NOT NULL DEFAULT 0,
  prohibited_changes_attempted INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed','completed-with-findings','quarantined','failed')),
  generated_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY(node_id) REFERENCES ai_local_runtime_nodes(node_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_site_improvement_runs_recent
  ON ai_site_improvement_runs(generated_at DESC);

CREATE TABLE IF NOT EXISTS ai_site_improvement_actions (
  action_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  action_type TEXT NOT NULL,
  before_hash TEXT,
  after_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('applied-safe','recommended','blocked-protected','failed','rolled-back')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES ai_site_improvement_runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_site_improvement_actions_run
  ON ai_site_improvement_actions(run_id, status);

CREATE TABLE IF NOT EXISTS ai_compute_provider_candidates (
  provider_id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  access_method TEXT NOT NULL CHECK (access_method IN ('automatic_api','manual_onboarding','interactive_notebook','prohibited')),
  classification TEXT NOT NULL CHECK (classification IN ('automatic','manual_onboarding','quarantined','prohibited','expired')),
  official_documentation_url TEXT NOT NULL,
  terms_url TEXT NOT NULL,
  privacy_url TEXT NOT NULL,
  status_url TEXT,
  candidate_json TEXT NOT NULL,
  evaluation_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK (status IN ('discovered','approved','manual-onboarding','quarantined','prohibited','expired')),
  owner_action_required INTEGER NOT NULL DEFAULT 1 CHECK (owner_action_required IN (0,1)),
  discovered_at TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  terms_revalidation_due TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_compute_provider_candidates_status
  ON ai_compute_provider_candidates(status, confidence DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_compute_onboarding_tasks (
  task_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending-owner-action','ready-for-verification','completed','blocked','expired')),
  owner_action_required INTEGER NOT NULL DEFAULT 1 CHECK (owner_action_required IN (0,1)),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(provider_id) REFERENCES ai_compute_provider_candidates(provider_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_compute_onboarding_tasks_status
  ON ai_compute_onboarding_tasks(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_compute_resources (
  compute_resource_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  broker_resource_id TEXT NOT NULL UNIQUE,
  access_method TEXT NOT NULL CHECK (access_method='automatic_api'),
  endpoint_url TEXT NOT NULL,
  credential_reference TEXT NOT NULL,
  accelerator_json TEXT NOT NULL DEFAULT '[]',
  gpu_memory_mb REAL NOT NULL DEFAULT 0,
  quota_total REAL NOT NULL CHECK (quota_total>0),
  quota_remaining REAL NOT NULL CHECK (quota_remaining>=0),
  quota_unit TEXT NOT NULL,
  session_max_minutes INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  terms_revalidation_due TEXT,
  availability_status TEXT NOT NULL CHECK (availability_status IN ('available','reserved','busy','expired','exhausted','offline','quarantined')),
  billing_hard_stop_confirmed INTEGER NOT NULL DEFAULT 1 CHECK (billing_hard_stop_confirmed=1),
  automation_permission_verified INTEGER NOT NULL DEFAULT 1 CHECK (automation_permission_verified=1),
  owner_onboarding_completed INTEGER NOT NULL DEFAULT 1 CHECK (owner_onboarding_completed=1),
  last_verified TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(provider_id) REFERENCES ai_compute_provider_candidates(provider_id),
  FOREIGN KEY(broker_resource_id) REFERENCES ai_resources(resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_compute_resources_availability
  ON ai_compute_resources(availability_status, quota_remaining DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_compute_leases (
  lease_id TEXT PRIMARY KEY,
  compute_resource_id TEXT NOT NULL,
  task_profile TEXT NOT NULL,
  data_class TEXT NOT NULL DEFAULT 'public' CHECK (data_class='public'),
  estimated_minutes REAL NOT NULL CHECK (estimated_minutes>0),
  reserved_units REAL NOT NULL CHECK (reserved_units>0),
  status TEXT NOT NULL CHECK (status IN ('reserved','active','completed','released','expired','quarantined')),
  created_at TEXT NOT NULL,
  starts_at TEXT,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  FOREIGN KEY(compute_resource_id) REFERENCES ai_compute_resources(compute_resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_compute_leases_active
  ON ai_compute_leases(status, expires_at, compute_resource_id);

INSERT OR IGNORE INTO ai_feature_flags(flag_name, enabled, value_json, reason, updated_by, updated_at) VALUES
  ('AI_LOCAL_MODEL_ROUTING_ENABLED', 0, '{"endpoint_scope":"loopback-only","prompt_transfer":false}', 'Local node inventory and metadata-only routing require an owner-controlled local agent.', 'migration', CURRENT_TIMESTAMP),
  ('AI_SITE_DIRECTOR_ENABLED', 0, '{"safe_fix_limit":25}', 'Autonomous site changes are restricted to the safe allowlist and protected paths remain immutable.', 'migration', CURRENT_TIMESTAMP),
  ('AI_RESOURCE_AUTO_APPROVAL_ENABLED', 0, '{"minimum_confidence":95}', 'Automatic approval remains fail-closed and requires every zero-spend, quota, terms, privacy, HTTPS, health and provenance gate.', 'migration', CURRENT_TIMESTAMP),
  ('AI_COMPUTE_RESOURCE_SCOUT_ENABLED', 0, '{"public_data_only":true,"automatic_api_only":true,"minimum_confidence":95}', 'Remote compute discovery is fail-closed; interactive services require owner onboarding and billing ambiguity is quarantined.', 'migration', CURRENT_TIMESTAMP),
  ('AI_REMOTE_COMPUTE_ROUTING_ENABLED', 0, '{"prompt_transfer":false,"public_data_only":true,"temporary_leases":true}', 'Remote compute is registered only as temporary zero-spend capacity after explicit automation, quota and hard-stop proof.', 'migration', CURRENT_TIMESTAMP);
