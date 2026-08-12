PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_agent_missions (
  mission_id TEXT PRIMARY KEY,
  specialist TEXT NOT NULL CHECK (specialist IN ('mission_director','investigator','auditor','publisher','growth','resource_hunter','architect')),
  objective TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('proposed','queued','running','blocked','completed','failed','rejected','cancelled')),
  execution_mode TEXT NOT NULL DEFAULT 'plan_or_draft_only' CHECK (execution_mode='plan_or_draft_only'),
  owner_approval_required INTEGER NOT NULL DEFAULT 1 CHECK (owner_approval_required=1),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matrix_agent_missions_queue
  ON matrix_agent_missions(status, priority, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_matrix_agent_missions_specialist
  ON matrix_agent_missions(specialist, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_agent_runs (
  run_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  specialist TEXT NOT NULL CHECK (specialist IN ('mission_director','investigator','auditor','publisher','growth','resource_hunter','architect')),
  model_id TEXT,
  resource_id TEXT,
  input_evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  output_evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  cost_eur REAL NOT NULL DEFAULT 0 CHECK (cost_eur >= 0),
  external_consequence INTEGER NOT NULL DEFAULT 0 CHECK (external_consequence=0),
  policy_bypass_used INTEGER NOT NULL DEFAULT 0 CHECK (policy_bypass_used=0),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed','blocked')),
  FOREIGN KEY(mission_id) REFERENCES matrix_agent_missions(mission_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_agent_runs_mission
  ON matrix_agent_runs(mission_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_matrix_agent_runs_specialist
  ON matrix_agent_runs(specialist, started_at DESC);

CREATE TABLE IF NOT EXISTS matrix_agent_handoffs (
  handoff_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  from_specialist TEXT NOT NULL CHECK (from_specialist IN ('mission_director','investigator','auditor','publisher','growth','resource_hunter','architect')),
  to_specialist TEXT NOT NULL CHECK (to_specialist IN ('mission_director','investigator','auditor','publisher','growth','resource_hunter','architect')),
  condition_name TEXT NOT NULL,
  mandatory INTEGER NOT NULL DEFAULT 1 CHECK (mandatory=1),
  gate_passed INTEGER NOT NULL DEFAULT 0 CHECK (gate_passed IN (0,1)),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(mission_id) REFERENCES matrix_agent_missions(mission_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_agent_handoffs_pending
  ON matrix_agent_handoffs(to_specialist, gate_passed, created_at ASC);

INSERT OR IGNORE INTO ai_feature_flags(flag_name, enabled, value_json, reason, updated_by, updated_at) VALUES
  ('MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED', 0, '{"shared_memory":true,"shared_evidence_graph":true,"auditor_before_publisher":true,"external_execution":false,"owner_approval_required":true}', 'Seven specialist AIs may plan and hand off bounded work through a shared spine. External consequences, spending, contract acceptance and production deployment remain disabled.', 'migration', CURRENT_TIMESTAMP);
