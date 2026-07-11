PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS osint_tool_jobs (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  tool TEXT NOT NULL CHECK (tool IN ('holehe', 'spiderfoot', 'h8mail')),
  access_level TEXT NOT NULL CHECK (access_level IN ('member', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  target_hash TEXT NOT NULL,
  target_ciphertext TEXT NOT NULL,
  target_iv TEXT NOT NULL,
  lawful_purpose TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  result_json TEXT,
  result_summary TEXT,
  error_message TEXT,
  runner_id TEXT,
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS osint_runner_heartbeats (
  runner_id TEXT PRIMARY KEY,
  supported_tools_json TEXT NOT NULL,
  version TEXT,
  last_seen_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_osint_jobs_member_created ON osint_tool_jobs(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_osint_jobs_queue ON osint_tool_jobs(status, tool, created_at);
CREATE INDEX IF NOT EXISTS idx_osint_jobs_expiry ON osint_tool_jobs(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_osint_jobs_target_hash ON osint_tool_jobs(target_hash, tool, created_at);
CREATE INDEX IF NOT EXISTS idx_osint_runner_last_seen ON osint_runner_heartbeats(last_seen_at);
