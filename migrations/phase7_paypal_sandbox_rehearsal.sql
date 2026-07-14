PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paypal_sandbox_rehearsal_runs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment='sandbox'),
  status TEXT NOT NULL CHECK (status IN ('active','passed','failed','aborted','expired')),
  target_tier TEXT NOT NULL CHECK (target_tier IN ('supporter','intelligence','research_pro')),
  test_member_email TEXT NOT NULL,
  started_by TEXT,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  checkout_enabled_before INTEGER NOT NULL DEFAULT 0 CHECK (checkout_enabled_before IN (0,1)),
  checkout_disabled_at TEXT,
  provider_subscription_id TEXT,
  verified_webhook_event_id TEXT,
  active_entitlement_seen_at TEXT,
  cancellation_seen_at TEXT,
  observed_effective_tier TEXT,
  checks_json TEXT NOT NULL DEFAULT '{}',
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(started_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS paypal_sandbox_rehearsal_evidence (
  id TEXT PRIMARY KEY,
  rehearsal_run_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('started','readiness','checkout_opened','member_found','subscription_found','entitlement_active','webhook_verified','transition_recorded','payment_recorded','cancellation_observed','checkout_closed','passed','failed','aborted','expired')),
  status TEXT NOT NULL DEFAULT 'observed' CHECK (status IN ('observed','passed','failed','informational')),
  reference_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL,
  FOREIGN KEY(rehearsal_run_id) REFERENCES paypal_sandbox_rehearsal_runs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paypal_sandbox_one_active
ON paypal_sandbox_rehearsal_runs(environment)
WHERE status='active';

CREATE INDEX IF NOT EXISTS idx_paypal_sandbox_rehearsal_status
ON paypal_sandbox_rehearsal_runs(status,expires_at DESC,started_at DESC);

CREATE INDEX IF NOT EXISTS idx_paypal_sandbox_rehearsal_email
ON paypal_sandbox_rehearsal_runs(test_member_email,started_at DESC);

CREATE INDEX IF NOT EXISTS idx_paypal_sandbox_rehearsal_evidence
ON paypal_sandbox_rehearsal_evidence(rehearsal_run_id,observed_at DESC);

DROP VIEW IF EXISTS paypal_active_sandbox_rehearsal;
CREATE VIEW paypal_active_sandbox_rehearsal AS
SELECT *
FROM paypal_sandbox_rehearsal_runs
WHERE status='active' AND datetime(expires_at)>datetime('now')
ORDER BY started_at DESC
LIMIT 1;

DROP VIEW IF EXISTS paypal_sandbox_rehearsal_summary;
CREATE VIEW paypal_sandbox_rehearsal_summary AS
SELECT
  r.*,
  (SELECT COUNT(*) FROM paypal_sandbox_rehearsal_evidence e WHERE e.rehearsal_run_id=r.id) AS evidence_count,
  CASE WHEN r.active_entitlement_seen_at IS NOT NULL THEN 1 ELSE 0 END AS entitlement_proved,
  CASE WHEN r.verified_webhook_event_id IS NOT NULL THEN 1 ELSE 0 END AS webhook_proved,
  CASE WHEN r.cancellation_seen_at IS NOT NULL THEN 1 ELSE 0 END AS cancellation_proved
FROM paypal_sandbox_rehearsal_runs r;

UPDATE paypal_runtime_settings
SET checkout_enabled=0,
    activation_reason='Phase 7 installed; sandbox checkout remains disabled until a timed rehearsal starts',
    deactivated_at=COALESCE(deactivated_at,datetime('now')),
    updated_at=datetime('now')
WHERE environment='sandbox';
