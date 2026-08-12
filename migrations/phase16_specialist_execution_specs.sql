PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_agent_execution_specs (
  spec_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  specialist TEXT NOT NULL CHECK (specialist IN ('mission_director','investigator','auditor','publisher','growth','resource_hunter','architect')),
  task_profile TEXT NOT NULL CHECK (task_profile IN ('speed','reasoning','long-context','coding')),
  fallback_task_profile TEXT CHECK (fallback_task_profile IS NULL OR fallback_task_profile IN ('speed','reasoning','long-context','coding')),
  context_policy TEXT NOT NULL CHECK (context_policy IN ('reference_ids_only','aggregate_metrics_only','public_metadata_only')),
  evidence_reference_ids_json TEXT NOT NULL DEFAULT '[]',
  artifact_reference_ids_json TEXT NOT NULL DEFAULT '[]',
  auditor_clearance_ids_json TEXT NOT NULL DEFAULT '[]',
  prompt_tokens_estimate INTEGER NOT NULL DEFAULT 1 CHECK (prompt_tokens_estimate BETWEEN 1 AND 2000000),
  maximum_output_tokens INTEGER NOT NULL DEFAULT 1200 CHECK (maximum_output_tokens BETWEEN 1 AND 131072),
  prompt_material_in_cloud_payload INTEGER NOT NULL DEFAULT 0 CHECK (prompt_material_in_cloud_payload=0),
  local_prompt_resolution_required INTEGER NOT NULL DEFAULT 1 CHECK (local_prompt_resolution_required=1),
  cost_ceiling_eur REAL NOT NULL DEFAULT 0 CHECK (cost_ceiling_eur=0),
  paid_fallback_allowed INTEGER NOT NULL DEFAULT 0 CHECK (paid_fallback_allowed=0),
  external_network_inference_allowed INTEGER NOT NULL DEFAULT 0 CHECK (external_network_inference_allowed=0),
  evidence_gate_bypass_allowed INTEGER NOT NULL DEFAULT 0 CHECK (evidence_gate_bypass_allowed=0),
  production_deployment_allowed INTEGER NOT NULL DEFAULT 0 CHECK (production_deployment_allowed=0),
  status TEXT NOT NULL CHECK (status IN ('planned','routed','blocked','completed','failed','cancelled')),
  block_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(mission_id) REFERENCES matrix_agent_missions(mission_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_agent_execution_specs_mission
  ON matrix_agent_execution_specs(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matrix_agent_execution_specs_route
  ON matrix_agent_execution_specs(status, task_profile, created_at ASC);

INSERT OR IGNORE INTO ai_feature_flags(flag_name, enabled, value_json, reason, updated_by, updated_at) VALUES
  ('MATRIX_SPECIALIST_LOCAL_EXECUTION_PLANNING_ENABLED', 0, '{"local_controller_required":true,"cloud_prompt_material":false,"paid_fallback":false,"external_network_inference":false,"production_deployment":false}', 'Specialist execution specifications may select a local model profile and preserve evidence references. Full prompts must be compiled on the owner-controlled local machine.', 'migration', CURRENT_TIMESTAMP);
