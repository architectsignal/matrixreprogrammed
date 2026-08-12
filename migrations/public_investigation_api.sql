PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_public_investigations (
  investigation_id TEXT PRIMARY KEY,
  question_hash TEXT NOT NULL,
  question TEXT NOT NULL,
  normalized_question TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'standard' CHECK (mode IN ('fast','standard','deep')),
  status TEXT NOT NULL CHECK (status IN ('queued','retrieving','analysing','verifying','complete','blocked','failed')),
  query_classification_json TEXT NOT NULL DEFAULT '{}',
  answer_json TEXT,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  source_routes_json TEXT NOT NULL DEFAULT '[]',
  related_entities_json TEXT NOT NULL DEFAULT '[]',
  local_job_id TEXT,
  model_id TEXT,
  resource_id TEXT,
  prompt_version TEXT NOT NULL,
  fallback_used INTEGER NOT NULL DEFAULT 1 CHECK (fallback_used IN (0,1)),
  synthesis_pending INTEGER NOT NULL DEFAULT 0 CHECK (synthesis_pending IN (0,1)),
  validation_json TEXT NOT NULL DEFAULT '{}',
  state_history_json TEXT NOT NULL DEFAULT '[]',
  retrieval_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (retrieval_latency_ms >= 0),
  model_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (model_latency_ms >= 0),
  verification_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (verification_latency_ms >= 0),
  total_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (total_latency_ms >= 0),
  error_type TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matrix_public_investigations_recent
  ON matrix_public_investigations(created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_matrix_public_investigations_question
  ON matrix_public_investigations(question_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_matrix_public_investigations_local_job
  ON matrix_public_investigations(local_job_id, synthesis_pending);

CREATE TABLE IF NOT EXISTS matrix_public_investigation_evidence (
  investigation_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 100),
  retrieval_score REAL NOT NULL DEFAULT 0,
  source_route TEXT NOT NULL,
  evidence_snapshot_json TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  PRIMARY KEY(investigation_id, evidence_id),
  FOREIGN KEY(investigation_id) REFERENCES matrix_public_investigations(investigation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_matrix_public_investigation_evidence_rank
  ON matrix_public_investigation_evidence(investigation_id, rank);

CREATE TABLE IF NOT EXISTS matrix_public_investigation_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  window_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_public_investigation_rate_limits_updated
  ON matrix_public_investigation_rate_limits(updated_at);
