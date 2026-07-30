PRAGMA foreign_keys = ON;

ALTER TABLE ai_resources ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

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

INSERT OR IGNORE INTO ai_feature_flags(flag_name, enabled, value_json, reason, updated_by, updated_at) VALUES
  ('AI_LOCAL_MODEL_ROUTING_ENABLED', 0, '{"endpoint_scope":"loopback-only"}', 'Local node inventory and routing require an owner-controlled local agent.', 'migration', CURRENT_TIMESTAMP),
  ('AI_SITE_DIRECTOR_ENABLED', 0, '{"safe_fix_limit":25}', 'Autonomous site changes are restricted to the safe allowlist and protected paths remain immutable.', 'migration', CURRENT_TIMESTAMP),
  ('AI_RESOURCE_AUTO_APPROVAL_ENABLED', 0, '{"minimum_confidence":95}', 'Automatic approval remains fail-closed and requires every zero-spend, quota, terms, privacy, HTTPS, health and provenance gate.', 'migration', CURRENT_TIMESTAMP);
