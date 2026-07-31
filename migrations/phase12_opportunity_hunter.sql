PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_opportunities (
  opportunity_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('compute','inference_api','dataset','search_api','model','grant','credit_program')),
  provider_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  official_url TEXT NOT NULL UNIQUE,
  opportunity_json TEXT NOT NULL,
  evaluation_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  approval_state TEXT NOT NULL CHECK (approval_state IN ('approved-auto','awaiting-owner','quarantined','disabled')),
  approved_resource_id TEXT,
  owner_actions_json TEXT NOT NULL DEFAULT '[]',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  discovered_at TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(approved_resource_id) REFERENCES ai_resources(resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_opportunities_state
  ON ai_opportunities(approval_state, confidence DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_opportunity_hunter_runs (
  run_id TEXT PRIMARY KEY,
  discovery_source TEXT NOT NULL,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  approved_auto_count INTEGER NOT NULL DEFAULT 0,
  awaiting_owner_count INTEGER NOT NULL DEFAULT 0,
  quarantined_count INTEGER NOT NULL DEFAULT 0,
  zero_spend_lock INTEGER NOT NULL DEFAULT 1 CHECK (zero_spend_lock = 1),
  report_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed','completed-with-findings','failed','quarantined'))
);

CREATE INDEX IF NOT EXISTS idx_ai_opportunity_hunter_runs_recent
  ON ai_opportunity_hunter_runs(completed_at DESC);

INSERT OR IGNORE INTO ai_feature_flags(flag_name, enabled, value_json, reason, updated_by, updated_at) VALUES
  ('AI_OPPORTUNITY_HUNTER_ENABLED', 0, '{"zero_spend_only":true,"owner_gate_for_accounts":true}', 'Opportunity discovery starts disabled and cannot activate account, credential, grant, credit or payment-bearing resources without owner approval.', 'migration', CURRENT_TIMESTAMP);
