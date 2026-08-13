import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { permissionlessReadiness, permissionlessWorkerInternals } from '../src/worker-permissionless-value.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/phase16_permissionless_value_harvester.sql');

for (const marker of [
  'matrix_permissionless_protocols', 'matrix_permissionless_markets', 'matrix_permissionless_opportunities',
  'matrix_permissionless_simulations', 'matrix_permissionless_execution_intents', 'matrix_permissionless_receipts',
  'matrix_permissionless_workers', 'matrix_permissionless_strategy_statistics', 'matrix_permissionless_cycles',
  "value_class='P0_PERMISSIONLESS_EARN'", 'EXECUTE_LIQUIDATION', 'expected_net_profit_usd_micros = gross_reward_usd_micros - total_cost_usd_micros',
  "execution_wallet_reference LIKE 'vault://%'", 'reconciled <= finalized',
  'LIVE_COLLECTION_NOT_CONFIGURED', "'morpho:8453'", '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  'A fetched-content hash', 'current bytecode proof'
]) assert.ok(migration.includes(marker), `missing Phase 16 migration marker: ${marker}`);

for (const forbiddenColumn of ['private_key', 'seed_phrase', 'mnemonic', 'recovery_phrase', 'raw_transaction']) {
  assert.equal(new RegExp(`\\b${forbiddenColumn}\\s+(TEXT|BLOB)`, 'i').test(migration), false, `schema must never persist ${forbiddenColumn}`);
}

const production = read('src/worker-production-autonomy.js');
for (const marker of [
  "from './worker-permissionless-value.js'", 'isPermissionlessHarvesterRoute', 'runScheduledPermissionlessHarvester',
  'valueTask.then(() => runScheduledPermissionlessHarvester', 'permissionlessTask.then(() => runScheduledLivingMatrix'
]) assert.ok(production.includes(marker), `missing production orchestration marker: ${marker}`);
const scheduledJoin = [...production.matchAll(/await Promise\.all\(\[([\s\S]*?)\]\);/g)]
  .map(match => match[1])
  .find(value => value.includes('matrixOperationsTask')) || '';
for (const task of ['productionTask', 'autonomyTask', 'recoveryTask', 'opportunityTask', 'capacityTask', 'valueTask', 'permissionlessTask', 'livingTask', 'matrixOperationsTask']) {
  assert.match(scheduledJoin, new RegExp(`\\b${task}\\b`), `scheduled production join is missing ${task}`);
}

const eventCore = read('src/matrix-synergy-core.js');
for (const eventType of ['value.permissionless.reconciled', 'value.permissionless.failed', 'value.permissionless.cycle.completed']) {
  assert.ok(eventCore.includes(eventType), `missing shared Matrix event type: ${eventType}`);
}

const worker = read('src/worker-permissionless-value.js');
for (const marker of [
  '/api/ai-management/admin/permissionless-harvester', 'PRODUCTION_CERTIFIED_ADAPTERS = Object.freeze([])',
  'No transaction is signed by the Worker', 'PERMISSIONLESS_NET_CRYPTO_COLLECTED', 'theoretical_value_counted: false',
  'NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER', 'MATRIX_PERMISSIONLESS_RPC_RESOURCES_JSON'
]) assert.ok(worker.includes(marker), `missing Worker boundary: ${marker}`);

const readiness = permissionlessReadiness({
  MATRIX_PERMISSIONLESS_VALUE_ENABLED: 'true', MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED: 'true',
  MATRIX_DISTRIBUTED_DISCOVERY_ENABLED: 'true', MATRIX_PERMISSIONLESS_SIGNER_REFERENCE: 'signer://managed/harvester',
  MATRIX_HARVESTER_EXECUTION_WALLET_REFERENCE: 'vault://managed/harvester-wallet',
  MATRIX_HARVESTER_EXECUTION_WALLET_ADDRESS: `0x${'1'.repeat(40)}`,
  MATRIX_PERMISSIONLESS_RPC_RESOURCES_JSON: JSON.stringify([{ resource_id: 'fixture' }]),
  P0_ALLOWED_CHAINS: '8453', P0_ALLOWED_PROTOCOLS: 'morpho', P0_ALLOWED_INTENTS: 'EXECUTE_LIQUIDATION'
}, { chain: { healthy: true }, gas: { sufficient: true } });
assert.equal(readiness.ready, false);
assert.equal(readiness.status, 'LIVE_COLLECTION_NOT_CONFIGURED');
assert.ok(readiness.blockers.includes('NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER'));
assert.deepEqual(permissionlessWorkerInternals.PRODUCTION_CERTIFIED_ADAPTERS, []);

const core = read('ai-management/value-hunter/permissionless/permissionless-core.mjs');
for (const marker of ['VALUE_CLASSES.PERMISSIONLESS_EARN', 'claimant_identity_required: false', 'confidence_is_permission_proof: false', 'simulation-stale']) {
  assert.ok(core.includes(marker), `missing permissionless qualification boundary: ${marker}`);
}

const morpho = read('ai-management/value-hunter/permissionless/adapters/morpho-liquidation-v1.mjs');
for (const marker of [
  "activationState: 'simulation-only'", 'Certified Morpho transaction codec is not installed',
  'Morpho fork/RPC simulator is not installed', 'Morpho receipt decoder is not installed',
  'https://docs.morpho.org/developers/contracts/addresses/', 'https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol'
]) assert.ok(morpho.includes(marker), `missing Morpho adapter boundary: ${marker}`);

const cli = read('local-agent/permissionless-harvester-cli.mjs');
for (const marker of ['harvester doctor|start|status', 'secret_material_reported: false', 'NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER']) {
  assert.ok(cli.includes(marker), `missing local CLI boundary: ${marker}`);
}

const toml = read('wrangler.toml');
const jsonc = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
for (const flag of [
  'MATRIX_PERMISSIONLESS_VALUE_ENABLED', 'MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED', 'MATRIX_DISTRIBUTED_DISCOVERY_ENABLED',
  'MATRIX_PERMISSIONLESS_MORPHO_ENABLED', 'MATRIX_PERMISSIONLESS_EULER_ENABLED', 'MATRIX_PERMISSIONLESS_AAVE_ENABLED'
]) {
  assert.ok(toml.includes(`${flag} = "false"`), `${flag} must default false in TOML`);
  assert.equal(jsonc.vars[flag], 'false', `${flag} must default false in JSONC`);
}

console.log('Phase 16 contract passed: isolated permissionless value class, fail-closed production wiring, receipt-only accounting, simulation-only Morpho and disabled-by-default flags.');
