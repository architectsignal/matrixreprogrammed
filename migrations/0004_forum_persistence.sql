PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS forum_posts (
  id TEXT PRIMARY KEY,
  board TEXT NOT NULL CHECK (board IN ('main','speculation','epstein-alive')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Signal',
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  source_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','hidden','removed','pending')),
  storage_origin TEXT NOT NULL DEFAULT 'd1',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_reports (
  id TEXT PRIMARY KEY,
  board TEXT NOT NULL CHECK (board IN ('main','speculation','epstein-alive')),
  post_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed','actioned'))
);

CREATE TABLE IF NOT EXISTS forum_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_board_created ON forum_posts(board, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_status_created ON forum_posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_reports_post ON forum_reports(post_id, created_at DESC);
