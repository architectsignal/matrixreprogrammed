PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paypal_sandbox_bootstrap_status (
  environment TEXT PRIMARY KEY CHECK (environment = 'sandbox'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','ready','blocked','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  configured INTEGER NOT NULL DEFAULT 0 CHECK (configured IN (0,1)),
  sandbox_switch_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sandbox_switch_enabled IN (0,1)),
  production_switch_disabled INTEGER NOT NULL DEFAULT 1 CHECK (production_switch_disabled IN (0,1)),
  product_count INTEGER NOT NULL DEFAULT 0,
  plan_count INTEGER NOT NULL DEFAULT 0,
  plans_ready INTEGER NOT NULL DEFAULT 0 CHECK (plans_ready IN (0,1)),
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO paypal_sandbox_bootstrap_status (
  environment,status,attempt_count,configured,sandbox_switch_enabled,
  production_switch_disabled,product_count,plan_count,plans_ready,
  details_json,updated_at,created_at
) VALUES (
  'sandbox','pending',0,0,0,1,0,0,0,'{}',datetime('now'),datetime('now')
);

CREATE TABLE IF NOT EXISTS paypal_checkout_consents (
  checkout_intent_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  withdrawal_notice_version TEXT NOT NULL,
  terms_accepted INTEGER NOT NULL CHECK (terms_accepted IN (0,1)),
  recurring_payment_acknowledged INTEGER NOT NULL CHECK (recurring_payment_acknowledged IN (0,1)),
  immediate_service_requested INTEGER NOT NULL CHECK (immediate_service_requested IN (0,1)),
  withdrawal_notice_acknowledged INTEGER NOT NULL CHECK (withdrawal_notice_acknowledged IN (0,1)),
  user_agent_hash TEXT NOT NULL,
  ip_country TEXT,
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(checkout_intent_id) REFERENCES paypal_checkout_intents(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paypal_checkout_consents_member
  ON paypal_checkout_consents(member_id,consented_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_checkout_consents_versions
  ON paypal_checkout_consents(terms_version,withdrawal_notice_version,consented_at DESC);

DROP VIEW IF EXISTS paypal_sandbox_bootstrap_health;
CREATE VIEW paypal_sandbox_bootstrap_health AS
SELECT
  b.environment,
  b.status,
  b.attempt_count,
  b.configured,
  b.sandbox_switch_enabled,
  b.production_switch_disabled,
  b.product_count,
  b.plan_count,
  b.plans_ready,
  b.last_attempt_at,
  b.last_success_at,
  b.last_error,
  b.updated_at,
  COALESCE(r.checkout_enabled,0) AS database_checkout_enabled,
  r.activation_reason
FROM paypal_sandbox_bootstrap_status b
LEFT JOIN paypal_runtime_settings r ON r.environment=b.environment;

DROP VIEW IF EXISTS paypal_checkout_consent_summary;
CREATE VIEW paypal_checkout_consent_summary AS
SELECT
  c.terms_version,
  c.withdrawal_notice_version,
  COUNT(*) AS consent_count,
  MIN(c.consented_at) AS first_consent_at,
  MAX(c.consented_at) AS latest_consent_at
FROM paypal_checkout_consents c
WHERE c.terms_accepted=1
  AND c.recurring_payment_acknowledged=1
  AND c.immediate_service_requested=1
  AND c.withdrawal_notice_acknowledged=1
GROUP BY c.terms_version,c.withdrawal_notice_version;
