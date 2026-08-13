PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_value_jurisdictions (
  jurisdiction_id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  label TEXT NOT NULL,
  authority_url TEXT NOT NULL,
  claim_permitted INTEGER NOT NULL DEFAULT 0 CHECK (claim_permitted IN (0,1)),
  automation_permitted INTEGER NOT NULL DEFAULT 0 CHECK (automation_permitted IN (0,1)),
  automation_level INTEGER NOT NULL DEFAULT 0 CHECK (automation_level BETWEEN 0 AND 4),
  restrictions_json TEXT NOT NULL DEFAULT '[]',
  rules_hash TEXT,
  validated_at TEXT,
  valid_until TEXT,
  status TEXT NOT NULL CHECK (status IN ('discovery-only','current','expired','disabled')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_value_sources (
  source_id TEXT PRIMARY KEY,
  jurisdiction_id TEXT NOT NULL,
  category TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  official_url TEXT NOT NULL UNIQUE,
  terms_url TEXT,
  provider_adapter_id TEXT,
  source_status TEXT NOT NULL CHECK (source_status IN ('discovery-only','active','terms-changed','unavailable','disabled')),
  official_verified INTEGER NOT NULL DEFAULT 0 CHECK (official_verified IN (0,1)),
  terms_current INTEGER NOT NULL DEFAULT 0 CHECK (terms_current IN (0,1)),
  terms_hash TEXT,
  validated_terms_hash TEXT,
  last_checked_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(jurisdiction_id) REFERENCES matrix_value_jurisdictions(jurisdiction_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_value_sources_active
  ON matrix_value_sources(source_status, category, jurisdiction_id);

CREATE TABLE IF NOT EXISTS matrix_value_claimants (
  claimant_id TEXT PRIMARY KEY,
  display_label TEXT NOT NULL,
  authority_status TEXT NOT NULL CHECK (authority_status IN ('unverified','proven','revoked')),
  identity_status TEXT NOT NULL CHECK (identity_status IN ('unmatched','matched','expired')),
  identity_vault_reference TEXT NOT NULL,
  jurisdictions_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_value_destinations (
  destination_id TEXT PRIMARY KEY,
  claimant_id TEXT NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('bank-account','payment-account','custodial-wallet','self-custody-wallet')),
  destination_vault_reference TEXT NOT NULL,
  public_identifier_hash TEXT NOT NULL,
  allowed_assets_json TEXT NOT NULL DEFAULT '[]',
  allowed_intents_json TEXT NOT NULL DEFAULT '["CLAIM_REWARD","SWEEP_RECEIVED_ASSET","WITHDRAW_OWNED_BALANCE"]',
  provider_adapter_id TEXT,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  approved_by_owner_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(claimant_id) REFERENCES matrix_value_claimants(claimant_id),
  CHECK (approved = 0 OR approved_by_owner_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_matrix_value_destinations_claimant
  ON matrix_value_destinations(claimant_id, approved, active);

CREATE TABLE IF NOT EXISTS matrix_value_mandates (
  mandate_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  auto_collect_proven_entitlements INTEGER NOT NULL DEFAULT 0 CHECK (auto_collect_proven_entitlements IN (0,1)),
  covered_categories_json TEXT NOT NULL,
  allowed_intents_json TEXT NOT NULL,
  maximum_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (maximum_fee_minor >= 0),
  maximum_fee_ratio REAL NOT NULL DEFAULT 0 CHECK (maximum_fee_ratio BETWEEN 0 AND 1),
  maximum_daily_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (maximum_daily_fee_minor >= 0),
  minimum_net_value_minor INTEGER NOT NULL DEFAULT 1 CHECK (minimum_net_value_minor >= 0),
  large_value_confirmation_threshold_minor INTEGER,
  policy_json TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matrix_value_one_active_mandate
  ON matrix_value_mandates(active) WHERE active=1;

CREATE TABLE IF NOT EXISTS matrix_value_objectives (
  objective_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  target_net_minor INTEGER NOT NULL CHECK (target_net_minor > 0),
  received_net_minor INTEGER NOT NULL DEFAULT 0 CHECK (received_net_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('active','achieved','paused')),
  deadline_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_value_opportunities (
  opportunity_id TEXT PRIMARY KEY,
  objective_id TEXT,
  source_id TEXT NOT NULL,
  jurisdiction_id TEXT NOT NULL,
  claimant_id TEXT,
  destination_id TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  legal_basis TEXT,
  state TEXT NOT NULL CHECK (state IN ('DISCOVERED','POSSIBLE_MATCH','IDENTITY_MATCH','ENTITLEMENT_UNCERTAIN','ENTITLEMENT_PROVEN','AUTOMATION_NOT_PERMITTED','OWNER_APPROVAL_REQUIRED','READY_TO_CLAIM','CLAIM_SUBMITTED','CLAIM_ACCEPTED','PAYMENT_PENDING','RECEIVED','SWEPT_TO_APPROVED_DESTINATION','REJECTED','EXPIRED','NOT_OURS','FRAUD_BLOCKED')),
  asset TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  entitlement_proven INTEGER NOT NULL DEFAULT 0 CHECK (entitlement_proven IN (0,1)),
  provider_adapter_id TEXT,
  contract_id TEXT,
  expires_at TEXT,
  priority_score REAL NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  decision_json TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(objective_id) REFERENCES matrix_value_objectives(objective_id),
  FOREIGN KEY(source_id) REFERENCES matrix_value_sources(source_id),
  FOREIGN KEY(jurisdiction_id) REFERENCES matrix_value_jurisdictions(jurisdiction_id),
  FOREIGN KEY(claimant_id) REFERENCES matrix_value_claimants(claimant_id),
  FOREIGN KEY(destination_id) REFERENCES matrix_value_destinations(destination_id),
  CHECK (fee_minor <= amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_matrix_value_opportunities_queue
  ON matrix_value_opportunities(state, priority_score DESC, updated_at);

CREATE TABLE IF NOT EXISTS matrix_value_entitlement_evidence (
  evidence_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  establishes TEXT NOT NULL,
  authority_verified INTEGER NOT NULL DEFAULT 0 CHECK (authority_verified IN (0,1)),
  identity_match_verified INTEGER NOT NULL DEFAULT 0 CHECK (identity_match_verified IN (0,1)),
  ownership_verified INTEGER NOT NULL DEFAULT 0 CHECK (ownership_verified IN (0,1)),
  retrieved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES matrix_value_opportunities(opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_value_evidence_opportunity
  ON matrix_value_entitlement_evidence(opportunity_id, authority_verified, ownership_verified);

CREATE TABLE IF NOT EXISTS matrix_value_claim_queue (
  queue_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  intent_type TEXT NOT NULL CHECK (intent_type IN ('CLAIM_REWARD','SWEEP_RECEIVED_ASSET','WITHDRAW_OWNED_BALANCE')),
  status TEXT NOT NULL CHECK (status IN ('queued','leased','completed','failed','blocked')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES matrix_value_opportunities(opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_value_claim_queue_status
  ON matrix_value_claim_queue(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS matrix_value_operations (
  operation_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  intent_type TEXT NOT NULL CHECK (intent_type IN ('CLAIM_REWARD','SWEEP_RECEIVED_ASSET','WITHDRAW_OWNED_BALANCE')),
  provider_adapter_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  maximum_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (maximum_fee_minor >= 0),
  actual_fee_minor INTEGER CHECK (actual_fee_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('created','submitted','accepted','pending','confirmed','rejected','blocked')),
  idempotency_key TEXT NOT NULL UNIQUE,
  terms_hash TEXT NOT NULL,
  contract_id TEXT,
  receipt_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES matrix_value_opportunities(opportunity_id),
  FOREIGN KEY(destination_id) REFERENCES matrix_value_destinations(destination_id),
  CHECK (actual_fee_minor IS NULL OR actual_fee_minor <= maximum_fee_minor)
);

CREATE TABLE IF NOT EXISTS matrix_value_receipts (
  receipt_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  provider_receipt_reference TEXT NOT NULL,
  asset TEXT NOT NULL,
  gross_amount_minor INTEGER NOT NULL CHECK (gross_amount_minor >= 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_amount_minor INTEGER NOT NULL CHECK (net_amount_minor >= 0),
  destination_id TEXT NOT NULL,
  confirmation_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_count >= 0),
  reconciled INTEGER NOT NULL DEFAULT 0 CHECK (reconciled IN (0,1)),
  received_at TEXT NOT NULL,
  reconciled_at TEXT,
  receipt_json TEXT NOT NULL,
  FOREIGN KEY(operation_id) REFERENCES matrix_value_operations(operation_id),
  FOREIGN KEY(destination_id) REFERENCES matrix_value_destinations(destination_id),
  CHECK (net_amount_minor = gross_amount_minor - fee_minor)
);

CREATE TABLE IF NOT EXISTS matrix_value_audit (
  audit_id TEXT PRIMARY KEY,
  opportunity_id TEXT,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor TEXT NOT NULL,
  reason_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES matrix_value_opportunities(opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_value_audit_opportunity
  ON matrix_value_audit(opportunity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS matrix_value_improvement_proposals (
  proposal_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  opportunity_id TEXT,
  provider_adapter_id TEXT NOT NULL,
  target_path TEXT NOT NULL,
  official_host TEXT NOT NULL,
  source_code TEXT NOT NULL,
  source_sha256 TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('static-tested','sandbox-candidate','quarantined','exported-for-review')),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  test_report_json TEXT NOT NULL DEFAULT '{}',
  immutable_boundaries_json TEXT NOT NULL,
  activation_allowed INTEGER NOT NULL DEFAULT 0 CHECK (activation_allowed = 0),
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES matrix_value_sources(source_id),
  FOREIGN KEY(opportunity_id) REFERENCES matrix_value_opportunities(opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_value_improvement_state
  ON matrix_value_improvement_proposals(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_value_cycles (
  cycle_id TEXT PRIMARY KEY,
  trigger_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','completed-with-findings','failed')),
  target_net_minor INTEGER NOT NULL DEFAULT 1000000 CHECK (target_net_minor > 0),
  received_net_minor INTEGER NOT NULL DEFAULT 0 CHECK (received_net_minor >= 0),
  discovered_count INTEGER NOT NULL DEFAULT 0,
  evaluated_count INTEGER NOT NULL DEFAULT 0,
  ready_count INTEGER NOT NULL DEFAULT 0,
  submitted_count INTEGER NOT NULL DEFAULT 0,
  received_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS matrix_value_learning (
  strategy_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  asset TEXT NOT NULL,
  evaluated_count INTEGER NOT NULL DEFAULT 0 CHECK (evaluated_count >= 0),
  entitlement_proven_count INTEGER NOT NULL DEFAULT 0 CHECK (entitlement_proven_count >= 0),
  received_count INTEGER NOT NULL DEFAULT 0 CHECK (received_count >= 0),
  received_net_minor INTEGER NOT NULL DEFAULT 0 CHECK (received_net_minor >= 0),
  success_rate REAL NOT NULL DEFAULT 0 CHECK (success_rate BETWEEN 0 AND 1),
  net_per_evaluation_minor REAL NOT NULL DEFAULT 0 CHECK (net_per_evaluation_minor >= 0),
  priority_multiplier REAL NOT NULL DEFAULT 1 CHECK (priority_multiplier BETWEEN 0.5 AND 3),
  basis TEXT NOT NULL DEFAULT 'measured-reconciled-receipts-only',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO matrix_value_mandates(
  mandate_id,label,active,auto_collect_proven_entitlements,covered_categories_json,allowed_intents_json,
  maximum_fee_minor,maximum_fee_ratio,maximum_daily_fee_minor,minimum_net_value_minor,
  large_value_confirmation_threshold_minor,policy_json,granted_at,updated_at
) VALUES (
  'owner-standing-auto-collection-v1','Standing mandate: automatically collect proven lawful value',1,1,
  '["ownership","beneficiary","legal_heir","contract","refund","rebate","reward","bounty","grant","credit_balance","unclaimed_property","tax_refund","insurance_proceeds","statutory_finder_award","lawful_appropriation"]',
  '["CLAIM_REWARD","SWEEP_RECEIVED_ASSET","WITHDRAW_OWNED_BALANCE"]',0,0,0,1,NULL,
  '{"entitlement_proof_required":true,"official_source_required":true,"jurisdiction_check_required":true,"approved_destination_required":true,"unclaimed_is_not_ownerless":true,"lawful_appropriation_requires_official_ownerless_determination":true,"llm_confidence_is_not_legal_proof":true,"no_blind_signing":true,"no_new_terms_or_contracts":true}',
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO matrix_value_objectives(
  objective_id,label,target_currency,target_net_minor,received_net_minor,status,deadline_at,created_at,updated_at
) VALUES (
  'value-milestone-eur-10000','First milestone: EUR 10,000 net lawfully received','EUR',1000000,0,'active',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO matrix_value_jurisdictions(
  jurisdiction_id,country_code,label,authority_url,claim_permitted,automation_permitted,automation_level,
  restrictions_json,rules_hash,validated_at,valid_until,status,updated_at
) VALUES
  ('jurisdiction-gb-official-claims','GB','United Kingdom official claim routes','https://www.gov.uk/find-unclaimed-court-money',1,0,1,'["identity-and-entitlement-documents-required","court-or-provider-process-controls-submission"]',NULL,NULL,NULL,'discovery-only',CURRENT_TIMESTAMP),
  ('jurisdiction-fr-ciclade','FR','France Ciclade official claim route','https://ciclade.caissedesdepots.fr/en/discover-ciclade',1,0,1,'["identity-documents-required","possible-match-is-not-entitlement-proof"]',NULL,NULL,NULL,'discovery-only',CURRENT_TIMESTAMP),
  ('jurisdiction-ca-upo','CA','Bank of Canada Unclaimed Properties Office','https://www.unclaimedproperties.bankofcanada.ca/',1,0,1,'["supporting-documents-required","provider-controls-claim-submission"]',NULL,NULL,NULL,'discovery-only',CURRENT_TIMESTAMP),
  ('jurisdiction-us-unclaimed','US','United States official unclaimed money routes','https://www.usa.gov/unclaimed-money',1,0,1,'["agency-or-state-specific-process","identity-and-entitlement-proof-required"]',NULL,NULL,NULL,'discovery-only',CURRENT_TIMESTAMP),
  ('jurisdiction-eu-funding','EU','European Union funding and tender routes','https://ec.europa.eu/info/funding-tenders/opportunities/portal/',1,0,1,'["programme-specific-eligibility","registration-and-proposal-required","award-is-not-entitlement-until-approved"]',NULL,NULL,NULL,'discovery-only',CURRENT_TIMESTAMP),
  ('jurisdiction-fr-business-aid','FR','France business aid and tax credit routes','https://www.entreprises.gouv.fr/espace-entreprises/beneficier-d-une-aide-ou-d-un-credit-d-impot',1,0,1,'["entity-and-project-eligibility-required","declaration-or-application-required","simulation-is-not-legal-proof"]',NULL,NULL,NULL,'discovery-only',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_value_sources(
  source_id,jurisdiction_id,category,provider_name,official_url,terms_url,provider_adapter_id,source_status,
  official_verified,terms_current,terms_hash,validated_terms_hash,last_checked_at,metadata_json,created_at,updated_at
) VALUES
  ('official-gb-unclaimed-court-money','jurisdiction-gb-official-claims','unclaimed_property','GOV.UK','https://www.gov.uk/find-unclaimed-court-money',NULL,NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"collection_mode":"official-manual-route","fee_possible":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-gb-dormant-assets','jurisdiction-gb-official-claims','unclaimed_property','GOV.UK','https://www.gov.uk/government/publications/the-dormant-accounts-scheme',NULL,NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"collection_mode":"provider-reclaim-route"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-fr-ciclade','jurisdiction-fr-ciclade','unclaimed_property','Caisse des Depots Ciclade','https://ciclade.caissedesdepots.fr/en/discover-ciclade','https://ciclade.caissedesdepots.fr/en/vos-questions',NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"collection_mode":"official-account-and-document-route","official_service_free":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-ca-bank-unclaimed','jurisdiction-ca-upo','unclaimed_property','Bank of Canada','https://www.unclaimedproperties.bankofcanada.ca/',NULL,NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"collection_mode":"official-document-upload-route"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-us-unclaimed-money','jurisdiction-us-unclaimed','unclaimed_property','USA.gov','https://www.usa.gov/unclaimed-money',NULL,NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"collection_mode":"state-or-agency-specific-route","finder_fees_not_authorized":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-gb-find-government-grants','jurisdiction-gb-official-claims','grant','UK Cabinet Office Find a Grant','https://find-government-grants.service.gov.uk/grants?limit=100&page=1&skip=0','https://www.gov.uk/guidance/find-government-grants',NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"discovery_adapter":"official-html-links-v1","allowed_host":"find-government-grants.service.gov.uk","link_terms":["grant","funding","competition"],"requires_application":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-gb-innovation-funding','jurisdiction-gb-official-claims','grant','Innovate UK','https://www.gov.uk/apply-funding-innovation',NULL,NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"discovery_adapter":"official-html-links-v1","allowed_host":"gov.uk","link_terms":["funding","innovation","competition"],"requires_application":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-eu-funding-tenders','jurisdiction-eu-funding','grant','European Commission Funding and Tenders Portal','https://ec.europa.eu/info/funding-tenders/opportunities/portal/','https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/about',NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"discovery_adapter":"official-html-links-v1","allowed_host":"ec.europa.eu","link_terms":["funding","call","grant","tender","expert"],"public_api_documentation":"https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/apis","requires_application":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-fr-business-aid','jurisdiction-fr-business-aid','grant','Direction generale des Entreprises','https://www.entreprises.gouv.fr/espace-entreprises/beneficier-d-une-aide-ou-d-un-credit-d-impot',NULL,NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"discovery_adapter":"official-html-links-v1","allowed_host":"entreprises.gouv.fr","link_terms":["aide","credit","innovation","impot","financement"],"requires_application_or_declaration":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('official-fr-bpifrance-calls','jurisdiction-fr-business-aid','grant','Bpifrance','https://www.bpifrance.fr/nos-appels-a-projets-concours',NULL,NULL,'discovery-only',1,0,NULL,NULL,NULL,'{"discovery_adapter":"official-html-links-v1","allowed_host":"bpifrance.fr","link_terms":["appel","projet","concours","candidater","innovation"],"requires_application":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ai_feature_flags(flag_name,enabled,value_json,reason,updated_by,updated_at) VALUES
  ('MATRIX_VALUE_HUNTER_ENABLED',1,'{"target_net_eur":10000,"daily_cycle":true,"official_sources_only":true}', 'Value discovery and evaluation are enabled under the standing owner mandate.', 'migration', CURRENT_TIMESTAMP),
  ('MATRIX_VALUE_AUTO_COLLECTION_ENABLED',1,'{"proven_entitlements_only":true,"approved_destinations_only":true,"constrained_adapters_only":true,"maximum_fee_minor":0}', 'Automatically collect only when deterministic entitlement, current rules, an approved destination and a constrained adapter all pass.', 'migration', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_capabilities(
  capability_id,label,structural_checks_passed,dependencies_reachable,data_connected,evidence_ready,live_verification_passed,state,blocker,checked_at,evidence_json
) VALUES (
  'matrix-value-hunter','Matrix Value Hunter lawful acquisition cycle',1,1,1,1,0,'evidence_ready','No claimant, approved destination or live financial provider adapter is registered yet.',CURRENT_TIMESTAMP,
  '{"target_net_eur":10000,"standing_mandate":true,"entitlement_proof_required":true,"no_keys_or_seeds_in_ai":true,"live_collection":"pending-owner-registry-and-adapter"}'
);
