import { PERMISSIONLESS_INTENTS } from './permissionless-core.mjs';

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HEX = /^0x[a-fA-F0-9]*$/;
const SECRET = /(private.?key|seed.?phrase|mnemonic|raw.?signature|password|secret)/i;

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function hasSecret(value, path = '') {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => SECRET.test(`${path}.${key}`) || (nested && typeof nested === 'object' && hasSecret(nested, `${path}.${key}`)));
}

export class HarvesterExecutionWallet {
  constructor(config = {}) { this.config = Object.freeze({ ...config }); }

  assess({ chain_id, protocol_id, asset, execution_cost_usd_micros, daily_cost_used_usd_micros = 0, native_balance_wei = 0n } = {}) {
    const blockers = [];
    if (!ADDRESS.test(String(this.config.public_address || ''))) blockers.push('execution-wallet-address-invalid');
    if (!String(this.config.signer_reference || '').startsWith('signer://')) blockers.push('constrained-signer-reference-required');
    if (!this.config.allowed_chains?.map(Number).includes(Number(chain_id))) blockers.push('wallet-chain-not-approved');
    if (!this.config.allowed_protocols?.includes(String(protocol_id))) blockers.push('wallet-protocol-not-approved');
    if (!this.config.allowed_assets?.includes(String(asset))) blockers.push('wallet-asset-not-approved');
    const cost = integer(execution_cost_usd_micros, -1);
    if (cost < 0 || cost > integer(this.config.single_transaction_cap_usd_micros, 0)) blockers.push('single-transaction-cap-exceeded');
    if (daily_cost_used_usd_micros + cost > integer(this.config.daily_spending_cap_usd_micros, 0)) blockers.push('daily-wallet-cap-exceeded');
    if (BigInt(native_balance_wei) < BigInt(this.config.minimum_native_reserve_wei || 0)) blockers.push('gas-reserve-below-minimum');
    return { allowed: blockers.length === 0, blockers, treasury_wallet: false, secret_material_available: false };
  }
}

export function buildTransactionProposal(input = {}) {
  if (hasSecret(input)) throw new Error('Transaction proposal contains secret material');
  if (!PERMISSIONLESS_INTENTS.includes(input.intent_type)) throw new Error('Specialized permissionless intent required');
  if (!Number.isSafeInteger(Number(input.chain_id)) || Number(input.chain_id) <= 0) throw new Error('Transaction chain is invalid');
  if (!ADDRESS.test(String(input.to || '')) || !ADDRESS.test(String(input.execution_wallet || ''))) throw new Error('Transaction addresses are invalid');
  if (!HEX.test(String(input.data || '')) || String(input.data || '').length < 10) throw new Error('Explicit calldata is required');
  if (input.unlimited_approval === true || input.blind_signing === true || input.arbitrary_call === true) throw new Error('Unsafe signing mode forbidden');
  const maximumGas = integer(input.maximum_gas, -1);
  if (maximumGas <= 0) throw new Error('A positive maximum gas limit is required');
  let valueWei;
  let maximumFeePerGasWei;
  try {
    valueWei = BigInt(input.value_wei || '0');
    maximumFeePerGasWei = BigInt(input.maximum_fee_per_gas_wei || '0');
  } catch { throw new Error('Transaction value or fee cap is invalid'); }
  if (valueWei < 0n || maximumFeePerGasWei <= 0n) throw new Error('Transaction value and fee cap are invalid');
  return Object.freeze({
    proposal_id: String(input.proposal_id || ''), opportunity_id: String(input.opportunity_id || ''),
    intent_type: input.intent_type, chain_id: Number(input.chain_id), protocol_id: String(input.protocol_id || ''),
    adapter_id: String(input.adapter_id || ''), to: input.to, execution_wallet: input.execution_wallet,
    data: input.data, value_wei: valueWei.toString(), maximum_gas: maximumGas,
    maximum_fee_per_gas_wei: maximumFeePerGasWei.toString(), valid_until_block: integer(input.valid_until_block, -1),
    expected_asset_deltas: Object.freeze([...(input.expected_asset_deltas || [])]),
    blind_signing: false, unlimited_approval: false, arbitrary_call: false
  });
}

export class TransactionSimulator {
  constructor({ simulate, clock = () => new Date() } = {}) { this.simulate = simulate; this.clock = clock; }

  async run(proposal, { current_block } = {}) {
    if (typeof this.simulate !== 'function') throw new Error('Transaction simulator is not configured');
    const result = await this.simulate(proposal, { current_block });
    const blockers = [];
    if (result?.success !== true) blockers.push('simulation-reverted');
    if (!Number.isSafeInteger(Number(result?.block_number)) || Number(result.block_number) !== Number(current_block)) blockers.push('simulation-not-at-current-block');
    if (!Array.isArray(result?.asset_deltas)) blockers.push('asset-deltas-missing');
    if ((result?.unexpected_approvals || []).length) blockers.push('unexpected-approval');
    if ((result?.unexpected_transfers || []).length) blockers.push('unexpected-transfer');
    if (result?.unexplained_negative_delta === true) blockers.push('unexplained-negative-wallet-delta');
    if (Number(result?.expected_net_profit_usd_micros) <= 0) blockers.push('simulation-not-profitable');
    return Object.freeze({ ...result, status: blockers.length ? 'blocked' : 'passed', deterministic: true, blockers, simulated_at: this.clock().toISOString() });
  }
}

export class PolicyValidator {
  constructor({ registry, policy, wallet } = {}) { this.registry = registry; this.policy = policy || {}; this.wallet = wallet; }

  validate(proposal, simulation, context = {}) {
    const blockers = [];
    const verified = this.registry?.verifyContract?.({
      protocol_id: proposal.protocol_id, chain_id: proposal.chain_id, contract_address: proposal.to,
      discovery_proof: context.discovery_proof
    });
    if (!verified?.verified) blockers.push(verified?.reason || 'contract-not-verified');
    if (simulation?.status !== 'passed') blockers.push('simulation-not-passed');
    if (integer(simulation?.block_number, -1) !== integer(context.current_block, -2)) blockers.push('simulation-stale');
    if (integer(context.current_block, -1) > proposal.valid_until_block) blockers.push('proposal-expired');
    if (!this.policy.allowed_intents?.includes(proposal.intent_type)) blockers.push('intent-outside-standing-authorization');
    const wallet = this.wallet?.assess?.({
      chain_id: proposal.chain_id, protocol_id: proposal.protocol_id, asset: context.gas_asset,
      execution_cost_usd_micros: simulation?.total_cost_usd_micros,
      daily_cost_used_usd_micros: context.daily_cost_used_usd_micros,
      native_balance_wei: context.native_balance_wei
    });
    blockers.push(...(wallet?.blockers || ['execution-wallet-not-configured']));
    return { allowed: blockers.length === 0, blockers: [...new Set(blockers)], contract_verification: verified, wallet };
  }
}

export class ConstrainedSigner {
  constructor({ signExactTransaction, signerReference } = {}) { this.signExactTransaction = signExactTransaction; this.signerReference = signerReference; }

  async sign(proposal, authorization) {
    if (!String(this.signerReference || '').startsWith('signer://')) throw new Error('Constrained signer reference is invalid');
    if (authorization?.allowed !== true || authorization.blockers?.length) throw new Error('Transaction is outside signer policy');
    if (typeof this.signExactTransaction !== 'function') throw new Error('Constrained signer endpoint is unavailable');
    const signed = await this.signExactTransaction(proposal);
    if (!signed || !HEX.test(String(signed.raw_transaction || '')) || String(signed.raw_transaction).length < 20) throw new Error('Signer returned an invalid transaction envelope');
    return { raw_transaction: signed.raw_transaction, proposal_id: proposal.proposal_id, signer_reference: this.signerReference };
  }
}

export class ReceiptVerifier {
  constructor({ minimumConfirmations = 1 } = {}) { this.minimumConfirmations = Math.max(1, integer(minimumConfirmations, 1)); }

  verify(receipt = {}, expected = {}) {
    const blockers = [];
    if (receipt.status !== 'confirmed') blockers.push('transaction-not-confirmed');
    if (!/^0x[a-fA-F0-9]{64}$/.test(String(receipt.transaction_hash || ''))) blockers.push('transaction-hash-invalid');
    if (integer(receipt.confirmations, 0) < this.minimumConfirmations) blockers.push('confirmations-insufficient');
    if (receipt.chain_id !== expected.chain_id || receipt.protocol_id !== expected.protocol_id) blockers.push('receipt-scope-mismatch');
    if (!Array.isArray(receipt.asset_deltas) || receipt.asset_deltas.some(delta => delta.explained !== true)) blockers.push('receipt-delta-unexplained');
    const gross = integer(receipt.realized_gross_reward_usd_micros, -1);
    const cost = integer(receipt.realized_total_cost_usd_micros, -1);
    if (gross < 0 || cost < 0 || integer(receipt.realized_net_profit_usd_micros, Number.NaN) !== gross - cost) blockers.push('realized-profit-accounting-invalid');
    return { verified: blockers.length === 0, blockers, reconciled: blockers.length === 0 && receipt.finalized === true };
  }
}

export const executionFoundationInternals = { ADDRESS, HEX, SECRET, hasSecret };
