PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_permissionless_protocols (
  protocol_key TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL CHECK (chain_id > 0),
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  official_registry_source TEXT NOT NULL,
  official_registry_source_hash TEXT NOT NULL CHECK (length(official_registry_source_hash)=64),
  official_rules_source TEXT NOT NULL,
  official_rules_source_hash TEXT NOT NULL CHECK (length(official_rules_source_hash)=64),
  contracts_json TEXT NOT NULL DEFAULT '[]',
  dynamic_contract_discovery INTEGER NOT NULL DEFAULT 0 CHECK (dynamic_contract_discovery IN (0,1)),
  execution_status TEXT NOT NULL CHECK (execution_status IN ('disabled','simulation','canary','production')),
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(protocol_id, chain_id)
);

CREATE TABLE IF NOT EXISTS matrix_permissionless_markets (
  market_key TEXT PRIMARY KEY,
  protocol_key TEXT NOT NULL,
  market_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  registry_proof_hash TEXT NOT NULL,
  bytecode_hash TEXT NOT NULL,
  oracle_address TEXT,
  oracle_checked_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('discovered','verified','stale','disabled')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(protocol_key) REFERENCES matrix_permissionless_protocols(protocol_key),
  UNIQUE(protocol_key, market_id)
);

CREATE TABLE IF NOT EXISTS matrix_permissionless_opportunities (
  opportunity_id TEXT PRIMARY KEY,
  value_class TEXT NOT NULL CHECK (value_class='P0_PERMISSIONLESS_EARN'),
  protocol_key TEXT NOT NULL,
  market_key TEXT,
  position_id TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('EXECUTE_PUBLIC_REWARD','EXECUTE_LIQUIDATION','EXECUTE_KEEPER_REWARD','EXECUTE_SETTLEMENT_REWARD','EXECUTE_AUCTION_REWARD','EXECUTE_MAINTENANCE_REWARD','CLAIM_PERMISSIONLESS_REWARD','SWEEP_EARNED_PROCEEDS')),
  state TEXT NOT NULL CHECK (state IN ('DISCOVERED','UNVERIFIED','VERIFIED','SIMULATED','PROFITABLE','WAIT','EXECUTION_QUEUED','SUBMITTED','CONFIRMED','RECONCILED','DROPPED','BLOCKED','PAUSED')),
  public_execution_verified INTEGER NOT NULL DEFAULT 0 CHECK (public_execution_verified IN (0,1)),
  reward_assignment_verified INTEGER NOT NULL DEFAULT 0 CHECK (reward_assignment_verified IN (0,1)),
  estimated_gross_reward_usd_micros INTEGER NOT NULL DEFAULT 0,
  estimated_total_cost_usd_micros INTEGER NOT NULL DEFAULT 0,
  expected_net_profit_usd_micros INTEGER NOT NULL DEFAULT 0,
  success_probability_ppm INTEGER NOT NULL DEFAULT 0 CHECK (success_probability_ppm BETWEEN 0 AND 1000000),
  detected_block INTEGER NOT NULL,
  valid_until_block INTEGER NOT NULL,
  detected_at TEXT NOT NULL,
  expires_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(protocol_key) REFERENCES matrix_permissionless_protocols(protocol_key),
  FOREIGN KEY(market_key) REFERENCES matrix_permissionless_markets(market_key)
);

CREATE INDEX IF NOT EXISTS idx_matrix_permissionless_opportunities_queue
  ON matrix_permissionless_opportunities(state, expected_net_profit_usd_micros DESC, valid_until_block);

CREATE TABLE IF NOT EXISTS matrix_permissionless_simulations (
  simulation_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  state_hash TEXT NOT NULL,
  simulation_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('passed','blocked','reverted','rpc-disagreement')),
  gross_reward_usd_micros INTEGER NOT NULL,
  total_cost_usd_micros INTEGER NOT NULL,
  expected_net_profit_usd_micros INTEGER NOT NULL,
  asset_deltas_json TEXT NOT NULL,
  blockers_json TEXT NOT NULL DEFAULT '[]',
  simulated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES matrix_permissionless_opportunities(opportunity_id),
  CHECK (expected_net_profit_usd_micros = gross_reward_usd_micros - total_cost_usd_micros)
);

CREATE TABLE IF NOT EXISTS matrix_permissionless_execution_intents (
  intent_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  simulation_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  protocol_id TEXT NOT NULL,
  intent_type TEXT NOT NULL CHECK (intent_type IN ('EXECUTE_PUBLIC_REWARD','EXECUTE_LIQUIDATION','EXECUTE_KEEPER_REWARD','EXECUTE_SETTLEMENT_REWARD','EXECUTE_AUCTION_REWARD','EXECUTE_MAINTENANCE_REWARD','CLAIM_PERMISSIONLESS_REWARD','SWEEP_EARNED_PROCEEDS')),
  contract_address TEXT NOT NULL,
  execution_wallet_reference TEXT NOT NULL CHECK (execution_wallet_reference LIKE 'vault://%'),
  maximum_gas INTEGER NOT NULL CHECK (maximum_gas >= 0),
  maximum_cost_usd_micros INTEGER NOT NULL CHECK (maximum_cost_usd_micros >= 0),
  valid_until_block INTEGER NOT NULL,
  transaction_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('reserved','signed','submitted','confirmed','reconciled','blocked','failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  proposal_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES matrix_permissionless_opportunities(opportunity_id),
  FOREIGN KEY(simulation_id) REFERENCES matrix_permissionless_simulations(simulation_id)
);

CREATE TABLE IF NOT EXISTS matrix_permissionless_receipts (
  receipt_id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL UNIQUE,
  transaction_hash TEXT NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  asset_address TEXT NOT NULL,
  native_quantity TEXT NOT NULL,
  gross_reward_usd_micros INTEGER NOT NULL,
  realized_total_cost_usd_micros INTEGER NOT NULL,
  realized_net_profit_usd_micros INTEGER NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  finalized INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0,1)),
  reconciled INTEGER NOT NULL DEFAULT 0 CHECK (reconciled IN (0,1)),
  receipt_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  reconciled_at TEXT,
  FOREIGN KEY(intent_id) REFERENCES matrix_permissionless_execution_intents(intent_id),
  CHECK (realized_net_profit_usd_micros = gross_reward_usd_micros - realized_total_cost_usd_micros),
  CHECK (reconciled <= finalized)
);

CREATE TABLE IF NOT EXISTS matrix_permissionless_workers (
  worker_id TEXT PRIMARY KEY,
  worker_class TEXT NOT NULL CHECK (worker_class IN ('PUBLIC_DISCOVERY_WORKER','SIMULATION_WORKER','EXECUTION_NODE')),
  resource_id TEXT NOT NULL,
  network_scopes_json TEXT NOT NULL DEFAULT '[]',
  allowed_hosts_json TEXT NOT NULL DEFAULT '[]',
  secrets_available INTEGER NOT NULL DEFAULT 0 CHECK (secrets_available=0),
  signing_allowed INTEGER NOT NULL DEFAULT 0 CHECK (signing_allowed IN (0,1)),
  maximum_concurrency INTEGER NOT NULL DEFAULT 1 CHECK (maximum_concurrency BETWEEN 1 AND 10000),
  status TEXT NOT NULL CHECK (status IN ('online','offline','quarantined','disabled')),
  statistics_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  CHECK (worker_class='EXECUTION_NODE' OR signing_allowed=0)
);

CREATE TABLE IF NOT EXISTS matrix_permissionless_strategy_statistics (
  strategy_key TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  opportunities_evaluated INTEGER NOT NULL DEFAULT 0,
  profitable_opportunities INTEGER NOT NULL DEFAULT 0,
  executions INTEGER NOT NULL DEFAULT 0,
  reconciled_receipts INTEGER NOT NULL DEFAULT 0,
  realized_net_profit_usd_micros INTEGER NOT NULL DEFAULT 0,
  failed_transaction_cost_usd_micros INTEGER NOT NULL DEFAULT 0,
  compute_milliseconds INTEGER NOT NULL DEFAULT 0,
  classification TEXT NOT NULL CHECK (classification IN ('PROVEN_POSITIVE','PROMISING','MARGINAL','UNPROVEN','LOSS_MAKING','WATCH_ONLY','DISABLED')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_permissionless_cycles (
  cycle_id TEXT PRIMARY KEY,
  trigger_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','completed-with-findings','not-configured','failed')),
  discovered_count INTEGER NOT NULL DEFAULT 0,
  verified_count INTEGER NOT NULL DEFAULT 0,
  profitable_count INTEGER NOT NULL DEFAULT 0,
  submitted_count INTEGER NOT NULL DEFAULT 0,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  reconciled_count INTEGER NOT NULL DEFAULT 0,
  realized_net_profit_usd_micros INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT
);

INSERT OR IGNORE INTO matrix_permissionless_protocols(
  protocol_key,protocol_id,chain_id,adapter_id,adapter_version,official_registry_source,official_registry_source_hash,
  official_rules_source,official_rules_source_hash,contracts_json,dynamic_contract_discovery,execution_status,validated_at,updated_at
) VALUES (
  -- These seed hashes identify canonical source locators. A fetched-content hash
  -- and current bytecode proof remain mandatory before adapter certification.
  'morpho:8453','morpho',8453,'morpho-liquidation-v1','1.0.0-simulation',
  'https://docs.morpho.org/developers/contracts/addresses/','499484b8ac1620a2c0a42e69c84815c0b4d14f1dd8fa9d69c44e540f9d9a1ca3',
  'https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol','c994c9ae72c7c95c2cab8a8c8f07843acf042057a80bfab9c83d741c8b26a56b',
  '["0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"]',1,'simulation',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO ai_feature_flags(flag_name,enabled,value_json,reason,updated_by,updated_at) VALUES
  ('MATRIX_PERMISSIONLESS_VALUE_ENABLED',0,'{"priority":"P0_PERMISSIONLESS_EARN"}','Disabled until live signer, wallet, RPC and certified adapter pass doctor.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED',0,'{"standing_authorization":"bounded-only"}','Real transaction auto-execution is disabled by default.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_DISTRIBUTED_DISCOVERY_ENABLED',0,'{"public_data_only":true,"signing":false}','External discovery remains disabled until scoped resources are registered.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_PERMISSIONLESS_MORPHO_ENABLED',0,'{"chain_id":8453,"mode":"simulation"}','Morpho adapter is simulation-only pending fork proof and canary configuration.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_PERMISSIONLESS_EULER_ENABLED',0,'{"mode":"not-installed"}','Euler is not installed.','migration',CURRENT_TIMESTAMP),
  ('MATRIX_PERMISSIONLESS_AAVE_ENABLED',0,'{"mode":"not-installed"}','Aave is not installed.','migration',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_capabilities(
  capability_id,label,structural_checks_passed,dependencies_reachable,data_connected,evidence_ready,live_verification_passed,state,blocker,checked_at,evidence_json
) VALUES (
  'matrix-permissionless-harvester','Permissionless protocol-defined value acquisition',1,0,0,1,0,'evidence_ready',
  'LIVE_COLLECTION_NOT_CONFIGURED: signer, bounded execution wallet, approved zero-spend RPC and production-certified protocol adapter are required.',CURRENT_TIMESTAMP,
  '{"value_class":"P0_PERMISSIONLESS_EARN","claimant_identity_required":false,"arbitrary_contract_call":false,"morpho":"simulation-only","live_collection":"not-configured"}'
);
