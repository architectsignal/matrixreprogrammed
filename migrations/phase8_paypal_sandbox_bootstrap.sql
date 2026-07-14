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
