PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_market_watchlists (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('person','institution','issuer','ticker','cik')),
  target_key TEXT NOT NULL,
  target_label TEXT NOT NULL,
  alert_insider_transactions INTEGER NOT NULL DEFAULT 1 CHECK (alert_insider_transactions IN (0,1)),
  alert_institution_changes INTEGER NOT NULL DEFAULT 1 CHECK (alert_institution_changes IN (0,1)),
  alert_new_positions INTEGER NOT NULL DEFAULT 1 CHECK (alert_new_positions IN (0,1)),
  alert_exits INTEGER NOT NULL DEFAULT 1 CHECK (alert_exits IN (0,1)),
  minimum_reported_value REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE(member_id,target_type,target_key)
);

CREATE TABLE IF NOT EXISTS market_alert_deliveries (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  watchlist_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  delivery_channel TEXT NOT NULL DEFAULT 'email' CHECK (delivery_channel IN ('email','dashboard')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','suppressed')),
  created_at TEXT NOT NULL,
  sent_at TEXT,
  error_message TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (watchlist_id) REFERENCES member_market_watchlists(id) ON DELETE CASCADE,
  UNIQUE(member_id,activity_id,delivery_channel)
);

CREATE INDEX IF NOT EXISTS idx_market_watchlists_member ON member_market_watchlists(member_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_watchlists_target ON member_market_watchlists(target_type,target_key);
CREATE INDEX IF NOT EXISTS idx_market_alerts_pending ON market_alert_deliveries(status,created_at);
