PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'editor', 'admin')),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'supporter', 'intelligence', 'research_pro')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'cancelled', 'deleted')),
  marketing_status TEXT NOT NULL DEFAULT 'pending' CHECK (marketing_status IN ('pending', 'subscribed', 'unsubscribed', 'suppressed')),
  source TEXT,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS email_consents (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  consent_type TEXT NOT NULL DEFAULT 'marketing_email',
  granted INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0, 1)),
  wording_version TEXT NOT NULL,
  source_page TEXT,
  ip_country TEXT,
  granted_at TEXT,
  withdrawn_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'login', 'unsubscribe', 'delete_account')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_sessions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paypal' CHECK (provider IN ('paypal')),
  provider_customer_id TEXT,
  provider_subscription_id TEXT UNIQUE,
  provider_plan_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('supporter', 'intelligence', 'research_pro')),
  status TEXT NOT NULL DEFAULT 'pending',
  last_payment_at TEXT,
  next_billing_at TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  suspended_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'paypal',
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_tier_status ON members(tier, status);
CREATE INDEX IF NOT EXISTS idx_members_marketing_status ON members(marketing_status);
CREATE INDEX IF NOT EXISTS idx_consents_member ON email_consents(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON member_sessions(session_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON member_sessions(member_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_member ON subscriptions(member_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_id ON subscriptions(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_id ON payment_webhook_events(provider_event_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id, created_at);
