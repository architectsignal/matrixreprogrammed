PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paypal_products (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  tier TEXT NOT NULL CHECK (tier IN ('supporter','intelligence','research_pro')),
  provider_product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(environment,tier),
  UNIQUE(environment,provider_product_id)
);

CREATE TABLE IF NOT EXISTS paypal_plans (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  tier TEXT NOT NULL CHECK (tier IN ('supporter','intelligence','research_pro')),
  provider_product_id TEXT NOT NULL,
  provider_plan_id TEXT NOT NULL,
  amount_value TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'EUR',
  interval_unit TEXT NOT NULL DEFAULT 'MONTH',
  interval_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('CREATED','ACTIVE','INACTIVE')),
  payment_failure_threshold INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(environment,tier),
  UNIQUE(environment,provider_plan_id)
);

CREATE TABLE IF NOT EXISTS paypal_checkout_intent_state (
  checkout_intent_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','approved','confirmed','expired','cancelled','failed')),
  provider_subscription_id TEXT,
  approved_at TEXT,
  confirmed_at TEXT,
  failed_at TEXT,
  failure_reason TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(checkout_intent_id) REFERENCES paypal_checkout_intents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS paypal_subscription_state (
  subscription_id TEXT PRIMARY KEY,
  provider_subscription_id TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  billing_state TEXT NOT NULL DEFAULT 'unknown' CHECK (billing_state IN ('pending_approval','approved','active','past_due','suspended','cancelled_period_end','cancelled','expired','refund_hold','reversal_hold','unknown')),
  entitlement_active INTEGER NOT NULL DEFAULT 0 CHECK (entitlement_active IN (0,1)),
  payment_failure_count INTEGER NOT NULL DEFAULT 0,
  refund_hold INTEGER NOT NULL DEFAULT 0 CHECK (refund_hold IN (0,1)),
  reversal_hold INTEGER NOT NULL DEFAULT 0 CHECK (reversal_hold IN (0,1)),
  current_period_start TEXT,
  current_period_end TEXT,
  last_payment_id TEXT,
  last_payment_amount TEXT,
  currency_code TEXT NOT NULL DEFAULT 'EUR',
  last_failed_payment_at TEXT,
  last_refund_at TEXT,
  last_reversal_at TEXT,
  last_event_id TEXT,
  last_event_type TEXT,
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS paypal_subscription_transitions (
  id TEXT PRIMARY KEY,
  subscription_id TEXT,
  provider_subscription_id TEXT NOT NULL,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  entitlement_before INTEGER NOT NULL DEFAULT 0 CHECK (entitlement_before IN (0,1)),
  entitlement_after INTEGER NOT NULL DEFAULT 0 CHECK (entitlement_after IN (0,1)),
  reason TEXT NOT NULL DEFAULT '',
  payload_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE(provider_event_id,provider_subscription_id,event_type)
);

CREATE TABLE IF NOT EXISTS paypal_payment_records (
  id TEXT PRIMARY KEY,
  subscription_id TEXT,
  provider_subscription_id TEXT,
  provider_payment_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('sale','capture','refund','reversal','failed_payment')),
  status TEXT NOT NULL,
  gross_amount TEXT,
  refund_amount TEXT,
  currency_code TEXT,
  paid_at TEXT,
  refunded_at TEXT,
  reversed_at TEXT,
  raw_resource_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE(provider_event_id,payment_type)
);

CREATE TABLE IF NOT EXISTS paypal_webhook_verifications (
  provider_event_id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  verification_method TEXT NOT NULL DEFAULT 'paypal_postback',
  verification_status TEXT NOT NULL CHECK (verification_status IN ('SUCCESS','FAILURE','ERROR')),
  transmission_id TEXT,
  transmission_time TEXT,
  cert_url TEXT,
  auth_algo TEXT,
  payload_hash TEXT NOT NULL,
  verified_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_runtime_settings (
  environment TEXT PRIMARY KEY CHECK (environment IN ('sandbox','live')),
  checkout_enabled INTEGER NOT NULL DEFAULT 0 CHECK (checkout_enabled IN (0,1)),
  activation_reason TEXT NOT NULL DEFAULT '',
  activated_by TEXT,
  activated_at TEXT,
  deactivated_at TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(activated_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS paypal_reconciliation_runs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  scope TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL CHECK (status IN ('running','completed','partially_failed','failed')),
  checked_count INTEGER NOT NULL DEFAULT 0,
  changed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  started_by TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(started_by) REFERENCES members(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO paypal_runtime_settings(environment,checkout_enabled,activation_reason,updated_at,created_at) VALUES
('sandbox',0,'Default disabled until sandbox lifecycle passes',datetime('now'),datetime('now')),
('live',0,'Default disabled until all automated and manual tests pass',datetime('now'),datetime('now'));

CREATE INDEX IF NOT EXISTS idx_paypal_products_environment_status ON paypal_products(environment,status,tier);
CREATE INDEX IF NOT EXISTS idx_paypal_plans_environment_status ON paypal_plans(environment,status,tier);
CREATE INDEX IF NOT EXISTS idx_paypal_intent_state_provider ON paypal_checkout_intent_state(provider_subscription_id,status);
CREATE INDEX IF NOT EXISTS idx_paypal_subscription_state_billing ON paypal_subscription_state(environment,billing_state,entitlement_active);
CREATE INDEX IF NOT EXISTS idx_paypal_transitions_subscription ON paypal_subscription_transitions(provider_subscription_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_transitions_event ON paypal_subscription_transitions(provider_event_id);
CREATE INDEX IF NOT EXISTS idx_paypal_payment_subscription ON paypal_payment_records(provider_subscription_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_payment_event ON paypal_payment_records(provider_event_id);
CREATE INDEX IF NOT EXISTS idx_paypal_reconciliation_status ON paypal_reconciliation_runs(environment,status,started_at DESC);

DROP VIEW IF EXISTS paypal_current_subscription_status;
CREATE VIEW paypal_current_subscription_status AS
SELECT
  s.id AS subscription_id,
  s.member_id,
  s.provider_subscription_id,
  s.provider_plan_id,
  s.tier,
  s.status AS provider_status,
  s.last_payment_at,
  s.next_billing_at,
  s.current_period_end,
  s.cancel_at_period_end,
  p.environment,
  p.billing_state,
  p.entitlement_active,
  p.payment_failure_count,
  p.refund_hold,
  p.reversal_hold,
  p.last_payment_id,
  p.last_payment_amount,
  p.currency_code,
  p.last_failed_payment_at,
  p.last_refund_at,
  p.last_reversal_at,
  p.last_event_type,
  p.last_event_at,
  p.updated_at AS state_updated_at
FROM subscriptions s
LEFT JOIN paypal_subscription_state p ON p.subscription_id=s.id
WHERE s.provider='paypal';

DROP VIEW IF EXISTS member_effective_entitlements;
CREATE VIEW member_effective_entitlements AS
WITH entitlement_candidates AS (
  SELECT m.id AS member_id,1 AS tier_rank,'registered' AS effective_tier,'verified_account' AS entitlement_source,NULL AS entitlement_reference
  FROM members m
  WHERE m.status='active' AND m.email_verified_at IS NOT NULL

  UNION ALL

  SELECT
    s.member_id,
    CASE s.tier WHEN 'supporter' THEN 2 WHEN 'intelligence' THEN 3 WHEN 'research_pro' THEN 4 ELSE 1 END,
    CASE s.tier WHEN 'supporter' THEN 'supporter_3' WHEN 'intelligence' THEN 'intelligence_6' WHEN 'research_pro' THEN 'research_pro_9' ELSE 'registered' END,
    'active_subscription',
    s.provider_subscription_id
  FROM subscriptions s
  JOIN members m ON m.id=s.member_id
  LEFT JOIN paypal_subscription_state ps ON ps.subscription_id=s.id
  WHERE m.status='active'
    AND m.email_verified_at IS NOT NULL
    AND s.provider='paypal'
    AND (
      ps.entitlement_active=1
      OR (
        ps.subscription_id IS NULL
        AND LOWER(s.status) IN ('active','trialing')
        AND (s.current_period_end IS NULL OR datetime(s.current_period_end)>datetime('now'))
      )
    )
    AND COALESCE(ps.refund_hold,0)=0
    AND COALESCE(ps.reversal_hold,0)=0

  UNION ALL

  SELECT
    g.member_id,
    CASE g.tier WHEN 'supporter' THEN 2 WHEN 'intelligence' THEN 3 WHEN 'research_pro' THEN 4 ELSE 1 END,
    CASE g.tier WHEN 'supporter' THEN 'supporter_3' WHEN 'intelligence' THEN 'intelligence_6' WHEN 'research_pro' THEN 'research_pro_9' ELSE 'registered' END,
    'audited_access_grant',
    g.id
  FROM member_access_grants g
  JOIN members m ON m.id=g.member_id
  WHERE m.status='active'
    AND m.email_verified_at IS NOT NULL
    AND g.status='active'
    AND datetime(g.starts_at)<=datetime('now')
    AND (g.expires_at IS NULL OR datetime(g.expires_at)>datetime('now'))
), ranked AS (
  SELECT member_id,MAX(tier_rank) AS tier_rank
  FROM entitlement_candidates
  GROUP BY member_id
)
SELECT
  m.id AS member_id,m.email,m.display_name,m.role,m.status,m.email_verified_at,
  COALESCE(r.tier_rank,0) AS tier_rank,
  CASE COALESCE(r.tier_rank,0) WHEN 4 THEN 'research_pro_9' WHEN 3 THEN 'intelligence_6' WHEN 2 THEN 'supporter_3' WHEN 1 THEN 'registered' ELSE 'anonymous' END AS effective_tier,
  CASE WHEN m.role='admin' THEN 1 ELSE 0 END AS is_admin,
  CASE WHEN COALESCE(r.tier_rank,0)>=2 THEN 1 ELSE 0 END AS paid_access
FROM members m
LEFT JOIN ranked r ON r.member_id=m.id
WHERE m.status<>'deleted';

DROP VIEW IF EXISTS paypal_admin_subscription_summary;
CREATE VIEW paypal_admin_subscription_summary AS
SELECT
  COALESCE(ps.environment,'unknown') AS environment,
  COALESCE(ps.billing_state,'legacy') AS billing_state,
  s.tier,
  COUNT(*) AS subscription_count,
  SUM(CASE WHEN COALESCE(ps.entitlement_active,0)=1 THEN 1 ELSE 0 END) AS entitled_count,
  SUM(CASE WHEN COALESCE(ps.refund_hold,0)=1 OR COALESCE(ps.reversal_hold,0)=1 THEN 1 ELSE 0 END) AS hold_count
FROM subscriptions s
LEFT JOIN paypal_subscription_state ps ON ps.subscription_id=s.id
WHERE s.provider='paypal'
GROUP BY COALESCE(ps.environment,'unknown'),COALESCE(ps.billing_state,'legacy'),s.tier;
