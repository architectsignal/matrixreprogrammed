PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_local_jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('deterministic.hash','llm.generate')),
  payload_json TEXT NOT NULL,
  requirements_json TEXT NOT NULL DEFAULT '{}',
  data_class TEXT NOT NULL CHECK (data_class IN ('public','internal','confidential','restricted')),
  priority TEXT NOT NULL DEFAULT 'P3' CHECK (priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('queued','leased','completed','failed','cancelled','quarantined')),
  assigned_node_id TEXT,
  lease_token_hash TEXT,
  lease_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  maximum_attempts INTEGER NOT NULL DEFAULT 3,
  result_json TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(assigned_node_id) REFERENCES ai_local_runtime_nodes(node_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_local_jobs_dispatch
  ON ai_local_jobs(status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_local_jobs_node
  ON ai_local_jobs(assigned_node_id, status, lease_expires_at);

CREATE TABLE IF NOT EXISTS ai_local_job_receipts (
  receipt_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('leased','completed','failed','expired','requeued')),
  payload_hash TEXT NOT NULL,
  result_hash TEXT,
  cost_confirmed_zero INTEGER NOT NULL DEFAULT 1 CHECK (cost_confirmed_zero = 1),
  external_network_used INTEGER NOT NULL DEFAULT 0 CHECK (external_network_used = 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES ai_local_jobs(job_id),
  FOREIGN KEY(node_id) REFERENCES ai_local_runtime_nodes(node_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_local_job_receipts_job
  ON ai_local_job_receipts(job_id, created_at DESC);
