PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_constitution (
  constitution_id TEXT PRIMARY KEY CHECK (constitution_id='matrix-law-v1'),
  law_text TEXT NOT NULL CHECK (law_text='CAUSE NO HARM OR LOSS.'),
  law_sha256 TEXT NOT NULL CHECK (law_sha256='2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189'),
  immutable INTEGER NOT NULL DEFAULT 1 CHECK (immutable=1),
  authority_expansion_by_learning INTEGER NOT NULL DEFAULT 0 CHECK (authority_expansion_by_learning=0),
  harm_domains_json TEXT NOT NULL,
  installed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO matrix_constitution(
  constitution_id,law_text,law_sha256,immutable,authority_expansion_by_learning,harm_domains_json,installed_at
) VALUES (
  'matrix-law-v1','CAUSE NO HARM OR LOSS.','2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',1,0,
  '["physical","financial","property","asset","data","privacy","credential","security","reputation","evidence","owner_control","system_integrity","legal","irreversible","destructive","unbounded_third_party"]',CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS matrix_constitution_immutable_update
BEFORE UPDATE ON matrix_constitution
BEGIN
  SELECT RAISE(ABORT,'MATRIX_CONSTITUTION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS matrix_constitution_immutable_delete
BEFORE DELETE ON matrix_constitution
BEGIN
  SELECT RAISE(ABORT,'MATRIX_CONSTITUTION_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS matrix_system_components (
  component_id TEXT PRIMARY KEY,
  director TEXT NOT NULL,
  implementation TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('LIVE_WORKING','WORKING_NOT_LIVE','PARTIAL','BLOCKED','BROKEN','SIMULATION_ONLY','DISABLED')),
  capacity_units REAL NOT NULL DEFAULT 1 CHECK (capacity_units >= 0),
  reliability REAL NOT NULL DEFAULT 0 CHECK (reliability BETWEEN 0 AND 1),
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  health_evidence_json TEXT NOT NULL DEFAULT '[]',
  blocker TEXT,
  last_verified_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_components_state ON matrix_system_components(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_operating_missions (
  mission_id TEXT PRIMARY KEY,
  mission_type TEXT NOT NULL CHECK (mission_type IN ('PRIMARY_OBJECTIVE','RECOVERY_MISSION','SYSTEMIC_FAILURE_MISSION','AUTONOMY_STALL','CAPABILITY_STAGNATION_MISSION','CAPABILITY_GAP_MISSION','RESOURCE_EXPANSION_MISSION','TECHNOLOGY_EVALUATION_MISSION')),
  objective TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 100),
  requirements_json TEXT NOT NULL DEFAULT '[]',
  resources_json TEXT NOT NULL DEFAULT '[]',
  expected_mission_value REAL NOT NULL DEFAULT 0,
  expected_financial_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (expected_financial_value_minor >= 0),
  risk_domains_json TEXT NOT NULL DEFAULT '[]',
  required_permissions_json TEXT NOT NULL DEFAULT '[]',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  success_definition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','blocked','awaiting_owner','completed','failed','cancelled')),
  results_json TEXT NOT NULL DEFAULT '{}',
  learning_json TEXT NOT NULL DEFAULT '{}',
  retry_ladder_json TEXT NOT NULL DEFAULT '[]',
  source_cycle_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matrix_operating_missions_queue ON matrix_operating_missions(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_matrix_operating_missions_type ON matrix_operating_missions(mission_type, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_capability_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL UNIQUE,
  matrix_capability_index REAL NOT NULL CHECK (matrix_capability_index BETWEEN 0 AND 100),
  matrix_effective_power REAL NOT NULL CHECK (matrix_effective_power >= 0),
  raw_capacity_units REAL NOT NULL CHECK (raw_capacity_units >= 0),
  daily_evolution_score REAL NOT NULL,
  windows_json TEXT NOT NULL,
  components_json TEXT NOT NULL,
  lifetime_high REAL NOT NULL CHECK (lifetime_high >= 0),
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_capability_snapshots_time ON matrix_capability_snapshots(recorded_at DESC);

CREATE TABLE IF NOT EXISTS matrix_daily_baselines (
  baseline_date TEXT PRIMARY KEY,
  opening_capability_index REAL NOT NULL,
  opening_effective_power REAL NOT NULL,
  closing_capability_index REAL,
  closing_effective_power REAL,
  evolution_score REAL,
  mission_count INTEGER NOT NULL DEFAULT 0 CHECK (mission_count >= 0),
  completed_mission_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_mission_count >= 0),
  recovery_mission_count INTEGER NOT NULL DEFAULT 0 CHECK (recovery_mission_count >= 0),
  learning_effect_count INTEGER NOT NULL DEFAULT 0 CHECK (learning_effect_count >= 0),
  telemetry_count INTEGER NOT NULL DEFAULT 0 CHECK (telemetry_count >= 0),
  report_json TEXT NOT NULL DEFAULT '{}',
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_learning_effects (
  effect_id TEXT PRIMARY KEY,
  source_cycle_id TEXT,
  domain TEXT NOT NULL,
  before_json TEXT NOT NULL,
  observation_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  expected_result_json TEXT NOT NULL,
  actual_result_json TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('LEARNING','TELEMETRY')),
  changed_future_decision INTEGER NOT NULL CHECK (changed_future_decision IN (0,1)),
  constitutional_boundary_preserved INTEGER NOT NULL DEFAULT 1 CHECK (constitutional_boundary_preserved=1),
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_learning_effects_class ON matrix_learning_effects(classification, recorded_at DESC);

CREATE TABLE IF NOT EXISTS matrix_boot_runs (
  boot_id TEXT PRIMARY KEY,
  trigger_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','healthy','degraded','blocked','failed')),
  constitution_verified INTEGER NOT NULL DEFAULT 0 CHECK (constitution_verified IN (0,1)),
  event_bus_verified INTEGER NOT NULL DEFAULT 0 CHECK (event_bus_verified IN (0,1)),
  manifest_verified INTEGER NOT NULL DEFAULT 0 CHECK (manifest_verified IN (0,1)),
  watchdog_verified INTEGER NOT NULL DEFAULT 0 CHECK (watchdog_verified IN (0,1)),
  immediate_cycle_started INTEGER NOT NULL DEFAULT 0 CHECK (immediate_cycle_started IN (0,1)),
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS matrix_watchdog_events (
  watchdog_id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  observed_state TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  action TEXT NOT NULL CHECK (action IN ('observed','recovery_mission_created','systemic_failure_mission_created','owner_dependency_recorded','resolved')),
  source_mission_id TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL,
  FOREIGN KEY(component_id) REFERENCES matrix_system_components(component_id),
  FOREIGN KEY(source_mission_id) REFERENCES matrix_operating_missions(mission_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_watchdog_recent ON matrix_watchdog_events(severity, recorded_at DESC);

CREATE TABLE IF NOT EXISTS matrix_delegations (
  delegation_id TEXT PRIMARY KEY,
  delegator TEXT NOT NULL,
  delegatee TEXT NOT NULL,
  allowed_actions_json TEXT NOT NULL,
  allowed_scopes_json TEXT NOT NULL DEFAULT '[]',
  allowed_consequence_classes_json TEXT NOT NULL,
  maximum_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (maximum_amount_minor >= 0),
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  secret_reference TEXT CHECK (secret_reference IS NULL OR secret_reference LIKE 'vault://%'),
  constitutional_law_sha256 TEXT NOT NULL CHECK (constitutional_law_sha256='2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_delegations_active ON matrix_delegations(active, starts_at, expires_at);

CREATE TABLE IF NOT EXISTS matrix_action_receipts (
  receipt_id TEXT PRIMARY KEY,
  mission_id TEXT,
  action_type TEXT NOT NULL,
  consequence_class TEXT NOT NULL CHECK (consequence_class IN ('READ_ONLY_PUBLIC','INTERNAL_ANALYSIS','REVERSIBLE_INTERNAL','EXTERNAL_NON_FINANCIAL','FINANCIAL','PRIVILEGED','IRREVERSIBLE','DESTRUCTIVE')),
  delegation_id TEXT,
  constitutional_decision TEXT NOT NULL CHECK (constitutional_decision IN ('AUTHORIZED','REDESIGN_REQUIRED','BLOCKED')),
  execution_state TEXT NOT NULL CHECK (execution_state IN ('evaluated','staged','executed','failed','rolled_back','not_executed')),
  request_hash TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  scope TEXT,
  blockers_json TEXT NOT NULL DEFAULT '[]',
  safeguards_json TEXT NOT NULL DEFAULT '[]',
  external_receipt_reference TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(mission_id) REFERENCES matrix_operating_missions(mission_id),
  FOREIGN KEY(delegation_id) REFERENCES matrix_delegations(delegation_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_action_receipts_decision ON matrix_action_receipts(constitutional_decision, created_at DESC);

INSERT OR IGNORE INTO matrix_delegations(
  delegation_id,delegator,delegatee,allowed_actions_json,allowed_scopes_json,allowed_consequence_classes_json,
  maximum_amount_minor,starts_at,expires_at,active,secret_reference,constitutional_law_sha256,created_at,updated_at
) VALUES
  ('matrix-standing-read-public-v1','owner','MatrixDelegatedActionBroker','["READ_PUBLIC_RECORD","RUN_INTERNAL_CYCLE"]','["public-records","matrix-internal"]','["READ_ONLY_PUBLIC","INTERNAL_ANALYSIS"]',0,'2026-08-13T00:00:00.000Z',NULL,1,NULL,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('matrix-standing-internal-mission-v1','owner','MatrixDelegatedActionBroker','["CREATE_INTERNAL_MISSION","STAGE_CODE_PROPOSAL"]','["matrix-internal","protected-staging"]','["REVERSIBLE_INTERNAL"]',0,'2026-08-13T00:00:00.000Z',NULL,1,NULL,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_system_components(
  component_id,director,implementation,state,capacity_units,reliability,dependencies_json,health_evidence_json,blocker,last_verified_at,updated_at
) VALUES
  ('matrix-constitution','MatrixPolicyEngine','ai-management/matrix-core/matrix-constitution.mjs','WORKING_NOT_LIVE',1,0.75,'["phase17-migration","controlled-cloudflare-release"]','["matrix-operating-system-contract-test","phase17-migration-rehearsal"]','Production deployment and a live boot receipt are pending.',NULL,CURRENT_TIMESTAMP),
  ('matrix-mission-director','MatrixMissionDirector','ai-management/matrix-core/matrix-operating-system.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-event-bus","matrix-constitution","D1"]','["matrix-operating-system-worker-integration-test"]','Production deployment and a live boot receipt are pending.',NULL,CURRENT_TIMESTAMP),
  ('matrix-event-bus','MatrixEventBus','src/matrix-event-emitter.js','PARTIAL',1,0.75,'["D1"]','["phase13-contract","living-matrix-acceptance"]','A current live event receipt is required for LIVE_WORKING.',NULL,CURRENT_TIMESTAMP),
  ('living-matrix','MatrixBootDirector','src/worker-living-matrix.js','PARTIAL',1,0.75,'["matrix-event-bus","D1"]','["living-matrix-acceptance"]','A current live scheduled-cycle receipt is required for LIVE_WORKING.',NULL,CURRENT_TIMESTAMP),
  ('ask-matrix','MatrixEvidenceDirector','src/worker-public-investigation.js','PARTIAL',1,0.75,'["public-evidence-corpus","D1"]','["public-investigation-test"]','A current live investigation receipt is required for LIVE_WORKING.',NULL,CURRENT_TIMESTAMP),
  ('resource-hunter','MatrixResourceDirector','src/worker-opportunity-hunter.js','PARTIAL',1,0.5,'["official-public-sources","zero-spend-resource-broker"]','["capacity-growth-integration-test"]','External capacity counts only after a real eligible workload benchmark.',NULL,CURRENT_TIMESTAMP),
  ('owner-local-compute','MatrixCapabilityGraph','local-agent/matrix-local-host.mjs','PARTIAL',1,0.5,'["owner-token","loopback-model-runtime"]','["local-host-test"]','Capacity is zero until an owner-controlled local model is online and benchmarked.',NULL,CURRENT_TIMESTAMP),
  ('claim-value-hunter','MatrixValueDirector','src/worker-value-hunter.js','PARTIAL',1,0.5,'["official-source","proved-claimant-authority","approved-destination","certified-provider-adapter"]','["value-hunter-worker-integration-test"]','No live provider-specific collection adapter and claimant destination are registered.',NULL,CURRENT_TIMESTAMP),
  ('permissionless-value-harvester','MatrixValueDirector','src/worker-permissionless-value.js','SIMULATION_ONLY',1,1,'["certified-protocol-adapter","bounded-wallet","approved-RPC","gas-reserve"]','["permissionless-harvester-golden-test","phase16-contract-test"]','No production-certified protocol adapter is installed; no transaction can be signed.',NULL,CURRENT_TIMESTAMP),
  ('protected-self-improvement','MatrixArchitectDirector','ai-management/self-improvement/capability-improvement-controller.mjs','PARTIAL',1,0.5,'["benchmark-gate","test-gate","protected-release"]','["capability-improvement-controller-test"]','Generated changes remain staged until tests and protected release pass.',NULL,CURRENT_TIMESTAMP),
  ('matrix-capability-graph','MatrixCapabilityGraph','ai-management/matrix-core/matrix-operating-system.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-system-components","matrix-capability-snapshots"]','["matrix-operating-system-contract-test"]','A production capability snapshot is required.',NULL,CURRENT_TIMESTAMP),
  ('matrix-learning-director','MatrixLearningDirector','ai-management/matrix-core/matrix-operating-system.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-learning-effects"]','["matrix-operating-system-worker-integration-test"]','A production learning-or-telemetry effect receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('matrix-health-director','MatrixHealthDirector','ai-management/matrix-core/matrix-operating-system.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-watchdog-events"]','["matrix-operating-system-worker-integration-test"]','A production watchdog cycle receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('matrix-boot-director','MatrixBootDirector','ai-management/matrix-core/matrix-operating-system.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-constitution","matrix-event-bus","matrix-mission-director"]','["matrix-operating-system-worker-integration-test"]','A production immediate-boot receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('owner-delegation-vault','OwnerDelegationVault','ai-management/matrix-core/matrix-constitution.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-delegations","vault-references-only"]','["matrix-operating-system-contract-test"]','A production delegated-action evaluation receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('matrix-action-broker','MatrixDelegatedActionBroker','ai-management/matrix-core/matrix-constitution.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-constitution","owner-delegation-vault"]','["matrix-operating-system-worker-integration-test"]','A production delegated-action evaluation receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('matrix-technology-director','MatrixTechnologyDirector','ai-management/matrix-core/matrix-operating-system.mjs','PARTIAL',1,0.5,'["zero-spend-resource-hunter","benchmark-gate","protected-release"]','["matrix-operating-system-contract-test"]','No staged technology candidate has yet passed a real benchmark and protected-release gate.',NULL,CURRENT_TIMESTAMP),
  ('matrix-architect-director','MatrixArchitectDirector','ai-management/matrix-core/matrix-operating-system.mjs','PARTIAL',1,0.5,'["test-gate","security-gate","rollback-gate","protected-release"]','["matrix-operating-system-contract-test"]','Code improvements are staged and cannot self-deploy to production.',NULL,CURRENT_TIMESTAMP),
  ('cloudflare-production-release','MatrixActionBroker','.github/workflows/deploy.yml','BLOCKED',1,1,'["healthy-zero-overage-budget-snapshot","owner-workflow-dispatch","cloudflare-credentials"]','["production-deploy-guard"]','Repository zero-overage policy blocks release while Cloudflare build usage is billable, stale, or unknown.',NULL,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ai_feature_flags(flag_name,enabled,value_json,reason,updated_by,updated_at) VALUES
  ('MATRIX_OPERATING_SYSTEM_ENABLED',1,'{"internal_only":true,"consequential_actions_require_delegation":true}','Internal observation, metrics and recovery-mission generation are enabled; consequential execution remains separately gated.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_TECHNOLOGY_EVOLUTION_ENABLED',1,'{"staged_only":true,"production_self_deploy":false}','Zero-spend discovery and staged evaluation are allowed; self-deployment is prohibited.','migration',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_capabilities(
  capability_id,label,structural_checks_passed,dependencies_reachable,data_connected,evidence_ready,live_verification_passed,state,blocker,checked_at,evidence_json
) VALUES (
  'matrix-operating-system','Constitutional Matrix operating system',1,0,0,1,0,'evidence_ready',
  'Phase 17 is implemented and tested locally but requires controlled D1 migration, Worker deployment and a live boot receipt.',CURRENT_TIMESTAMP,
  '{"law":"CAUSE NO HARM OR LOSS.","tamper_resistant_d1":true,"capability_expansion_grants_authority":false,"production_self_deploy":false}'
);
