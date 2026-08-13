import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handlePermissionlessHarvesterRoute, runPermissionlessHarvesterCycle } from '../src/worker-permissionless-value.js';

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.parameters = []; }
  bind(...parameters) { this.parameters = parameters; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.parameters) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.parameters) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
}

const raw = new DatabaseSync(':memory:');
for (const migration of [
  'migrations/phase9_ai_resource_orchestration.sql', 'migrations/phase10_ai_autonomy.sql',
  'migrations/phase11_local_job_queue.sql', 'migrations/phase12_opportunity_hunter.sql',
  'migrations/phase13_matrix_synergy.sql', 'migrations/public_investigation_api.sql',
  'migrations/phase14_living_matrix.sql', 'migrations/phase15_matrix_value_hunter.sql',
  'migrations/phase16_permissionless_value_harvester.sql'
]) raw.exec(fs.readFileSync(migration, 'utf8'));

const env = {
  MEMBERS_DB: new D1Database(raw), MATRIX_PERMISSIONLESS_VALUE_ENABLED: 'true',
  MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED: 'true', MATRIX_DISTRIBUTED_DISCOVERY_ENABLED: 'true',
  MATRIX_PERMISSIONLESS_MORPHO_ENABLED: 'true', MATRIX_PERMISSIONLESS_EULER_ENABLED: 'false', MATRIX_PERMISSIONLESS_AAVE_ENABLED: 'false',
  MATRIX_PERMISSIONLESS_SIGNER_REFERENCE: 'signer://managed/fixture',
  MATRIX_HARVESTER_EXECUTION_WALLET_REFERENCE: 'vault://managed/fixture-wallet',
  MATRIX_HARVESTER_EXECUTION_WALLET_ADDRESS: `0x${'1'.repeat(40)}`,
  MATRIX_PERMISSIONLESS_RPC_RESOURCES_JSON: JSON.stringify([{ resource_id: 'configured-zero-spend-rpc' }]),
  P0_ALLOWED_CHAINS: '8453', P0_ALLOWED_PROTOCOLS: 'morpho', P0_ALLOWED_INTENTS: 'EXECUTE_LIQUIDATION'
};
const probe = async () => ({ healthy: true, chain_id: 8453, block_number: 123456, contract_code_present: true, rpc_resource_ids: ['rpc-a', 'rpc-b'] });

try {
  const first = await runPermissionlessHarvesterCycle(env, { trigger: 'integration-empty', probe, clock: () => new Date('2026-08-13T12:00:00.000Z') });
  assert.equal(first.ok, true);
  assert.equal(first.report.live_collection_state, 'SIMULATION_ONLY');
  assert.ok(first.report.readiness.blockers.includes('NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER'));
  assert.equal(first.report.reconciled_receipts.realized_net_profit_usd_micros, 0);
  assert.equal(first.report.theoretical_value_counted, false);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_permissionless_cycles').get().count, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM matrix_events WHERE event_type='value.permissionless.cycle.completed'").get().count, 1);
  assert.equal(raw.prepare("SELECT state FROM matrix_capabilities WHERE capability_id='matrix-permissionless-harvester'").get().state, 'evidence_ready');

  const opportunity = 'morpho:8453:fixture-position:123456';
  raw.prepare(`INSERT INTO matrix_permissionless_opportunities(
    opportunity_id,value_class,protocol_key,position_id,reward_type,action_type,state,public_execution_verified,reward_assignment_verified,
    estimated_gross_reward_usd_micros,estimated_total_cost_usd_micros,expected_net_profit_usd_micros,success_probability_ppm,
    detected_block,valid_until_block,detected_at,idempotency_key,evidence_json,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    opportunity, 'P0_PERMISSIONLESS_EARN', 'morpho:8453', 'fixture-position', 'liquidation-incentive', 'EXECUTE_LIQUIDATION', 'RECONCILED', 1, 1,
    500000, 100000, 400000, 950000, 123456, 123457, '2026-08-13T12:01:00.000Z', opportunity, '{}', '2026-08-13T12:01:00.000Z'
  );
  raw.prepare(`INSERT INTO matrix_permissionless_simulations(
    simulation_id,opportunity_id,block_number,state_hash,simulation_hash,status,gross_reward_usd_micros,total_cost_usd_micros,
    expected_net_profit_usd_micros,asset_deltas_json,blockers_json,simulated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'simulation-1', opportunity, 123456, 'a'.repeat(64), 'b'.repeat(64), 'passed', 500000, 100000, 400000, '[]', '[]', '2026-08-13T12:01:01.000Z'
  );
  raw.prepare(`INSERT INTO matrix_permissionless_execution_intents(
    intent_id,opportunity_id,simulation_id,chain_id,protocol_id,intent_type,contract_address,execution_wallet_reference,
    maximum_gas,maximum_cost_usd_micros,valid_until_block,transaction_hash,state,idempotency_key,proposal_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'intent-1', opportunity, 'simulation-1', 8453, 'morpho', 'EXECUTE_LIQUIDATION', '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    'vault://managed/fixture-wallet', 500000, 100000, 123457, `0x${'c'.repeat(64)}`, 'reconciled', opportunity, '{}', '2026-08-13T12:01:02.000Z', '2026-08-13T12:01:03.000Z'
  );
  raw.prepare(`INSERT INTO matrix_permissionless_receipts(
    receipt_id,intent_id,transaction_hash,chain_id,block_number,block_hash,protocol_id,action_type,asset_address,native_quantity,
    gross_reward_usd_micros,realized_total_cost_usd_micros,realized_net_profit_usd_micros,confirmations,finalized,reconciled,
    receipt_json,confirmed_at,reconciled_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'receipt-1', 'intent-1', `0x${'c'.repeat(64)}`, 8453, 123456, `0x${'d'.repeat(64)}`, 'morpho', 'EXECUTE_LIQUIDATION',
    `0x${'2'.repeat(40)}`, '1', 500000, 100000, 400000, 12, 1, 1, '{}', '2026-08-13T12:01:03.000Z', '2026-08-13T12:01:04.000Z'
  );

  const second = await runPermissionlessHarvesterCycle(env, { trigger: 'integration-receipt', probe, clock: () => new Date('2026-08-13T13:00:00.000Z') });
  assert.equal(second.report.reconciled_receipts.count, 1);
  assert.equal(second.report.reconciled_receipts.realized_net_profit_usd_micros, 400000);
  assert.equal(second.report.first_permissionless_receipt.transaction_hash, `0x${'c'.repeat(64)}`);

  const doctor = await handlePermissionlessHarvesterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/permissionless-harvester/doctor'), env);
  assert.equal(doctor.status, 200);
  const doctorBody = await doctor.json();
  assert.equal(doctorBody.reconciled_receipts.realized_net_profit_usd_micros, 400000);
  assert.equal(doctorBody.readiness.ready, false);
  const activity = await handlePermissionlessHarvesterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/permissionless-harvester/activity'), env);
  assert.equal((await activity.json()).cycles.length, 2);

  console.log('Permissionless Harvester Worker integration passed: Phase 16 D1, truthful simulation-only readiness, chain proof, event/capability updates and receipt-only realized accounting.');
} finally {
  raw.close();
}
