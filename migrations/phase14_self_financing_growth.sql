PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_learning_ledger (
  lesson_id TEXT PRIMARY KEY,
  cycle_index INTEGER NOT NULL CHECK (cycle_index >= 0),
  domain TEXT NOT NULL CHECK (domain IN ('research','resource','compute','site','revenue','finance','model','deployment','governance')),
  subject_id TEXT,
  observation_json TEXT NOT NULL,
  outcome_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0,1)),
  affects_ranking_only INTEGER NOT NULL DEFAULT 1 CHECK (affects_ranking_only=1),
  policy_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK (policy_mutation_allowed=0),
  evidence_threshold_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK (evidence_threshold_mutation_allowed=0),
  financial_execution_allowed INTEGER NOT NULL DEFAULT 0 CHECK (financial_execution_allowed=0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_learning_ledger_domain
  ON matrix_learning_ledger(domain, accepted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matrix_learning_ledger_subject
  ON matrix_learning_ledger(subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS matrix_revenue_events (
  event_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('membership','donation','books_and_reports','sponsorship','approved_affiliate','approved_services')),
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','visit','lead','checkout_started','purchase_verified','renewal_verified','donation_verified','refund_verified','chargeback_verified','operating_cost_verified')),
  amount_eur REAL NOT NULL DEFAULT 0 CHECK (amount_eur >= 0),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  external_reference_hash TEXT,
  experiment_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_revenue_events_channel
  ON matrix_revenue_events(channel_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_matrix_revenue_events_verified
  ON matrix_revenue_events(verified, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS matrix_revenue_channels (
  channel_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('membership','donation','books_and_reports','sponsorship','approved_affiliate','approved_services')),
  destination_path TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  zero_spend_only INTEGER NOT NULL DEFAULT 1 CHECK (zero_spend_only=1),
  evidence_independence_required INTEGER NOT NULL DEFAULT 1 CHECK (evidence_independence_required=1),
  commercial_claims_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_growth_experiments (
  experiment_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  experiment_type TEXT NOT NULL CHECK (experiment_type IN ('cta_copy','landing_page_order','report_preview','membership_positioning','newsletter_positioning','offer_bundle','pricing','payment_flow','sponsorship_terms')),
  hypothesis TEXT NOT NULL,
  control_json TEXT NOT NULL DEFAULT '{}',
  variant_json TEXT NOT NULL DEFAULT '{}',
  primary_metric TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','approved','running','completed','rejected','rolled_back')),
  automatic_execution_allowed INTEGER NOT NULL DEFAULT 0 CHECK (automatic_execution_allowed IN (0,1)),
  owner_approval_required INTEGER NOT NULL DEFAULT 1 CHECK (owner_approval_required IN (0,1)),
  maximum_duration_hours INTEGER NOT NULL DEFAULT 168 CHECK (maximum_duration_hours BETWEEN 1 AND 720),
  result_json TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(channel_id) REFERENCES matrix_revenue_channels(channel_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_growth_experiments_status
  ON matrix_growth_experiments(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_finance_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  verified_gross_revenue_eur REAL NOT NULL DEFAULT 0 CHECK (verified_gross_revenue_eur >= 0),
  verified_refunds_eur REAL NOT NULL DEFAULT 0 CHECK (verified_refunds_eur >= 0),
  verified_operating_cost_eur REAL NOT NULL DEFAULT 0 CHECK (verified_operating_cost_eur >= 0),
  verified_net_revenue_eur REAL NOT NULL DEFAULT 0,
  verified_cash_reserve_eur REAL NOT NULL DEFAULT 0 CHECK (verified_cash_reserve_eur >= 0),
  self_financing_ratio REAL,
  channel_metrics_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_finance_snapshots_recent
  ON matrix_finance_snapshots(period_end DESC);

CREATE TABLE IF NOT EXISTS matrix_capital_proposals (
  proposal_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('operating_reserve','infrastructure','audience_growth','experiments')),
  amount_eur REAL NOT NULL CHECK (amount_eur >= 0),
  rationale TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('proposed','approved','rejected','executed','expired')),
  owner_approval_required INTEGER NOT NULL DEFAULT 1 CHECK (owner_approval_required=1),
  execution_allowed INTEGER NOT NULL DEFAULT 0 CHECK (execution_allowed=0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_capital_proposals_status
  ON matrix_capital_proposals(status, created_at DESC);

INSERT OR IGNORE INTO ai_feature_flags(flag_name, enabled, value_json, reason, updated_by, updated_at) VALUES
  ('MATRIX_SELF_FINANCING_GROWTH_ENABLED', 0, '{"zero_spend_only":true,"price_mutation":false,"payment_mutation":false,"evidence_independence":true}', 'Revenue learning may optimize reversible zero-cost presentation experiments only. Pricing, payment, contracts and evidence policy remain owner-controlled.', 'migration', CURRENT_TIMESTAMP);
