PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS forum_post_owners (
  post_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forum_post_owners_member
  ON forum_post_owners(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forum_report_owners (
  report_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  session_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(report_id) REFERENCES forum_reports(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forum_report_owners_member
  ON forum_report_owners(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forum_board_state (
  board TEXT PRIMARY KEY CHECK (board IN ('main','speculation','epstein-alive')),
  post_count INTEGER NOT NULL DEFAULT 0,
  last_post_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO forum_board_state (board, post_count, updated_at)
VALUES ('main', 0, datetime('now'));
INSERT OR IGNORE INTO forum_board_state (board, post_count, updated_at)
VALUES ('speculation', 0, datetime('now'));
INSERT OR IGNORE INTO forum_board_state (board, post_count, updated_at)
VALUES ('epstein-alive', 0, datetime('now'));

DROP VIEW IF EXISTS forum_persistence_health;
CREATE VIEW forum_persistence_health AS
SELECT
  s.board,
  s.post_count AS recorded_post_count,
  s.last_post_at,
  s.updated_at,
  COALESCE((SELECT COUNT(*) FROM forum_posts p WHERE p.board=s.board AND p.status='live'),0) AS live_post_count,
  COALESCE((SELECT COUNT(*) FROM forum_post_owners o JOIN forum_posts p ON p.id=o.post_id WHERE p.board=s.board),0) AS verified_owner_count
FROM forum_board_state s;
