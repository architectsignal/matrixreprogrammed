PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paypal_checkout_intents (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('supporter', 'intelligence', 'research_pro')),
  plan_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paypal_checkout_member ON paypal_checkout_intents(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paypal_checkout_expiry ON paypal_checkout_intents(expires_at, used_at);
