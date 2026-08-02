PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  origin TEXT NOT NULL,
  source TEXT,
  evidence_class TEXT NOT NULL CHECK (evidence_class IN ('VERIFIED','SPECULATION','SECURITY_QUARANTINE')),
  actor TEXT,
  affected_entities_json TEXT NOT NULL DEFAULT '[]',
  affected_pages_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  review_state TEXT NOT NULL CHECK (review_state IN ('automatically-verified','automatically-labelled-speculation','security-quarantined')),
  audit_identifier TEXT NOT NULL UNIQUE,
  propagation_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_matrix_events_recent ON matrix_events(timestamp DESC, event_type);
CREATE INDEX IF NOT EXISTS idx_matrix_events_evidence ON matrix_events(evidence_class, timestamp DESC);

CREATE TABLE IF NOT EXISTS matrix_missions (
  mission_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('locate_primary_source','verify_date_or_identifier','identify_correction','resolve_public_entity','transcribe_public_record','check_broken_source','document_contradiction','supply_accessible_summary')),
  evidence_requirements_json TEXT NOT NULL,
  source_scope_json TEXT NOT NULL DEFAULT '[]',
  base_points INTEGER NOT NULL DEFAULT 10 CHECK (base_points BETWEEN 0 AND 25),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','paused','completed','withdrawn')),
  minimum_tier TEXT NOT NULL DEFAULT 'registered',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_missions_open ON matrix_missions(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_contributions (
  contribution_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT,
  source_publisher TEXT,
  publication_date TEXT,
  retrieved_at TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  evidence_class TEXT NOT NULL CHECK (evidence_class IN ('VERIFIED','SPECULATION','SECURITY_QUARANTINE')),
  visible_label TEXT,
  missing_verification_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL CHECK (state IN ('received','classified','accepted','quarantined','invalidated')),
  conclusion_eligible INTEGER NOT NULL DEFAULT 0 CHECK (conclusion_eligible IN (0,1)),
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded BETWEEN 0 AND 25),
  audit_identifier TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(mission_id) REFERENCES matrix_missions(mission_id),
  FOREIGN KEY(member_id) REFERENCES members(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matrix_contribution_dedupe ON matrix_contributions(member_id, mission_id, content_sha256);
CREATE INDEX IF NOT EXISTS idx_matrix_contributions_member ON matrix_contributions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matrix_contributions_evidence ON matrix_contributions(evidence_class, state, created_at DESC);

CREATE TABLE IF NOT EXISTS matrix_impact_trail (
  impact_id TEXT PRIMARY KEY,
  contribution_id TEXT,
  member_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  affected_outputs_json TEXT NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL,
  evidence_class TEXT NOT NULL CHECK (evidence_class IN ('VERIFIED','SPECULATION','SECURITY_QUARANTINE')),
  audit_identifier TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(contribution_id) REFERENCES matrix_contributions(contribution_id),
  FOREIGN KEY(member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_impact_member ON matrix_impact_trail(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS matrix_rewards (
  reward_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  contribution_id TEXT,
  points_delta INTEGER NOT NULL CHECK (points_delta BETWEEN -25 AND 25),
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('granted','revoked')),
  audit_identifier TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(member_id) REFERENCES members(id),
  FOREIGN KEY(contribution_id) REFERENCES matrix_contributions(contribution_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_rewards_member ON matrix_rewards(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS matrix_human_actions (
  action_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('provider_account_creation','captcha','email_or_phone_verification','identity_check','oauth','licence_or_terms_acceptance','secret_entry','payment_approval','provider_permission_change','destructive_operation','legal_intervention','consequential_external_operation')),
  provider TEXT,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting','completed','declined','expired','cancelled')),
  safe_resume_token_hash TEXT,
  audit_identifier TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_human_actions_open ON matrix_human_actions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS matrix_models (
  model_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  version TEXT NOT NULL,
  licence TEXT NOT NULL,
  zero_cost_verified INTEGER NOT NULL DEFAULT 0 CHECK (zero_cost_verified IN (0,1)),
  external_charge_possible INTEGER NOT NULL DEFAULT 1 CHECK (external_charge_possible IN (0,1)),
  privacy_state TEXT NOT NULL CHECK (privacy_state IN ('passed','failed','unknown')),
  rollout_state TEXT NOT NULL CHECK (rollout_state IN ('candidate','quarantined','staged','active','rolled_back','disabled')),
  rollback_model_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_model_benchmarks (
  benchmark_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  quality_score REAL NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  hallucination_rate REAL NOT NULL CHECK (hallucination_rate BETWEEN 0 AND 100),
  citation_integrity_passed INTEGER NOT NULL CHECK (citation_integrity_passed IN (0,1)),
  privacy_passed INTEGER NOT NULL CHECK (privacy_passed IN (0,1)),
  cost_confirmed_zero INTEGER NOT NULL CHECK (cost_confirmed_zero IN (0,1)),
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(model_id) REFERENCES matrix_models(model_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_benchmarks_model ON matrix_model_benchmarks(model_id, created_at DESC);

CREATE TABLE IF NOT EXISTS matrix_capabilities (
  capability_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  structural_checks_passed INTEGER NOT NULL DEFAULT 0 CHECK (structural_checks_passed IN (0,1)),
  dependencies_reachable INTEGER NOT NULL DEFAULT 0 CHECK (dependencies_reachable IN (0,1)),
  data_connected INTEGER NOT NULL DEFAULT 0 CHECK (data_connected IN (0,1)),
  evidence_ready INTEGER NOT NULL DEFAULT 0 CHECK (evidence_ready IN (0,1)),
  live_verification_passed INTEGER NOT NULL DEFAULT 0 CHECK (live_verification_passed IN (0,1)),
  state TEXT NOT NULL CHECK (state IN ('structurally_operational','data_connected','evidence_ready','live_verified','blocked','awaiting_human_action','disabled','degraded','broken')),
  blocker TEXT,
  checked_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS matrix_learning_ledger (
  learning_id TEXT PRIMARY KEY,
  source_event_id TEXT,
  domain TEXT NOT NULL,
  observation TEXT NOT NULL,
  proposed_change TEXT,
  change_class TEXT NOT NULL CHECK (change_class IN ('A','B','C','D','E')),
  decision TEXT NOT NULL CHECK (decision IN ('recorded','staged','approved','rejected','quarantined','rolled_back')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  audit_identifier TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_event_id) REFERENCES matrix_events(event_id)
);

INSERT OR IGNORE INTO matrix_missions (
  mission_id,title,description,category,evidence_requirements_json,source_scope_json,base_points,status,minimum_tier,created_at,updated_at
) VALUES
  ('mission-primary-source','Locate a primary source','Find the original public record behind a currently sourced claim.','locate_primary_source','{"requires":["https_source","publisher","retrieval_time","sha256"],"automatic_speculation_when_incomplete":true}','["public-records"]',15,'open','registered',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('mission-source-correction','Identify a correction or withdrawal','Find a primary or authoritative correction that changes an indexed record.','identify_correction','{"requires":["corrected_record","correction_source","retrieval_time","sha256"],"reopen_conclusions":true}','["public-records","official-corrections"]',20,'open','registered',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('mission-broken-source','Check a broken source','Confirm whether an indexed public source moved, failed or was withdrawn.','check_broken_source','{"requires":["original_url","observed_status","retrieval_time"],"no_points_for_page_views":true}','["indexed-sources"]',10,'open','registered',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_capabilities (
  capability_id,label,structural_checks_passed,dependencies_reachable,data_connected,evidence_ready,live_verification_passed,state,blocker,checked_at,evidence_json
) VALUES
  ('matrix-event-bus','Matrix event bus',1,1,1,1,0,'evidence_ready',NULL,CURRENT_TIMESTAMP,'{"basis":"migration-and-contract-tests","live_verification":"pending"}'),
  ('member-evidence-missions','Member evidence missions',1,1,1,1,0,'evidence_ready',NULL,CURRENT_TIMESTAMP,'{"basis":"migration-and-contract-tests","live_verification":"pending"}'),
  ('model-improvement-gate','Model improvement gate',1,1,1,1,0,'evidence_ready',NULL,CURRENT_TIMESTAMP,'{"basis":"policy-and-benchmark-contract-tests","live_verification":"pending"}'),
  ('daily-intelligence-refresh','Daily intelligence refresh',1,0,0,0,0,'degraded',NULL,CURRENT_TIMESTAMP,'{"coverage":"partial","live_verification":"pending","limitation":"External source availability and a fresh scheduled-run receipt are required."}'),
  ('remote-compute-execution','Remote compute execution',1,0,0,0,0,'disabled','Disabled by default under the zero-spend and owner-onboarding gates.',CURRENT_TIMESTAMP,'{"public_only":true,"prompt_transfer_allowed":false}'),
  ('cloudflare-production-release','Cloudflare production release',1,1,1,1,0,'blocked','Current billing snapshot records billable Workers build minutes; zero-overage policy blocks deployment.',CURRENT_TIMESTAMP,'{"deployment_performed":false,"zero_spend_lock":true}');
