PRAGMA foreign_keys = ON;

-- Phase 6 predates voluntary-support captures and did not persist the PayPal
-- environment on payment rows. Rebuild without data loss so a sandbox record
-- can never be mistaken for real Matrix capital and a real donation can be
-- recorded. No other table references paypal_payment_records.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;
DROP TABLE IF EXISTS paypal_payment_records_phase19;
CREATE TABLE paypal_payment_records_phase19 (
  id TEXT PRIMARY KEY,
  subscription_id TEXT,
  provider_subscription_id TEXT,
  provider_payment_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('sale','capture','donation','refund','reversal','failed_payment')),
  environment TEXT CHECK (environment IN ('sandbox','live')),
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
INSERT OR IGNORE INTO paypal_payment_records_phase19(
  id,subscription_id,provider_subscription_id,provider_payment_id,provider_event_id,payment_type,environment,status,
  gross_amount,refund_amount,currency_code,paid_at,refunded_at,reversed_at,raw_resource_json,created_at,updated_at
) SELECT p.id,p.subscription_id,p.provider_subscription_id,p.provider_payment_id,p.provider_event_id,p.payment_type,
  COALESCE((SELECT s.environment FROM paypal_subscription_state s WHERE s.subscription_id=p.subscription_id LIMIT 1),json_extract(p.raw_resource_json,'$.matrix_environment')),
  p.status,p.gross_amount,p.refund_amount,p.currency_code,p.paid_at,p.refunded_at,p.reversed_at,p.raw_resource_json,p.created_at,p.updated_at
FROM paypal_payment_records p;
DROP TABLE paypal_payment_records;
ALTER TABLE paypal_payment_records_phase19 RENAME TO paypal_payment_records;
CREATE INDEX IF NOT EXISTS idx_paypal_payment_subscription ON paypal_payment_records(provider_subscription_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_payment_event ON paypal_payment_records(provider_event_id);
COMMIT;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_capital_challenges (
  challenge_id TEXT PRIMARY KEY,
  currency TEXT NOT NULL CHECK (currency='EUR'),
  baseline_net_minor INTEGER NOT NULL DEFAULT 0 CHECK (baseline_net_minor >= 0),
  received_net_minor INTEGER NOT NULL DEFAULT 0 CHECK (received_net_minor >= 0),
  next_milestone_minor INTEGER CHECK (next_milestone_minor IS NULL OR next_milestone_minor > 0),
  state TEXT NOT NULL CHECK (state IN ('AWAITING_FIRST_REAL_RECEIPT','ACTIVE_REAL_RECEIPTS','COMPLETED','PAUSED')),
  first_real_receipt_id TEXT,
  operational_claim_allowed INTEGER NOT NULL DEFAULT 0 CHECK (operational_claim_allowed IN (0,1)),
  law_sha256 TEXT NOT NULL CHECK (law_sha256='2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189'),
  updated_at TEXT NOT NULL,
  CHECK (operational_claim_allowed=0 OR (received_net_minor + baseline_net_minor >= 100 AND first_real_receipt_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS matrix_capital_destination_registry (
  registry_id TEXT PRIMARY KEY,
  destination_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('COLLECTION','OPERATING_FLOAT','TREASURY')),
  allowed_assets_json TEXT NOT NULL DEFAULT '[]',
  exposure_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (exposure_limit_minor >= 0),
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  raw_credentials_stored INTEGER NOT NULL DEFAULT 0 CHECK (raw_credentials_stored=0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(destination_id) REFERENCES matrix_value_destinations(destination_id)
);

CREATE TABLE IF NOT EXISTS matrix_capital_receipts (
  capital_receipt_id TEXT PRIMARY KEY,
  source_class TEXT NOT NULL CHECK (source_class IN ('CLAIM_VALUE','PERMISSIONLESS_VALUE','DIRECT_REVENUE','DONATION','BOUNTY','GRANT','SPONSORSHIP')),
  source_receipt_id TEXT NOT NULL,
  external_reference TEXT NOT NULL,
  asset TEXT NOT NULL,
  gross_amount_minor INTEGER NOT NULL CHECK (gross_amount_minor >= 0),
  cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (cost_minor >= 0),
  net_amount_minor INTEGER NOT NULL CHECK (net_amount_minor > 0),
  eur_net_minor INTEGER NOT NULL CHECK (eur_net_minor > 0),
  conversion_evidence_json TEXT NOT NULL DEFAULT '{}',
  destination_id TEXT NOT NULL,
  reconciled INTEGER NOT NULL CHECK (reconciled=1),
  received_at TEXT NOT NULL,
  reconciled_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_class,source_receipt_id),
  UNIQUE(source_class,external_reference),
  FOREIGN KEY(destination_id) REFERENCES matrix_value_destinations(destination_id),
  CHECK (net_amount_minor = gross_amount_minor - cost_minor),
  CHECK (asset='EUR' OR length(conversion_evidence_json) > 2)
);

CREATE INDEX IF NOT EXISTS idx_matrix_capital_receipts_time ON matrix_capital_receipts(reconciled_at DESC, source_class);

CREATE TABLE IF NOT EXISTS matrix_capital_adjustments (
  adjustment_id TEXT PRIMARY KEY,
  source_class TEXT NOT NULL CHECK (source_class IN ('REFUND','REVERSAL','FEE','CHARGEBACK','OTHER_VERIFIED_COST')),
  source_record_id TEXT NOT NULL,
  external_reference TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  eur_amount_minor INTEGER NOT NULL CHECK (eur_amount_minor > 0),
  capital_receipt_id TEXT,
  reconciled INTEGER NOT NULL CHECK (reconciled=1),
  occurred_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_class,source_record_id),
  FOREIGN KEY(capital_receipt_id) REFERENCES matrix_capital_receipts(capital_receipt_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_capital_adjustments_time ON matrix_capital_adjustments(occurred_at DESC, source_class);

CREATE TABLE IF NOT EXISTS matrix_capital_milestone_receipts (
  milestone_receipt_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  milestone_minor INTEGER NOT NULL CHECK (milestone_minor IN (100,1000,10000,100000,1000000,10000000,100000000)),
  crossed_by_capital_receipt_id TEXT NOT NULL,
  cumulative_net_minor INTEGER NOT NULL CHECK (cumulative_net_minor >= milestone_minor),
  crossed_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  UNIQUE(challenge_id,milestone_minor),
  FOREIGN KEY(challenge_id) REFERENCES matrix_capital_challenges(challenge_id),
  FOREIGN KEY(crossed_by_capital_receipt_id) REFERENCES matrix_capital_receipts(capital_receipt_id)
);

CREATE TABLE IF NOT EXISTS matrix_capital_channels (
  channel_id TEXT PRIMARY KEY,
  priority_lane TEXT NOT NULL CHECK (priority_lane IN ('P0_IMMEDIATE_OWNED_VALUE','P1_BOUNTIES','P2_DIRECT_REVENUE','P3_SPONSORSHIP','P4_GRANTS','P5_COMPLEX_CLAIMS')),
  channel_type TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  reconciled_receipts INTEGER NOT NULL DEFAULT 0 CHECK (reconciled_receipts >= 0),
  realized_net_minor INTEGER NOT NULL DEFAULT 0,
  realized_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (realized_cost_minor >= 0),
  score REAL NOT NULL DEFAULT 0,
  allocation_weight REAL NOT NULL DEFAULT 1 CHECK (allocation_weight BETWEEN 0 AND 10),
  evidence_basis TEXT NOT NULL DEFAULT 'reconciled-receipts-only',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_capital_opportunities (
  opportunity_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  opportunity_type TEXT NOT NULL,
  taxonomy_version INTEGER NOT NULL DEFAULT 1 CHECK (taxonomy_version > 0),
  priority_lane TEXT NOT NULL CHECK (priority_lane IN ('P0_IMMEDIATE_OWNED_VALUE','P1_BOUNTIES','P2_DIRECT_REVENUE','P3_SPONSORSHIP','P4_GRANTS','P5_COMPLEX_CLAIMS')),
  title TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('HYPOTHESIS','VERIFYING','READY_FOR_BOUNDED_TEST','ACTIVE','WAIT','OWNER_ACTION_REQUIRED','RECEIPT_PROVEN','REJECTED','BLOCKED')),
  next_action TEXT NOT NULL CHECK (next_action IN ('VERIFY','PREPARE','PUBLISH','APPLY','CLAIM','COLLECT','MEASURE','WAIT','OWNER_ACTION_REQUIRED')),
  policy_class TEXT NOT NULL,
  method_authorized INTEGER NOT NULL DEFAULT 0 CHECK (method_authorized IN (0,1)),
  destination_ready INTEGER NOT NULL DEFAULT 0 CHECK (destination_ready IN (0,1)),
  evidence_ready INTEGER NOT NULL DEFAULT 0 CHECK (evidence_ready IN (0,1)),
  estimated_gross_minor INTEGER NOT NULL DEFAULT 0 CHECK (estimated_gross_minor >= 0),
  estimated_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_minor >= 0),
  expected_net_minor INTEGER NOT NULL DEFAULT 0,
  success_probability_ppm INTEGER NOT NULL DEFAULT 0 CHECK (success_probability_ppm BETWEEN 0 AND 1000000),
  source_json TEXT NOT NULL DEFAULT '{}',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(challenge_id) REFERENCES matrix_capital_challenges(challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_capital_opportunities_queue ON matrix_capital_opportunities(state, priority_lane, expected_net_minor DESC, updated_at);

CREATE TABLE IF NOT EXISTS matrix_opportunity_graph_nodes (
  node_id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('OBSERVED_INPUT','HYPOTHESIS_ONLY','VERIFIED','RECEIPT_PROVEN','REJECTED')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_opportunity_graph_edges (
  edge_id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('HYPOTHESIS_ONLY','VERIFIED','RECEIPT_PROVEN','REJECTED')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(from_node_id) REFERENCES matrix_opportunity_graph_nodes(node_id),
  FOREIGN KEY(to_node_id) REFERENCES matrix_opportunity_graph_nodes(node_id)
);

CREATE TABLE IF NOT EXISTS matrix_acquisition_experiments (
  experiment_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PROPOSED','READY_FOR_BOUNDED_TEST','RUNNING','MEASURED','BLOCKED','REJECTED')),
  maximum_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (maximum_cost_minor >= 0),
  actual_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (actual_cost_minor >= 0),
  automatic_financial_execution INTEGER NOT NULL DEFAULT 0 CHECK (automatic_financial_execution=0),
  success_metric TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES matrix_capital_opportunities(opportunity_id),
  CHECK (actual_cost_minor <= maximum_cost_minor)
);

CREATE TABLE IF NOT EXISTS matrix_future_opportunity_radar (
  radar_id TEXT PRIMARY KEY,
  signal TEXT NOT NULL,
  horizon TEXT NOT NULL,
  confidence_ppm INTEGER NOT NULL DEFAULT 0 CHECK (confidence_ppm BETWEEN 0 AND 1000000),
  immediate_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (immediate_value_minor=0),
  state TEXT NOT NULL CHECK (state IN ('WATCH_ONLY','VERIFYING','PROMOTED','REJECTED')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_capital_cycles (
  capital_cycle_id TEXT PRIMARY KEY,
  value_cycle_id TEXT UNIQUE,
  trigger_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed','completed_with_findings','blocked','failed')),
  received_net_minor INTEGER NOT NULL DEFAULT 0 CHECK (received_net_minor >= 0),
  next_milestone_minor INTEGER,
  velocity_json TEXT NOT NULL DEFAULT '{}',
  forecast_json TEXT NOT NULL DEFAULT '{}',
  watchdog_json TEXT NOT NULL DEFAULT '{}',
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO matrix_capital_challenges(
  challenge_id,currency,baseline_net_minor,received_net_minor,next_milestone_minor,state,first_real_receipt_id,
  operational_claim_allowed,law_sha256,updated_at
) VALUES (
  'matrix-capital-challenge-eur-v1','EUR',0,0,100,'AWAITING_FIRST_REAL_RECEIPT',NULL,0,
  '2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO matrix_capital_channels(channel_id,priority_lane,channel_type,attempts,reconciled_receipts,realized_net_minor,realized_cost_minor,score,allocation_weight,evidence_basis,updated_at) VALUES
  ('capital-p0-owned-value','P0_IMMEDIATE_OWNED_VALUE','rewards-balances-refunds-rebates',0,0,0,0,0,1,'reconciled-receipts-only',CURRENT_TIMESTAMP),
  ('capital-p1-bounties','P1_BOUNTIES','bounties',0,0,0,0,0,1,'reconciled-receipts-only',CURRENT_TIMESTAMP),
  ('capital-p2-direct-revenue','P2_DIRECT_REVENUE','digital-products-membership-services',0,0,0,0,0,1,'reconciled-receipts-only',CURRENT_TIMESTAMP),
  ('capital-p3-sponsorship','P3_SPONSORSHIP','sponsorship',0,0,0,0,0,1,'reconciled-receipts-only',CURRENT_TIMESTAMP),
  ('capital-p4-grants','P4_GRANTS','grants',0,0,0,0,0,1,'reconciled-receipts-only',CURRENT_TIMESTAMP),
  ('capital-p5-complex-claims','P5_COMPLEX_CLAIMS','complex-claims',0,0,0,0,0,1,'reconciled-receipts-only',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ai_feature_flags(flag_name,enabled,value_json,reason,updated_by,updated_at) VALUES
  ('MATRIX_CAPITAL_CHALLENGE_ENABLED',1,'{"receipt_only":true,"zero_spend_first":true,"first_real_eur_required":true}','Enable discovery, planning, reconciliation and milestone accounting.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_CAPITAL_FINANCIAL_EXECUTION_ENABLED',0,'{"bounded_delegation_required":true,"approved_destination_required":true}','Financial execution remains disabled until a method-specific adapter, authority and approved destination pass every gate.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_NOVEL_OPPORTUNITY_DIRECTOR_ENABLED',1,'{"hypotheses_are_not_value":true,"authority_expansion":false}','Generate and test zero-spend opportunity hypotheses without granting new authority.','migration',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_system_components(
  component_id,director,implementation,state,capacity_units,reliability,dependencies_json,health_evidence_json,blocker,last_verified_at,updated_at
) VALUES
  ('matrix-capital-challenge','CapitalAcquisitionDirector','ai-management/value-hunter/matrix-capital-challenge.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-value-receipts","matrix-capital-destination-registry","matrix-constitution"]','["matrix-capital-challenge-contract-test","phase19-migration-rehearsal"]','No real external EUR receipt has been reconciled to an approved Matrix destination.',NULL,CURRENT_TIMESTAMP),
  ('novel-opportunity-director','NovelOpportunityDirector','ai-management/value-hunter/matrix-capital-challenge.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-opportunity-graph","matrix-capability-graph"]','["matrix-capital-challenge-contract-test"]','Generated hypotheses require real bounded experiment receipts before promotion.',NULL,CURRENT_TIMESTAMP),
  ('revenue-creation-director','RevenueCreationDirector','ai-management/value-hunter/matrix-capital-challenge.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-site-assets","approved-payment-destinations"]','["matrix-capital-challenge-contract-test"]','No production conversion receipt has been reconciled by this director.',NULL,CURRENT_TIMESTAMP),
  ('capital-challenge-watchdog','CapitalChallengeWatchdog','ai-management/value-hunter/matrix-capital-challenge.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-capital-cycles","matrix-capital-receipts"]','["matrix-capital-challenge-contract-test"]','A production scheduled capital-cycle receipt is required.',NULL,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_permanent_objectives(
  objective_id,objective,metric,priority,constitutional_law_sha256,active,current_state,evidence_json,updated_at
) VALUES
  ('MATRIX_CAPITAL_CHALLENGE','Reach EUR milestones from EUR 1 to EUR 1,000,000 using only lawful authorized receipt-proven value.','RECONCILED_NET_EUR_RECEIVED',96,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',1,'PARTIAL','{"next_milestone_minor":100,"operational_only_after_first_real_receipt":true}',CURRENT_TIMESTAMP),
  ('CONTINUOUS_OPPORTUNITY_INVENTION','Continually derive and test new lawful zero-spend opportunity classes from real Matrix capabilities and needs.','RECEIPT_PROVEN_OPPORTUNITY_CLASSES',88,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',1,'WORKING_NOT_LIVE','{"hypotheses_do_not_count_as_value":true,"authority_expansion":false}',CURRENT_TIMESTAMP);
