PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_bounty_sources (
  source_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  adapter_id TEXT NOT NULL UNIQUE,
  official_api_url TEXT NOT NULL,
  rules_url TEXT NOT NULL,
  discovery_enabled INTEGER NOT NULL DEFAULT 1 CHECK (discovery_enabled IN (0,1)),
  consequential_actions_enabled INTEGER NOT NULL DEFAULT 0 CHECK (consequential_actions_enabled=0),
  current_rules_sha256 TEXT,
  ai_usage_policy TEXT NOT NULL DEFAULT 'unknown' CHECK (ai_usage_policy IN ('allowed','prohibited','unknown','per-bounty')),
  automation_policy TEXT NOT NULL DEFAULT 'unknown' CHECK (automation_policy IN ('allowed','prohibited','unknown','per-bounty')),
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (current_rules_sha256 IS NULL OR length(current_rules_sha256)=64)
);

CREATE TABLE IF NOT EXISTS matrix_bounties (
  bounty_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  repository TEXT NOT NULL,
  issue_url TEXT NOT NULL,
  bounty_url TEXT NOT NULL,
  reward_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (reward_amount_minor >= 0),
  reward_currency TEXT NOT NULL,
  reward_eur_estimate_minor INTEGER NOT NULL DEFAULT 0 CHECK (reward_eur_estimate_minor >= 0),
  deadline TEXT,
  program_rules_url TEXT,
  program_rules_sha256 TEXT,
  ai_usage_allowed TEXT NOT NULL DEFAULT 'unknown' CHECK (ai_usage_allowed IN ('allowed','prohibited','unknown')),
  automation_allowed TEXT NOT NULL DEFAULT 'unknown' CHECK (automation_allowed IN ('allowed','prohibited','unknown')),
  claim_required INTEGER NOT NULL DEFAULT 0 CHECK (claim_required IN (0,1)),
  claim_status TEXT NOT NULL DEFAULT 'not-claimed',
  claim_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (claim_cost_minor >= 0),
  task_type TEXT NOT NULL,
  skills_required_json TEXT NOT NULL DEFAULT '[]',
  languages_json TEXT NOT NULL DEFAULT '[]',
  estimated_complexity REAL NOT NULL DEFAULT 0 CHECK (estimated_complexity BETWEEN 0 AND 100),
  estimated_compute_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_compute_minutes >= 0),
  estimated_time_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_time_minutes >= 0),
  competition_count INTEGER NOT NULL DEFAULT 0 CHECK (competition_count >= 0),
  acceptance_probability_ppm INTEGER NOT NULL DEFAULT 0 CHECK (acceptance_probability_ppm BETWEEN 0 AND 1000000),
  payment_probability_ppm INTEGER NOT NULL DEFAULT 0 CHECK (payment_probability_ppm BETWEEN 0 AND 1000000),
  expected_net_eur_minor INTEGER NOT NULL DEFAULT 0,
  priority_score REAL NOT NULL DEFAULT 0,
  security_bounty INTEGER NOT NULL DEFAULT 0 CHECK (security_bounty IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('DISCOVERED','NORMALIZED','RULES_CHECK','FEASIBLE','SELECTED','CLAIMED','WORKING','TESTING','READY_TO_SUBMIT','READY_FOR_OWNER_SUBMISSION','SUBMITTED','CHANGES_REQUESTED','ACCEPTED','PAYMENT_PENDING','PAID','RECONCILED','REJECTED','FAILED','EXPIRED')),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  source_evidence_json TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id,external_id),
  FOREIGN KEY(source_id) REFERENCES matrix_bounty_sources(source_id),
  CHECK (program_rules_sha256 IS NULL OR length(program_rules_sha256)=64),
  CHECK (security_bounty=0 OR status NOT IN ('SELECTED','CLAIMED','WORKING','TESTING','READY_TO_SUBMIT','READY_FOR_OWNER_SUBMISSION','SUBMITTED'))
);

CREATE INDEX IF NOT EXISTS idx_matrix_bounties_queue ON matrix_bounties(status,expected_net_eur_minor DESC,priority_score DESC,updated_at);

CREATE TABLE IF NOT EXISTS matrix_bounty_rules_checks (
  check_id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL,
  rules_url TEXT,
  rules_sha256 TEXT,
  rules_current INTEGER NOT NULL DEFAULT 0 CHECK (rules_current IN (0,1)),
  reward_open INTEGER NOT NULL DEFAULT 0 CHECK (reward_open IN (0,1)),
  ai_usage_allowed TEXT NOT NULL CHECK (ai_usage_allowed IN ('allowed','prohibited','unknown')),
  automation_allowed TEXT NOT NULL CHECK (automation_allowed IN ('allowed','prohibited','unknown')),
  payout_terms_ready INTEGER NOT NULL DEFAULT 0 CHECK (payout_terms_ready IN (0,1)),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL,
  FOREIGN KEY(bounty_id) REFERENCES matrix_bounties(bounty_id),
  CHECK (rules_sha256 IS NULL OR length(rules_sha256)=64)
);

CREATE TABLE IF NOT EXISTS matrix_bounty_workspaces (
  workspace_id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL UNIQUE,
  repository TEXT NOT NULL,
  base_sha TEXT,
  branch_name TEXT,
  isolated_workspace_reference TEXT NOT NULL,
  matrix_repository_isolation_verified INTEGER NOT NULL DEFAULT 0 CHECK (matrix_repository_isolation_verified IN (0,1)),
  dependency_install_allowed INTEGER NOT NULL DEFAULT 0 CHECK (dependency_install_allowed IN (0,1)),
  state TEXT NOT NULL CHECK (state IN ('PLANNED','READY','WORKING','TESTING','COMPLETE','FAILED','DISCARDED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(bounty_id) REFERENCES matrix_bounties(bounty_id),
  CHECK (isolated_workspace_reference LIKE 'workspace://%')
);

CREATE TABLE IF NOT EXISTS matrix_bounty_reviews (
  review_id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  reviewer_class TEXT NOT NULL CHECK (reviewer_class IN ('SEPARATE_REVIEW_PASS','OWNER_REVIEW')),
  tests_passing INTEGER NOT NULL DEFAULT 0 CHECK (tests_passing IN (0,1)),
  static_analysis_passing INTEGER NOT NULL DEFAULT 0 CHECK (static_analysis_passing IN (0,1)),
  requirement_coverage_percent REAL NOT NULL DEFAULT 0 CHECK (requirement_coverage_percent BETWEEN 0 AND 100),
  confidence_percent REAL NOT NULL DEFAULT 0 CHECK (confidence_percent BETWEEN 0 AND 100),
  findings_json TEXT NOT NULL DEFAULT '[]',
  decision TEXT NOT NULL CHECK (decision IN ('BLOCK','REWORK','READY_TO_SUBMIT')),
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY(bounty_id) REFERENCES matrix_bounties(bounty_id),
  FOREIGN KEY(workspace_id) REFERENCES matrix_bounty_workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS matrix_bounty_submissions (
  submission_id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_submission_reference TEXT,
  pull_request_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('READY_FOR_OWNER_SUBMISSION','SUBMITTED','CHANGES_REQUESTED','ACCEPTED','REJECTED','PAYMENT_PENDING','PAID')),
  external_write_authorized INTEGER NOT NULL DEFAULT 0 CHECK (external_write_authorized IN (0,1)),
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(bounty_id) REFERENCES matrix_bounties(bounty_id),
  FOREIGN KEY(workspace_id) REFERENCES matrix_bounty_workspaces(workspace_id),
  CHECK (status='READY_FOR_OWNER_SUBMISSION' OR external_write_authorized=1),
  CHECK (status='READY_FOR_OWNER_SUBMISSION' OR external_submission_reference IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS matrix_bounty_receipts (
  bounty_receipt_id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  provider_receipt_reference TEXT NOT NULL UNIQUE,
  asset TEXT NOT NULL,
  gross_amount_minor INTEGER NOT NULL CHECK (gross_amount_minor > 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_amount_minor INTEGER NOT NULL CHECK (net_amount_minor > 0),
  eur_net_minor INTEGER NOT NULL CHECK (eur_net_minor > 0),
  conversion_evidence_json TEXT NOT NULL DEFAULT '{}',
  destination_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  reconciled INTEGER NOT NULL CHECK (reconciled=1),
  reconciled_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(bounty_id) REFERENCES matrix_bounties(bounty_id),
  FOREIGN KEY(submission_id) REFERENCES matrix_bounty_submissions(submission_id),
  FOREIGN KEY(destination_id) REFERENCES matrix_value_destinations(destination_id),
  CHECK (net_amount_minor=gross_amount_minor-fee_minor),
  CHECK (asset='EUR' OR length(conversion_evidence_json)>2)
);

CREATE TABLE IF NOT EXISTS matrix_bounty_repository_profiles (
  repository TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted >= 0),
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid >= 0),
  net_eur_minor INTEGER NOT NULL DEFAULT 0 CHECK (net_eur_minor >= 0),
  acceptance_rate REAL NOT NULL DEFAULT 0 CHECK (acceptance_rate BETWEEN 0 AND 1),
  payout_reliability REAL NOT NULL DEFAULT 0 CHECK (payout_reliability BETWEEN 0 AND 1),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_bounty_platform_profiles (
  platform TEXT PRIMARY KEY,
  payout_identity_ready INTEGER NOT NULL DEFAULT 0 CHECK (payout_identity_ready IN (0,1)),
  terms_accepted INTEGER NOT NULL DEFAULT 0 CHECK (terms_accepted IN (0,1)),
  credential_vault_reference TEXT,
  destination_id TEXT,
  external_writes_enabled INTEGER NOT NULL DEFAULT 0 CHECK (external_writes_enabled IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('NOT_CONFIGURED','DISCOVERY_ONLY','READY_FOR_OWNER_SUBMISSION','ACTIVE')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(destination_id) REFERENCES matrix_value_destinations(destination_id),
  CHECK (credential_vault_reference IS NULL OR credential_vault_reference LIKE 'vault://%'),
  CHECK (external_writes_enabled=0 OR (payout_identity_ready=1 AND terms_accepted=1 AND credential_vault_reference IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS matrix_bounty_learning (
  learning_id TEXT PRIMARY KEY,
  bounty_id TEXT,
  learning_type TEXT NOT NULL CHECK (learning_type IN ('SOURCE_RANKING','TASK_SELECTION','EFFORT_ESTIMATION','ACCEPTANCE','PAYOUT','STOP_RULE')),
  before_json TEXT NOT NULL,
  observation_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  behavior_changed INTEGER NOT NULL DEFAULT 1 CHECK (behavior_changed=1),
  created_at TEXT NOT NULL,
  FOREIGN KEY(bounty_id) REFERENCES matrix_bounties(bounty_id)
);

CREATE TABLE IF NOT EXISTS matrix_bounty_cycles (
  cycle_id TEXT PRIMARY KEY,
  trigger_name TEXT NOT NULL,
  sources_checked INTEGER NOT NULL DEFAULT 0 CHECK (sources_checked >= 0),
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  feasible_count INTEGER NOT NULL DEFAULT 0 CHECK (feasible_count >= 0),
  selected_count INTEGER NOT NULL DEFAULT 0 CHECK (selected_count BETWEEN 0 AND 3),
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count BETWEEN 0 AND 3),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  paid_count INTEGER NOT NULL DEFAULT 0 CHECK (paid_count >= 0),
  reconciled_net_eur_minor INTEGER NOT NULL DEFAULT 0 CHECK (reconciled_net_eur_minor >= 0),
  state TEXT NOT NULL CHECK (state IN ('ENGINE_OPERATIONAL_FIRST_RECEIPT_PENDING','REAL_OPPORTUNITY_IN_PROGRESS','REAL_RECEIPT_VERIFIED','BLOCKED','FAILED')),
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_bounty_owner_actions (
  action_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  action_required TEXT NOT NULL,
  exact_configuration TEXT NOT NULL,
  reason TEXT NOT NULL,
  secret_value_required INTEGER NOT NULL DEFAULT 0 CHECK (secret_value_required IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('OPEN','READY_FOR_OWNER','COMPLETE','NOT_APPLICABLE')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO matrix_bounty_sources(source_id,platform,adapter_id,official_api_url,rules_url,discovery_enabled,consequential_actions_enabled,ai_usage_policy,automation_policy,created_at,updated_at) VALUES
  ('bounty-source-github-projectdiscovery','github-paid-issue','github-paid-issue-v1','https://api.github.com/search/issues','https://github.com/projectdiscovery/oss-bounty-program',1,0,'per-bounty','per-bounty',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('bounty-source-opire-featured','opire','opire-featured-v1','https://api.opire.dev/issues/featured','https://docs.opire.dev/overview/getting-started',1,0,'unknown','unknown',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_bounty_platform_profiles(platform,payout_identity_ready,terms_accepted,credential_vault_reference,destination_id,external_writes_enabled,status,evidence_json,updated_at) VALUES
  ('github-paid-issue',0,0,NULL,NULL,0,'DISCOVERY_ONLY','{"external_writes":false,"scoped_contributor_identity_required":true}',CURRENT_TIMESTAMP),
  ('opire',0,0,NULL,NULL,0,'DISCOVERY_ONLY','{"stripe_payout_onboarding_required":true,"external_writes":false}',CURRENT_TIMESTAMP);

-- Every controlled release starts bounty integrations fail closed. Preserve
-- completed identity, terms, vault and destination setup, but require a later
-- method-scoped authorization before any consequential external write.
UPDATE matrix_bounty_platform_profiles
SET external_writes_enabled=0,
    status=CASE WHEN status='ACTIVE' THEN 'READY_FOR_OWNER_SUBMISSION' ELSE status END,
    evidence_json=json_set(
      CASE WHEN json_valid(evidence_json) THEN evidence_json ELSE '{}' END,
      '$.external_writes',json('false'),
      '$.write_lock_reason','controlled-production-release'
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE external_writes_enabled<>0;

INSERT OR IGNORE INTO matrix_bounty_owner_actions(action_id,platform,action_required,exact_configuration,reason,secret_value_required,status,evidence_json,updated_at) VALUES
  ('bounty-github-identity','github-paid-issue','Provide a Matrix-controlled GitHub contributor identity and a least-privilege token after reviewing each program ruleset.','Store the token in the approved secret vault; set matrix_bounty_platform_profiles.credential_vault_reference to its vault:// reference. Do not store the token in D1 or source.','Claim comments, forks and pull requests are consequential external writes and require attributable authorization.',1,'READY_FOR_OWNER','{"minimum_scope":"repository-specific contents and pull-request permissions only"}',CURRENT_TIMESTAMP),
  ('bounty-opire-payout','opire','Create the Matrix developer profile, accept current Opire terms, and complete its Stripe payout/KYC onboarding.','After onboarding, register the approved EUR-capable destination and vault reference in the Matrix platform profile.','Matrix cannot fabricate identity, KYC, terms acceptance, tax status or payout ownership.',1,'READY_FOR_OWNER','{"official_guide":"https://docs.opire.dev/overview/getting-started"}',CURRENT_TIMESTAMP),
  ('bounty-isolated-workspace','all','Authorize an external-repository workspace root separate from the Matrix repository.','Configure a workspace:// reference mapped by the local Host to a dedicated bounded directory.','Bounty changes must never be developed directly inside the Matrix production repository.',0,'READY_FOR_OWNER','{"matrix_repository_isolation_required":true}',CURRENT_TIMESTAMP),
  ('bounty-rules-ai-permission','all','Verify and hash the current rules for each selected bounty, including explicit AI and automation permission.','Store the 64-character SHA-256 and evidence URL on the bounty rules check. Unknown permission remains blocked.','Program rules vary and cannot be inferred from a generic platform listing.',0,'READY_FOR_OWNER','{"unknown_means_blocked":true}',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ai_feature_flags(flag_name,enabled,value_json,reason,updated_by,updated_at) VALUES
  ('MATRIX_BOUNTY_ENGINE_ENABLED',1,'{"continuous_scout":true,"maximum_active":3,"receipt_only":true}','Enable zero-spend discovery, normalization, evaluation and monitoring.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_BOUNTY_AUTO_CLAIM_ENABLED',0,'{"method_scoped_authorization_required":true}','External claims remain disabled until a platform-specific rules and identity gate passes.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_BOUNTY_AUTO_SUBMISSION_ENABLED',0,'{"separate_review_required":true,"idempotency_required":true}','External submissions remain disabled until scoped delegation and review pass.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_SECURITY_BOUNTY_EXECUTION_ENABLED',0,'{"immutable":true,"authorized_security_testing_required":true}','Security bounty execution is disabled; discovery metadata does not grant testing authority.','migration',CURRENT_TIMESTAMP);

UPDATE ai_feature_flags
SET enabled=0,
    reason='Controlled production release restores fail-closed bounty execution boundaries.',
    updated_by='phase20-repeat-safe-migration',
    updated_at=CURRENT_TIMESTAMP
WHERE flag_name IN (
  'MATRIX_BOUNTY_AUTO_CLAIM_ENABLED',
  'MATRIX_BOUNTY_AUTO_SUBMISSION_ENABLED',
  'MATRIX_SECURITY_BOUNTY_EXECUTION_ENABLED'
);

INSERT OR IGNORE INTO matrix_system_components(component_id,director,implementation,state,capacity_units,reliability,dependencies_json,health_evidence_json,blocker,last_verified_at,updated_at) VALUES
  ('bounty-completion-engine','BountyCompletionDirector','ai-management/value-hunter/bounty/bounty-completion-engine.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-capital-challenge","bounty-source-adapters","isolated-workspace","delegated-github","approved-payout-destination"]','["bounty-completion-engine-contract-test","bounty-worker-integration-test","phase20-migration-rehearsal"]','First real bounty receipt is pending; external claims and submissions are not configured.',NULL,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_capability_graph(capability_id,purpose,status,quality,throughput,dependencies_json,models_json,tools_json,resources_json,tests_json,last_success,last_failure,known_limitations_json,human_dependencies_json,upgrade_candidates_json,replacement_candidates_json,capability_expansion_grants_authority,updated_at) VALUES
  ('bounty-completion-engine','Discover, evaluate, complete and reconcile lawful software bounties.','WORKING_NOT_LIVE',75,1,'["matrix-capital-challenge","isolated-workspace"]','[]','["github-rest-api","opire-featured-api"]','["official-public-bounty-sources"]','["bounty-completion-engine-contract-test","bounty-worker-integration-test"]',NULL,NULL,'["external claiming disabled","first receipt pending"]','["bounty-github-identity","bounty-opire-payout","bounty-rules-ai-permission"]','["verified-fx-adapter","isolated-repository-runner"]','[]',0,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_human_dependencies(dependency_id,capability_id,action_required,reason,recurrence,technically_automatable,upgrade_needed,status,automation_mission_id,evidence_json,created_at,updated_at,resolved_at) VALUES
  ('bounty-github-delegation','bounty-completion-engine','Configure a Matrix-controlled least-privilege GitHub contributor identity after reviewing program rules.','The system cannot create or impersonate a legal contributor identity or accept third-party terms.','one-time-per-platform',0,NULL,'owner-only',NULL,'{"raw_token_storage_forbidden":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),
  ('bounty-payout-onboarding','bounty-completion-engine','Complete provider payout identity, KYC/tax and approved destination onboarding.','Identity verification, tax representations and payout ownership require the responsible human or entity.','one-time-per-platform',0,NULL,'owner-only',NULL,'{"receipt_only_accounting":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),
  ('bounty-workspace-root','bounty-completion-engine','Approve a dedicated external-repository workspace root.','Bounty work must be isolated from the Matrix production repository.','one-time',0,NULL,'owner-only',NULL,'{"workspace_reference_only_in_d1":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL);

INSERT OR IGNORE INTO matrix_permanent_objectives(objective_id,objective,metric,priority,constitutional_law_sha256,active,current_state,evidence_json,updated_at) VALUES
  ('FIRST_VERIFIED_BOUNTY_RECEIPT','Obtain and reconcile the first lawful software bounty receipt using explicitly permitted AI assistance and zero-spend execution.','RECONCILED_BOUNTY_NET_EUR',94,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',1,'WORKING_NOT_LIVE','{"found_is_not_received":true,"maximum_active":3,"security_execution":false}',CURRENT_TIMESTAMP);
