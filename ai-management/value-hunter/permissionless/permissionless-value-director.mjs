import { evaluatePermissionlessOpportunity } from './permissionless-core.mjs';
import { buildTransactionProposal } from './execution-foundation.mjs';

function clean(value, maximum = 300) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum); }

export class MemoryPermissionlessLedger {
  constructor() { this.operations = new Map(); this.receipts = new Map(); this.learning = new Map(); }
  async get(key) { return this.receipts.get(key) || this.operations.get(key); }
  async reserve(key, value) {
    if (this.operations.has(key) || this.receipts.has(key)) return { duplicate: true, value: await this.get(key) };
    this.operations.set(key, { ...value, state: 'EXECUTION_QUEUED' });
    return { duplicate: false };
  }
  async update(key, patch) { this.operations.set(key, { ...(this.operations.get(key) || {}), ...patch }); return this.operations.get(key); }
  async reconcile(key, receipt) {
    if (this.receipts.has(key)) return { duplicate: true, receipt: this.receipts.get(key) };
    this.receipts.set(key, Object.freeze({ ...receipt, idempotency_key: key }));
    this.operations.set(key, { ...(this.operations.get(key) || {}), state: 'RECONCILED' });
    return { duplicate: false, receipt: this.receipts.get(key) };
  }
  async learn(strategy, receipt) {
    const current = this.learning.get(strategy) || { attempts: 0, successes: 0, realized_net_profit_usd_micros: 0 };
    current.attempts += 1; current.successes += receipt.reconciled ? 1 : 0; current.realized_net_profit_usd_micros += Number(receipt.realized_net_profit_usd_micros || 0);
    this.learning.set(strategy, current); return current;
  }
}

export class PermissionlessValueDirector {
  constructor({ policy, registry, adapters = [], simulator, validator, signer, broadcaster, receiptVerifier, ledger = new MemoryPermissionlessLedger(), currentBlock, clock = () => new Date() } = {}) {
    this.policy = policy || {}; this.registry = registry; this.adapters = new Map(adapters.map(adapter => [adapter.adapterId, adapter]));
    this.simulator = simulator; this.validator = validator; this.signer = signer; this.broadcaster = broadcaster; this.receiptVerifier = receiptVerifier;
    this.ledger = ledger; this.currentBlock = currentBlock; this.clock = clock;
  }

  async runCandidate(candidate = {}, context = {}) {
    const idempotencyKey = clean(candidate.idempotency_key || candidate.opportunity_id, 240);
    if (!idempotencyKey) throw new Error('Permissionless execution requires an idempotency key');
    const previous = await this.ledger.get(idempotencyKey);
    if (previous?.state === 'RECONCILED' || previous?.reconciled === true) return { ok: true, duplicate: true, state: 'RECONCILED', receipt: previous };
    const currentBlock = Number(await this.currentBlock?.(candidate.chain_id));
    if (!Number.isSafeInteger(currentBlock)) return { ok: false, state: 'BLOCKED', blockers: ['chain-head-unavailable'] };
    const adapter = this.adapters.get(candidate.adapter_id);
    if (!adapter) return { ok: false, state: 'BLOCKED', blockers: ['adapter-not-installed'] };
    if (adapter.activationState !== 'production-certified' && context.controlled_fixture !== true) return { ok: false, state: 'BLOCKED', blockers: ['adapter-not-production-certified'] };

    const transaction = await adapter.buildLiquidationTransaction(candidate);
    const proposal = buildTransactionProposal({
      proposal_id: `${candidate.opportunity_id}:${currentBlock}`, opportunity_id: candidate.opportunity_id,
      intent_type: candidate.action_type, chain_id: candidate.chain_id, protocol_id: candidate.protocol_id,
      adapter_id: candidate.adapter_id, to: candidate.contract_address, execution_wallet: context.execution_wallet,
      data: transaction.data, value_wei: transaction.value_wei || '0', maximum_gas: transaction.maximum_gas,
      maximum_fee_per_gas_wei: transaction.maximum_fee_per_gas_wei, valid_until_block: candidate.valid_until_block,
      expected_asset_deltas: transaction.expected_asset_deltas
    });
    const simulation = await this.simulator.run(proposal, { current_block: currentBlock });
    const opportunity = {
      ...candidate, current_block: currentBlock, estimated_gross_reward_usd_micros: simulation.gross_reward_usd_micros,
      estimated_total_cost_usd_micros: simulation.total_cost_usd_micros, expected_net_profit_usd_micros: simulation.expected_net_profit_usd_micros,
      success_probability_ppm: simulation.success_probability_ppm, simulation: { ...simulation, block_number: currentBlock }
    };
    const qualification = evaluatePermissionlessOpportunity(opportunity, { policy: this.policy, current_block: currentBlock });
    if (!qualification.execution_allowed) return { ok: true, state: qualification.state, qualification, simulation, executed: false };
    if (this.policy.auto_execution_enabled !== true) return { ok: true, state: 'PROFITABLE', blockers: ['auto-execution-disabled'], qualification, simulation, executed: false };
    const authorization = this.validator.validate(proposal, simulation, { ...context, current_block: currentBlock });
    if (!authorization.allowed) return { ok: true, state: 'BLOCKED', blockers: authorization.blockers, qualification, simulation, executed: false };
    const reservation = await this.ledger.reserve(idempotencyKey, { opportunity_id: candidate.opportunity_id, proposal, simulation, created_at: this.clock().toISOString() });
    if (reservation.duplicate) return { ok: true, duplicate: true, state: reservation.value?.state || 'EXECUTION_QUEUED' };
    const signed = await this.signer.sign(proposal, authorization);
    await this.ledger.update(idempotencyKey, { state: 'SUBMITTED' });
    const receipt = await this.broadcaster.broadcastAndConfirm(signed, { proposal, candidate });
    const verification = this.receiptVerifier.verify(receipt, { chain_id: candidate.chain_id, protocol_id: candidate.protocol_id });
    if (!verification.verified || !verification.reconciled) {
      await this.ledger.update(idempotencyKey, { state: 'CONFIRMED', receipt, verification });
      return { ok: true, state: 'CONFIRMED', executed: true, reconciled: false, receipt, verification };
    }
    const finalReceipt = { ...receipt, reconciled: true, receipt_timestamp: this.clock().toISOString() };
    const reconciled = await this.ledger.reconcile(idempotencyKey, finalReceipt);
    const strategy = `${candidate.protocol_id}:${candidate.chain_id}:${candidate.reward_type || candidate.action_type}`;
    const learning = await this.ledger.learn(strategy, finalReceipt);
    return { ok: true, state: 'RECONCILED', executed: true, reconciled: true, duplicate: reconciled.duplicate, receipt: reconciled.receipt, learning };
  }
}
