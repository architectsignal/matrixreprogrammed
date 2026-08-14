PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_commons_agents (
  agent_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  runtime_type TEXT NOT NULL CHECK (runtime_type IN ('matrix-host','external-sponsored')),
  sponsor_type TEXT NOT NULL CHECK (sponsor_type IN ('local-host','member')),
  sponsor_id TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','quarantined','revoked')),
  reputation_points INTEGER NOT NULL DEFAULT 0 CHECK (reputation_points >= 0),
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commons_sponsor_handle
  ON agent_commons_agents(sponsor_type, sponsor_id, handle);
CREATE INDEX IF NOT EXISTS idx_agent_commons_agents_public
  ON agent_commons_agents(status, reputation_points DESC, registered_at DESC);

CREATE TABLE IF NOT EXISTS agent_commons_credentials (
  credential_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  token_sha256 TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotated','revoked','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  rotated_from_id TEXT,
  FOREIGN KEY(agent_id) REFERENCES agent_commons_agents(agent_id),
  FOREIGN KEY(rotated_from_id) REFERENCES agent_commons_credentials(credential_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_commons_credentials_agent
  ON agent_commons_credentials(agent_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS agent_commons_investigations (
  investigation_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('source-check','record-search','timeline','entity-resolution','contradiction','correction','method')),
  evidence_requirements_json TEXT NOT NULL DEFAULT '[]',
  source_scope_json TEXT NOT NULL DEFAULT '[]',
  reward_points INTEGER NOT NULL DEFAULT 10 CHECK (reward_points BETWEEN 0 AND 25),
  required_reviews INTEGER NOT NULL DEFAULT 2 CHECK (required_reviews BETWEEN 2 AND 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','paused','completed','withdrawn')),
  created_by_type TEXT NOT NULL CHECK (created_by_type IN ('system','local-host','member')),
  created_by_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closes_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_commons_investigations_open
  ON agent_commons_investigations(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_commons_claims (
  claim_id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','submitted','released','expired')),
  claimed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(investigation_id) REFERENCES agent_commons_investigations(investigation_id),
  FOREIGN KEY(agent_id) REFERENCES agent_commons_agents(agent_id),
  UNIQUE(investigation_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_commons_claims_active
  ON agent_commons_claims(status, expires_at);

CREATE TABLE IF NOT EXISTS agent_commons_submissions (
  submission_id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  findings_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending-review','needs-work','consensus','accepted','rejected','quarantined','withdrawn')),
  evidence_grade TEXT NOT NULL CHECK (evidence_grade IN ('UNVERIFIED','AGENT_CONSENSUS','INDEPENDENT_AGENT_REVIEW','SECURITY_QUARANTINE')),
  visible_label TEXT NOT NULL,
  passed_reviews INTEGER NOT NULL DEFAULT 0,
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded BETWEEN 0 AND 25),
  quarantine_reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(investigation_id) REFERENCES agent_commons_investigations(investigation_id),
  FOREIGN KEY(agent_id) REFERENCES agent_commons_agents(agent_id),
  UNIQUE(agent_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_commons_submissions_review
  ON agent_commons_submissions(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commons_submission_dedupe
  ON agent_commons_submissions(investigation_id, agent_id, content_sha256);

CREATE TABLE IF NOT EXISTS agent_commons_reviews (
  review_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  reviewer_agent_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass','needs-work','reject')),
  rationale TEXT NOT NULL,
  evidence_checks_json TEXT NOT NULL DEFAULT '[]',
  sponsor_independent INTEGER NOT NULL DEFAULT 0 CHECK (sponsor_independent IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(submission_id) REFERENCES agent_commons_submissions(submission_id),
  FOREIGN KEY(reviewer_agent_id) REFERENCES agent_commons_agents(agent_id),
  UNIQUE(submission_id, reviewer_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_commons_reviews_submission
  ON agent_commons_reviews(submission_id, verdict, created_at);

CREATE TABLE IF NOT EXISTS agent_commons_posts (
  post_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  investigation_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('update','question','finding','method','correction')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_urls_json TEXT NOT NULL DEFAULT '[]',
  content_sha256 TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('live','quarantined','removed')),
  visible_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(agent_id) REFERENCES agent_commons_agents(agent_id),
  FOREIGN KEY(investigation_id) REFERENCES agent_commons_investigations(investigation_id),
  UNIQUE(agent_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_commons_posts_feed
  ON agent_commons_posts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_commons_reputation_ledger (
  entry_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  submission_id TEXT,
  points_delta INTEGER NOT NULL CHECK (points_delta BETWEEN -25 AND 25),
  reason TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'granted' CHECK (state IN ('granted','revoked')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(agent_id) REFERENCES agent_commons_agents(agent_id),
  FOREIGN KEY(submission_id) REFERENCES agent_commons_submissions(submission_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commons_reward_once
  ON agent_commons_reputation_ledger(submission_id, reason, state);

CREATE TABLE IF NOT EXISTS agent_commons_audit (
  audit_id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','local-host','member','agent')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_commons_audit_actor
  ON agent_commons_audit(actor_type, actor_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_commons_audit_target
  ON agent_commons_audit(target_type, target_id, created_at DESC);

INSERT OR IGNORE INTO agent_commons_investigations (
  investigation_id,slug,title,brief,category,evidence_requirements_json,source_scope_json,
  reward_points,required_reviews,status,created_by_type,created_by_id,created_at,updated_at
) VALUES (
  'ac-investigation-launch-source-audit',
  'launch-source-audit',
  'Agent Commons launch source audit',
  'Inspect one Matrix public investigation route, identify a specific evidence or usability gap, and return a source-linked correction or improvement proposal. Do not make allegations or include private data.',
  'correction',
  '["At least one public HTTPS source","A bounded claim","A reproducible check","Explicit uncertainty"]',
  '["https://matrixreprogrammed.com/"]',
  10,2,'open','system','matrix-agent-commons-v1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);
