PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_capability_graph (
  capability_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('LIVE_WORKING','WORKING','WORKING_NOT_LIVE','PARTIAL','BROKEN','DEAD','DUPLICATED','MOCK','NOT_CONFIGURED','UNTESTED','BLOCKED','SIMULATION_ONLY')),
  quality REAL NOT NULL DEFAULT 0 CHECK (quality BETWEEN 0 AND 100),
  throughput REAL NOT NULL DEFAULT 0 CHECK (throughput >= 0),
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  models_json TEXT NOT NULL DEFAULT '[]',
  tools_json TEXT NOT NULL DEFAULT '[]',
  resources_json TEXT NOT NULL DEFAULT '[]',
  tests_json TEXT NOT NULL DEFAULT '[]',
  last_success TEXT,
  last_failure TEXT,
  known_limitations_json TEXT NOT NULL DEFAULT '[]',
  human_dependencies_json TEXT NOT NULL DEFAULT '[]',
  upgrade_candidates_json TEXT NOT NULL DEFAULT '[]',
  replacement_candidates_json TEXT NOT NULL DEFAULT '[]',
  capability_expansion_grants_authority INTEGER NOT NULL DEFAULT 0 CHECK (capability_expansion_grants_authority=0),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_capability_graph_status ON matrix_capability_graph(status, quality, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_human_dependencies (
  dependency_id TEXT PRIMARY KEY,
  capability_id TEXT,
  action_required TEXT NOT NULL,
  reason TEXT NOT NULL,
  recurrence TEXT NOT NULL,
  technically_automatable INTEGER NOT NULL CHECK (technically_automatable IN (0,1)),
  upgrade_needed TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','automation-planned','owner-only','resolved')),
  automation_mission_id TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(capability_id) REFERENCES matrix_capability_graph(capability_id),
  FOREIGN KEY(automation_mission_id) REFERENCES matrix_operating_missions(mission_id)
);

CREATE INDEX IF NOT EXISTS idx_matrix_human_dependencies_open ON matrix_human_dependencies(status, technically_automatable, updated_at DESC);

CREATE TABLE IF NOT EXISTS matrix_site_health_checks (
  check_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  surface_id TEXT NOT NULL,
  route TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('WORKING','BROKEN','NOT_CONFIGURED')),
  status_code INTEGER,
  response_bytes INTEGER NOT NULL DEFAULT 0 CHECK (response_bytes >= 0),
  latency_ms REAL NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matrix_site_health_recent ON matrix_site_health_checks(surface_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS matrix_evolution_cycles (
  evolution_cycle_id TEXT PRIMARY KEY,
  operating_cycle_id TEXT NOT NULL UNIQUE,
  signals_json TEXT NOT NULL,
  improvement_missions_json TEXT NOT NULL,
  capability_gaps_json TEXT NOT NULL,
  human_dependency_summary_json TEXT NOT NULL,
  site_health_summary_json TEXT NOT NULL,
  automation_readiness_json TEXT NOT NULL,
  production_self_deploy INTEGER NOT NULL DEFAULT 0 CHECK (production_self_deploy=0),
  status TEXT NOT NULL CHECK (status IN ('completed','completed_with_findings','blocked','failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_acceptance_receipts (
  receipt_id TEXT PRIMARY KEY,
  loop_type TEXT NOT NULL CHECK (loop_type IN ('INVESTIGATION','RESOURCE','SELF_IMPROVEMENT','VALUE','TECHNOLOGY')),
  state TEXT NOT NULL CHECK (state IN ('UNTESTED','PARTIAL','SIMULATION_ONLY','LIVE_VERIFIED','BLOCKED')),
  first_real_receipt INTEGER NOT NULL DEFAULT 0 CHECK (first_real_receipt IN (0,1)),
  external_receipt_reference TEXT,
  before_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  net_value_minor INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  verified_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (state!='LIVE_VERIFIED' OR verified_at IS NOT NULL),
  CHECK (first_real_receipt=0 OR (external_receipt_reference IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS matrix_permanent_objectives (
  objective_id TEXT PRIMARY KEY,
  objective TEXT NOT NULL,
  metric TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 100),
  constitutional_law_sha256 TEXT NOT NULL CHECK (constitutional_law_sha256='2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189'),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  current_state TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO matrix_permanent_objectives(
  objective_id,objective,metric,priority,constitutional_law_sha256,active,current_state,evidence_json,updated_at
) VALUES
  ('MAXIMIZE_AUTHORIZED_EFFECTIVE_CAPACITY','Continuously increase real routable capacity using lawful, authorized and zero-spend-first resources.','MATRIX_EFFECTIVE_POWER',90,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',1,'PARTIAL','{"count_only_real_workload_receipts":true}',CURRENT_TIMESTAMP),
  ('MAXIMIZE_LAWFUL_MATRIX_VALUE','Pursue legitimate value through authorized routes and count only finalized reconciled receipts.','NET_VALUE_ACTUALLY_ADDED_TO_MATRIX',90,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',1,'PARTIAL','{"discovered_is_not_received":true}',CURRENT_TIMESTAMP),
  ('CONTINUOUS_MATRIX_EVOLUTION','Detect weaknesses, stage tested improvements and measure whether future behavior improved.','MATRIX_CAPABILITY_INDEX',95,'2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189',1,'WORKING_NOT_LIVE','{"production_self_deploy":false}',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_system_components(
  component_id,director,implementation,state,capacity_units,reliability,dependencies_json,health_evidence_json,blocker,last_verified_at,updated_at
) VALUES
  ('matrix-evolution-director','MatrixEvolutionDirector','ai-management/matrix-core/matrix-evolution-director.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-capability-graph","matrix-learning-director","protected-self-improvement"]','["matrix-continuous-evolution-contract-test"]','A production evolution-cycle receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('capability-gap-detector','CapabilityGapDetector','ai-management/matrix-core/matrix-evolution-director.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-capability-graph","matrix-operating-missions"]','["matrix-continuous-evolution-contract-test"]','A production gap-to-mission receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('human-dependency-ledger','HumanDependencyLedger','ai-management/matrix-core/matrix-evolution-director.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-human-dependencies"]','["phase18-migration-rehearsal"]','A production dependency-classification receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('matrix-site-operator','MatrixSiteOperator','ai-management/matrix-core/matrix-evolution-director.mjs','WORKING_NOT_LIVE',1,0.75,'["cloudflare-assets","matrix-site-health-checks"]','["matrix-continuous-evolution-worker-integration-test"]','A production read-only surface-probe receipt is required.',NULL,CURRENT_TIMESTAMP),
  ('autonomy-watchdog','AutonomyWatchdog','ai-management/matrix-core/matrix-evolution-director.mjs','WORKING_NOT_LIVE',1,0.75,'["matrix-operating-missions","matrix-evolution-cycles"]','["matrix-continuous-evolution-contract-test"]','A production watchdog receipt is required.',NULL,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_capability_graph(
  capability_id,purpose,status,quality,throughput,dependencies_json,models_json,tools_json,resources_json,tests_json,
  last_success,last_failure,known_limitations_json,human_dependencies_json,upgrade_candidates_json,replacement_candidates_json,
  capability_expansion_grants_authority,updated_at
)
SELECT component_id,'Operate ' || component_id,state,CASE WHEN state='LIVE_WORKING' THEN 100 WHEN state='WORKING_NOT_LIVE' THEN 75 WHEN state='PARTIAL' THEN 50 WHEN state='SIMULATION_ONLY' THEN 30 ELSE 20 END,
  capacity_units,dependencies_json,'[]',json_array(implementation),'[]',health_evidence_json,last_verified_at,NULL,
  CASE WHEN blocker IS NULL THEN '[]' ELSE json_array(blocker) END,'[]','[]','[]',0,CURRENT_TIMESTAMP
FROM matrix_system_components;

INSERT OR IGNORE INTO matrix_human_dependencies(
  dependency_id,capability_id,action_required,reason,recurrence,technically_automatable,upgrade_needed,status,
  automation_mission_id,evidence_json,created_at,updated_at,resolved_at
) VALUES
  ('persist-owner-control-token','owner-local-compute','Persist the existing 64-character admin token in the Windows User environment and restart the host.','A child process cannot retrieve a secret that exists only in another PowerShell process or clipboard.','one-time',0,NULL,'owner-only',NULL,'{"secret_must_not_enter_source":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),
  ('cloudflare-zero-billable-release','cloudflare-production-release','At the next billing period, verify zero billable Cloudflare usage and authorize the controlled deploy.','The repository zero-overage policy records current-period billable Workers build usage and must not be bypassed.','billing-period',0,NULL,'owner-only',NULL,'{"billable_build_minutes":5470,"guard_must_remain_enabled":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),
  ('claimant-and-destination-proof','claim-value-hunter','Register proved claimant authority and an approved destination for a specific official opportunity.','Identity, banking ownership, KYC and terms acceptance cannot be fabricated or silently delegated.','per-provider',0,NULL,'owner-only',NULL,'{"raw_credentials_forbidden":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),
  ('certified-permissionless-adapter','permissionless-value-harvester','Implement and certify one protocol adapter with a fork simulator and receipt decoder.','The existing Morpho adapter is intentionally simulation-only and cannot sign a production transaction.','one-time',1,'Build a protected adapter candidate, fork test, security test, canary and rollback gate.','open',NULL,'{"first_real_matrix_receipt_required":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),
  ('continuous-site-probes','matrix-health-director','Persist bounded site-surface health probes during every Matrix operating cycle.','Existing CI audits are comprehensive but are not yet stored in the live Matrix health spine.','recurring',1,'Connect the canonical site operator to the scheduled Matrix cycle.','automation-planned',NULL,'{"public_read_only_probes":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL);

INSERT OR IGNORE INTO ai_feature_flags(flag_name,enabled,value_json,reason,updated_by,updated_at) VALUES
  ('MATRIX_EVOLUTION_DIRECTOR_ENABLED',1,'{"ranked_improvements":true,"production_self_deploy":false}','Rank safe improvement work from operational signals; all code changes remain inside protected Git/CI/release.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_SITE_OPERATOR_ENABLED',1,'{"read_only_probes":true,"automatic_repairs":"mission-only"}','Run bounded read-only site probes and create internal repair missions from failures.','migration',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_acceptance_receipts(
  receipt_id,loop_type,state,first_real_receipt,external_receipt_reference,before_json,result_json,after_json,net_value_minor,evidence_json,verified_at,created_at
) VALUES
  ('acceptance-investigation-local','INVESTIGATION','PARTIAL',0,NULL,'{}','{"local_contracts_passed":true}','{}',0,'{"production_novel_topic_receipt_required":true}',NULL,CURRENT_TIMESTAMP),
  ('acceptance-resource-owner-local','RESOURCE','PARTIAL',0,NULL,'{}','{"real_zero_spend_local_benchmark_receipt":true,"routing_learning_tested":true}','{}',0,'{"production_routing_change_receipt_required":true}',NULL,CURRENT_TIMESTAMP),
  ('acceptance-self-improvement','SELF_IMPROVEMENT','PARTIAL',0,NULL,'{}','{"protected_staging_and_tests":true}','{}',0,'{"production_release_and_metric_improvement_required":true}',NULL,CURRENT_TIMESTAMP),
  ('acceptance-value','VALUE','SIMULATION_ONLY',0,NULL,'{}','{"receipt_only_accounting":true}','{}',0,'{"first_reconciled_external_receipt_required":true}',NULL,CURRENT_TIMESTAMP),
  ('acceptance-technology','TECHNOLOGY','PARTIAL',0,NULL,'{}','{"sandbox_test_benchmark_security_stages":true}','{}',0,'{"superior_candidate_canary_adoption_receipt_required":true}',NULL,CURRENT_TIMESTAMP);
