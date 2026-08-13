PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_living_cycles (
  cycle_id TEXT PRIMARY KEY,
  cycle_date TEXT NOT NULL,
  trigger_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','completed_with_findings','failed')),
  high_water_event_id TEXT,
  phases_json TEXT NOT NULL DEFAULT '[]',
  report_json TEXT NOT NULL DEFAULT '{}',
  cost_confirmed_zero INTEGER NOT NULL DEFAULT 1 CHECK (cost_confirmed_zero = 1),
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matrix_living_cycles_recent
  ON matrix_living_cycles(started_at DESC, status);

CREATE TABLE IF NOT EXISTS matrix_event_dispatches (
  event_id TEXT NOT NULL,
  consumer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','processed','failed','quarantined')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  receipt_json TEXT NOT NULL DEFAULT '{}',
  error_text TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY(event_id, consumer_id),
  FOREIGN KEY(event_id) REFERENCES matrix_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_event_dispatches_status
  ON matrix_event_dispatches(consumer_id, status, started_at);

CREATE TABLE IF NOT EXISTS matrix_living_projections (
  projection_key TEXT PRIMARY KEY,
  projection_type TEXT NOT NULL CHECK (projection_type IN ('evidence','claim','dossier','forecast','page','what_changed')),
  subject_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  evidence_class TEXT NOT NULL CHECK (evidence_class IN ('VERIFIED','SPECULATION','SECURITY_QUARANTINE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  content_hash TEXT NOT NULL,
  previous_hash TEXT,
  content_json TEXT NOT NULL,
  public_visible INTEGER NOT NULL DEFAULT 0 CHECK (public_visible IN (0,1)),
  state TEXT NOT NULL CHECK (state IN ('active','stale','withdrawn','quarantined')),
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_event_id) REFERENCES matrix_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_living_projection_type
  ON matrix_living_projections(projection_type, state, public_visible, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_matrix_living_projection_subject
  ON matrix_living_projections(subject_id, projection_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_page_dependencies (
  page_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('event','evidence','claim','dossier','forecast','entity','relationship')),
  dependency_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(page_id, dependency_type, dependency_id),
  FOREIGN KEY(source_event_id) REFERENCES matrix_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_page_dependencies_source
  ON matrix_page_dependencies(source_event_id, page_id);

INSERT OR IGNORE INTO matrix_capabilities (
  capability_id,label,structural_checks_passed,dependencies_reachable,data_connected,evidence_ready,live_verification_passed,state,blocker,checked_at,evidence_json
) VALUES (
  'living-matrix-cycle','Living Matrix event projection cycle',1,1,1,1,0,'evidence_ready',NULL,CURRENT_TIMESTAMP,
  '{"basis":"phase14-schema-and-acceptance-test","publication_gate":"verified-and-explicitly-approved","live_verification":"pending"}'
);

UPDATE matrix_capabilities
SET structural_checks_passed=1, dependencies_reachable=1, data_connected=1, evidence_ready=1,
    state='evidence_ready', blocker=NULL, checked_at=CURRENT_TIMESTAMP,
    evidence_json='{"coverage":"event-to-projection-to-ask-matrix","scheduled":"daily","zero_spend_lock":true,"live_verification":"pending"}'
WHERE capability_id='daily-intelligence-refresh';
