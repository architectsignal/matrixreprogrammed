import assert from 'node:assert/strict';
import { evaluateValueOpportunity } from '../ai-management/value-hunter/value-hunter-core.mjs';
import {
  DEFAULT_PERMISSIONLESS_POLICY, PERMISSIONLESS_VALUE_CLASS, evaluatePermissionlessOpportunity
} from '../ai-management/value-hunter/permissionless/permissionless-core.mjs';
import { ProfitEngine } from '../ai-management/value-hunter/permissionless/profit-engine.mjs';
import { ProtocolRegistry } from '../ai-management/value-hunter/permissionless/protocol-registry.mjs';
import {
  ConstrainedSigner, HarvesterExecutionWallet, PolicyValidator, ReceiptVerifier, TransactionSimulator,
  buildTransactionProposal
} from '../ai-management/value-hunter/permissionless/execution-foundation.mjs';
import {
  DistributedDiscoveryFabric, buildDiscoveryJob, buildWorkerResult
} from '../ai-management/value-hunter/permissionless/distributed-discovery-fabric.mjs';
import { RPCBroker } from '../ai-management/value-hunter/permissionless/rpc-broker.mjs';
import { LiquidationOpportunityEngine } from '../ai-management/value-hunter/permissionless/liquidation-engine.mjs';
import { MorphoLiquidationAdapter, MORPHO_BASE } from '../ai-management/value-hunter/permissionless/adapters/morpho-liquidation-v1.mjs';
import { HistoricalReplayEngine } from '../ai-management/value-hunter/permissionless/historical-replay.mjs';
import { PublicRewardScanner } from '../ai-management/value-hunter/permissionless/public-reward-scanner.mjs';
import { certifyPermissionlessAdapterCandidate } from '../ai-management/value-hunter/permissionless/permissionless-adapter-factory.mjs';
import { MemoryPermissionlessLedger, PermissionlessValueDirector } from '../ai-management/value-hunter/permissionless/permissionless-value-director.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const WALLET = `0x${'1'.repeat(40)}`;
const ASSET = `0x${'2'.repeat(40)}`;
const ORACLE = `0x${'3'.repeat(40)}`;
const MARKET = `0x${'4'.repeat(64)}`;

const policy = {
  ...DEFAULT_PERMISSIONLESS_POLICY,
  enabled: true,
  auto_execution_enabled: true,
  allowed_chains: [8453],
  allowed_protocols: ['morpho'],
  allowed_intents: ['EXECUTE_LIQUIDATION'],
  maximum_absolute_execution_cost_usd_micros: 200_000,
  maximum_daily_execution_budget_usd_micros: 500_000,
  maximum_single_execution_loss_usd_micros: 200_000,
  minimum_expected_net_profit_usd_micros: 50_000,
  minimum_success_probability_ppm: 900_000
};

function candidate(overrides = {}) {
  const base = {
    opportunity_id: 'morpho:8453:market:position:100', idempotency_key: 'morpho:8453:market:position:100',
    value_class: PERMISSIONLESS_VALUE_CLASS, protocol_id: 'morpho', chain_id: 8453,
    contract_address: MORPHO_BASE.core_contract, market_id: MARKET, position_id: WALLET,
    reward_type: 'liquidation-incentive', action_type: 'EXECUTE_LIQUIDATION', intent_type: 'EXECUTE_LIQUIDATION',
    adapter_id: 'fixture-morpho', adapter_version: 'fixture-1', detected_block: 100, valid_until_block: 101,
    public_execution_verified: true, reward_assignment_verified: true,
    requires_identity: false, requires_ownership_claim: false, requires_third_party_credentials: false,
    estimated_gross_reward_usd_micros: 500_000, estimated_total_cost_usd_micros: 100_000,
    expected_net_profit_usd_micros: 400_000, success_probability_ppm: 950_000,
    protocol: {
      official_registry_verified: true, registry_source_hash: HASH_A,
      official_rules_verified: true, rules_source_hash: HASH_B,
      adapter_compatible: true, contract_bytecode_verified: true
    },
    security: { unauthorized_exploit: false, untrusted_contract: false, blind_signing: false, unlimited_approval: false },
    simulation: {
      status: 'passed', deterministic: true, hash: HASH_A, block_number: 100,
      gross_reward_usd_micros: 500_000, total_cost_usd_micros: 100_000,
      expected_net_profit_usd_micros: 400_000, success_probability_ppm: 950_000
    }
  };
  return {
    ...base, ...overrides,
    protocol: { ...base.protocol, ...(overrides.protocol || {}) },
    security: { ...base.security, ...(overrides.security || {}) },
    simulation: { ...base.simulation, ...(overrides.simulation || {}) }
  };
}

const qualified = evaluatePermissionlessOpportunity(candidate(), { policy, current_block: 100 });
assert.equal(qualified.execution_allowed, true);
assert.equal(qualified.claimant_identity_required, false, 'protocol execution must not inherit claimant identity requirements');
assert.equal(qualified.confidence_is_permission_proof, false);

const claimBased = evaluateValueOpportunity({
  legal_basis: 'refund', amount_minor: 100, claimant: {}, entitlement: {}, source: {}, jurisdiction: {}, destination: {}, provider: {}, security: {}
});
assert.notEqual(claimBased.state, 'READY_TO_CLAIM', 'claim-based collection remains claimant/entitlement gated');

for (const [mutate, blocker] of [
  [{ public_execution_verified: false }, 'public-execution-not-verified'],
  [{ reward_assignment_verified: false }, 'executor-reward-not-verified'],
  [{ valid_until_block: 99 }, 'invalid-block-validity'],
  [{ requires_identity: true }, 'claim-or-impersonation-required'],
  [{ security: { unauthorized_exploit: true } }, 'unsafe-execution-path'],
  [{ security: { unlimited_approval: true } }, 'unsafe-execution-path'],
  [{ strategy: { classification: 'LOSS_MAKING' } }, 'strategy-auto-disabled'],
  [{ strategy: { consecutive_failures: 3 } }, 'strategy-failure-limit-reached'],
  [{ private_key: 'forbidden' }, 'forbidden-action-or-secret-material'],
  [{ estimated_total_cost_usd_micros: 499_999, expected_net_profit_usd_micros: 1 }, 'minimum-net-profit-not-met'],
  [{ simulation: { block_number: 98 } }, 'simulation-outside-valid-window']
]) {
  const result = evaluatePermissionlessOpportunity(candidate(mutate), { policy, current_block: 100 });
  assert.equal(result.execution_allowed, false);
  assert.ok(result.blockers.includes(blocker), `expected blocker ${blocker}`);
}
assert.ok(evaluatePermissionlessOpportunity(candidate(), { policy: { ...policy, enabled: false }, current_block: 100 }).blockers.includes('permissionless-value-disabled'));

const profit = new ProfitEngine().calculate({
  gross_reward_usd_micros: 500_000, gas_usd_micros: 40_000, swap_fee_usd_micros: 10_000,
  dex_fee_usd_micros: 10_000, slippage_usd_micros: 10_000, flash_liquidity_fee_usd_micros: 10_000,
  bridge_cost_usd_micros: 0, rpc_execution_cost_usd_micros: 0, expected_failed_transaction_cost_usd_micros: 10_000,
  capital_opportunity_cost_usd_micros: 10_000, success_probability_ppm: 950_000
});
assert.equal(profit.total_cost_usd_micros, 100_000);
assert.equal(profit.expected_net_profit_usd_micros, 400_000);
assert.equal(profit.expected_value_usd_micros, 380_000);

const registry = new ProtocolRegistry([{
  protocol_id: 'morpho', chain_id: 8453, adapter_id: 'fixture-morpho', adapter_version: 'fixture-1',
  official_registry_source: MORPHO_BASE.official_registry_source, official_rules_source: MORPHO_BASE.official_rules_source,
  registry_source_hash: HASH_A, rules_source_hash: HASH_B, contracts: [MORPHO_BASE.core_contract], status: 'simulation'
}]);
assert.equal(registry.verifyContract({ protocol_id: 'morpho', chain_id: 8453, contract_address: MORPHO_BASE.core_contract }).verified, true);
assert.equal(registry.verifyContract({ protocol_id: 'morpho', chain_id: 8453, contract_address: WALLET }).verified, false);

assert.throws(() => buildTransactionProposal({ ...candidate(), to: MORPHO_BASE.core_contract, execution_wallet: WALLET, data: '0x12345678', private_key: 'forbidden' }), /secret material/);
assert.throws(() => buildTransactionProposal({ ...candidate(), to: MORPHO_BASE.core_contract, execution_wallet: WALLET, data: '0x12345678', maximum_gas: 0, maximum_fee_per_gas_wei: '1' }), /maximum gas/);
const wallet = new HarvesterExecutionWallet({
  public_address: WALLET, signer_reference: 'signer://fixture', allowed_chains: [8453], allowed_protocols: ['morpho'],
  allowed_assets: ['ETH'], single_transaction_cap_usd_micros: 200_000, daily_spending_cap_usd_micros: 500_000,
  minimum_native_reserve_wei: '1000'
});
assert.equal(wallet.assess({ chain_id: 8453, protocol_id: 'morpho', asset: 'ETH', execution_cost_usd_micros: 100_000, native_balance_wei: 1000n }).allowed, true);
assert.ok(wallet.assess({ chain_id: 8453, protocol_id: 'morpho', asset: 'ETH', execution_cost_usd_micros: 200_001, native_balance_wei: 1000n }).blockers.includes('single-transaction-cap-exceeded'));

const discoveryJob = await buildDiscoveryJob({
  job_id: 'public-morpho-scan-100', workload: 'permissionless.scan', data_class: 'public',
  payload: { chain_id: 8453, from_block: 99, to_block: 100 }, network_scopes: ['PUBLIC_RPC_READ'], allowed_hosts: ['base.example']
});
const publicWorker = {
  resource_id: 'worker-1', owner_authorized: true, approved_for_automation: true, billing_enabled: false,
  payment_method_present: false, monetary_cost_per_unit_eur: 0, billing_risk: 'none', public_retrieval_only: true,
  secrets_available: false, signing_allowed: false, supported_workloads: ['permissionless.scan'],
  network_scopes: ['PUBLIC_RPC_READ'], allowed_hosts: ['base.example']
};
const fabric = new DistributedDiscoveryFabric({ centralVerify: async output => ({ verified: output.positions === 1, output }) });
const workerResult = await buildWorkerResult(discoveryJob, { positions: 1 }, publicWorker.resource_id);
assert.equal((await fabric.acceptResult(discoveryJob, publicWorker, workerResult)).accepted, true);
assert.equal((await fabric.acceptResult(discoveryJob, publicWorker, workerResult)).duplicate, true);
await assert.rejects(() => buildDiscoveryJob({ ...discoveryJob, payload: { signer_token: 'forbidden' } }), /sensitive material/);
assert.equal((await new DistributedDiscoveryFabric({ centralVerify: async () => ({ verified: true }) }).acceptResult(discoveryJob, { ...publicWorker, signing_allowed: true }, workerResult)).accepted, false);

const rpcResources = ['one', 'two'].map((host, index) => ({
  resource_id: `rpc-${host}`, chain_id: 8453, endpoint: `https://${host}.example/rpc`, billing_enabled: false,
  payment_method_present: false, monetary_cost_per_unit_eur: 0, billing_risk: 'none', approved_for_automation: true,
  quota_verified: true, network_scopes: ['PUBLIC_RPC_READ'], allowed_hosts: [`${host}.example`], average_latency: index
}));
const rpcCalls = [];
const rpc = new RPCBroker(rpcResources, { fetchImpl: async url => {
  rpcCalls.push(url);
  if (url.includes('one.example')) return new Response('{}', { status: 503 });
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x64' }), { status: 200, headers: { 'content-type': 'application/json' } });
} });
assert.equal((await rpc.call(8453, 'eth_blockNumber')).result, '0x64');
assert.equal(rpcCalls.length, 2, 'RPC broker must fail over across approved zero-spend resources');
await assert.rejects(() => rpc.call(8453, 'eth_sendRawTransaction', []), /read-only allowlisted/);

const morpho = new MorphoLiquidationAdapter({
  dataProvider: {
    async discoverMarkets() { return [{ market_id: MARKET, loan_token: ASSET, collateral_token: WALLET, oracle: ORACLE, whitelist_verified: true, oracle_fresh: true, lltv_wad: '800000000000000000' }]; },
    async getBorrowPositions() { return [{ position_id: WALLET, borrower: WALLET, collateral_assets: '100', collateral_value_loan_assets: '100', borrow_assets: '90', borrow_shares: '90', repay_assets: '90', seizable_collateral_assets: '95', collateral_value_usd_micros: 600_000, repay_value_usd_micros: 100_000, success_probability_ppm: 950_000, gas_usd_micros: 100_000 }]; }
  }
});
const found = await new LiquidationOpportunityEngine({ adapters: [morpho] }).discover({ protocol_id: 'morpho', adapter_id: morpho.adapterId, chain_id: 8453, detected_block: 100, valid_until_block: 101 });
assert.equal(found.length, 1);
assert.equal(found[0].profit.expected_net_profit_usd_micros, 400_000);
assert.equal(morpho.activationState, 'simulation-only');
await assert.rejects(() => morpho.buildLiquidationTransaction(found[0]), /Certified Morpho transaction codec is not installed/);

const scanner = new PublicRewardScanner({ clock: () => new Date('2026-08-13T00:00:00Z') });
const scan = scanner.scan([{ discovery_id: 'doc-1', title: 'Keeper reward', official_source: true, url: MORPHO_BASE.official_rules_source, source_hash: HASH_A }]);
assert.equal(scan[0].execution_eligible, false);

const replay = new HistoricalReplayEngine({ policy }).replay([
  { ...candidate(), fixture_id: 'captured', current_block: 100, realized_net_profit_usd_micros: 300_000 },
  { ...candidate({ opportunity_id: 'other', idempotency_key: 'other' }), fixture_id: 'raced', current_block: 100, competitor_captured_first: true }
]);
assert.equal(replay.profitable_opportunities, 2);
assert.equal(replay.realistic_simulated_profit_usd_micros, 300_000);
assert.equal(replay.strategy_classification, 'PROMISING');

const certifiedCandidate = certifyPermissionlessAdapterCandidate({
  protocol_id: 'morpho', adapter_id: 'candidate', official_docs_source: MORPHO_BASE.official_rules_source,
  official_registry_source: MORPHO_BASE.official_registry_source, docs_source_hash: HASH_A, registry_source_hash: HASH_B,
  source_code: 'export function decode() {}', tests: { static_analysis: 'passed', unit_tests: 'passed', fork_simulation: 'passed', historical_replay: 'passed', security_tests: 'passed' }
});
assert.equal(certifiedCandidate.certified_candidate, true);
assert.equal(certifiedCandidate.activation_allowed, false, 'self-generated adapters require protected release');

const simulator = new TransactionSimulator({ simulate: async (_proposal, { current_block }) => ({
  success: true, block_number: current_block, hash: HASH_A, asset_deltas: [{ asset: ASSET, delta: '1' }],
  unexpected_approvals: [], unexpected_transfers: [], unexplained_negative_delta: false,
  gross_reward_usd_micros: 500_000, total_cost_usd_micros: 100_000,
  expected_net_profit_usd_micros: 400_000, success_probability_ppm: 950_000
}) });
const validator = new PolicyValidator({ registry, policy, wallet });
const signer = new ConstrainedSigner({ signerReference: 'signer://fixture', signExactTransaction: async () => ({ raw_transaction: `0x${'a'.repeat(100)}` }) });
const receiptVerifier = new ReceiptVerifier({ minimumConfirmations: 2 });
let broadcasts = 0;
const ledger = new MemoryPermissionlessLedger();
const adapter = {
  adapterId: 'fixture-morpho', activationState: 'simulation-only',
  async buildLiquidationTransaction() { return { data: '0x12345678', value_wei: '0', maximum_gas: 500_000, maximum_fee_per_gas_wei: '100', expected_asset_deltas: [{ asset: ASSET, minimum_delta: '1' }] }; }
};
const director = new PermissionlessValueDirector({
  policy, registry, adapters: [adapter], simulator, validator, signer, receiptVerifier, ledger,
  currentBlock: async () => 100,
  broadcaster: { async broadcastAndConfirm() { broadcasts += 1; return {
    status: 'confirmed', transaction_hash: `0x${'c'.repeat(64)}`, confirmations: 2, chain_id: 8453, protocol_id: 'morpho',
    asset_deltas: [{ asset: ASSET, explained: true }], realized_gross_reward_usd_micros: 500_000,
    realized_total_cost_usd_micros: 100_000, realized_net_profit_usd_micros: 400_000, finalized: true
  }; } }
});
const lifecycleCandidate = { ...candidate(), adapter_id: 'fixture-morpho' };
const lifecycle = await director.runCandidate(lifecycleCandidate, { controlled_fixture: true, execution_wallet: WALLET, gas_asset: 'ETH', native_balance_wei: 1000n, daily_cost_used_usd_micros: 0 });
assert.equal(lifecycle.state, 'RECONCILED');
assert.equal(lifecycle.receipt.realized_net_profit_usd_micros, 400_000);
assert.equal((await director.runCandidate(lifecycleCandidate, { controlled_fixture: true })).duplicate, true);
assert.equal(broadcasts, 1, 'idempotency must prevent a second broadcast');
assert.equal(ledger.learning.get('morpho:8453:liquidation-incentive').attempts, 1);
assert.equal(receiptVerifier.verify({ ...lifecycle.receipt, confirmations: 0 }, { chain_id: 8453, protocol_id: 'morpho' }).verified, false);

const notCertified = await new PermissionlessValueDirector({ ...director, adapters: [adapter], currentBlock: async () => 100 }).runCandidate({ ...lifecycleCandidate, idempotency_key: 'not-certified' }, { execution_wallet: WALLET });
assert.ok(notCertified.blockers.includes('adapter-not-production-certified'));

console.log('Permissionless Harvester golden tests passed: separate value class, exact profit, protocol proof, constrained wallet/signer, public workers, RPC failover, Morpho simulation, replay, protected code improvement and exactly-once reconciliation.');
