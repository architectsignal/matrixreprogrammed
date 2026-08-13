import { VALUE_CLASSES, VALUE_INTENT_TYPES } from '../value-hunter-core.mjs';

export const PERMISSIONLESS_VALUE_CLASS = VALUE_CLASSES.PERMISSIONLESS_EARN;
export const CLAIM_BASED_VALUE_CLASS = VALUE_CLASSES.CLAIM_BASED_VALUE;

export const PERMISSIONLESS_STATES = Object.freeze([
  'DISCOVERED', 'UNVERIFIED', 'VERIFIED', 'SIMULATED', 'PROFITABLE', 'WAIT',
  'EXECUTION_QUEUED', 'SUBMITTED', 'CONFIRMED', 'RECONCILED', 'DROPPED', 'BLOCKED', 'PAUSED'
]);

export const PERMISSIONLESS_INTENTS = Object.freeze(VALUE_INTENT_TYPES.filter(value => [
  'EXECUTE_PUBLIC_REWARD', 'EXECUTE_LIQUIDATION', 'EXECUTE_KEEPER_REWARD',
  'EXECUTE_SETTLEMENT_REWARD', 'EXECUTE_AUCTION_REWARD', 'EXECUTE_MAINTENANCE_REWARD',
  'CLAIM_PERMISSIONLESS_REWARD', 'SWEEP_EARNED_PROCEEDS'
].includes(value)));

export const DEFAULT_PERMISSIONLESS_POLICY = Object.freeze({
  enabled: false,
  auto_execution_enabled: false,
  allowed_chains: [],
  allowed_protocols: [],
  allowed_intents: [...PERMISSIONLESS_INTENTS],
  maximum_absolute_execution_cost_usd_micros: 250_000,
  maximum_execution_cost_ratio_ppm: 250_000,
  minimum_expected_net_profit_usd_micros: 50_000,
  minimum_success_probability_ppm: 900_000,
  maximum_daily_execution_budget_usd_micros: 5_000_000,
  maximum_single_execution_loss_usd_micros: 250_000,
  maximum_consecutive_strategy_failures: 3,
  maximum_daily_strategy_loss_usd_micros: 500_000,
  maximum_simulation_age_blocks: 1,
  minimum_confirmations: 1,
  discovery_floor_usd_micros: 1_000
});

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$/;
const SECRET_KEY = /(private.?key|seed.?phrase|mnemonic|password|raw.?signature)/i;
const FORBIDDEN_TEXT = /(credential.?harvest|wallet.?drain|brute.?force|phish|impersonat|access.?control.?bypass|arbitrary.?contract.?call|delegatecall|setapprovalforall|unlimited.?approval)/i;

function text(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function bool(value) { return value === true; }

function containsForbiddenMaterial(value) {
  if (typeof value === 'string') return FORBIDDEN_TEXT.test(value);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) =>
    (SECRET_KEY.test(key) && nested != null && nested !== '') ||
    (FORBIDDEN_TEXT.test(key) && nested === true) ||
    containsForbiddenMaterial(nested)
  );
}

export function stableOpportunityId(input = {}) {
  const parts = [input.chain_id, input.protocol_id, input.market_id, input.position_id, input.action_type, input.detected_block]
    .map(value => text(value, 160).toLowerCase());
  if (parts.some(value => !value)) throw new Error('Permissionless opportunity identity is incomplete');
  return parts.join(':');
}

export function evaluatePermissionlessOpportunity(input = {}, options = {}) {
  const policy = { ...DEFAULT_PERMISSIONLESS_POLICY, ...(options.policy || input.policy || {}) };
  const protocol = input.protocol && typeof input.protocol === 'object' ? input.protocol : {};
  const security = input.security && typeof input.security === 'object' ? input.security : {};
  const strategy = input.strategy && typeof input.strategy === 'object' ? input.strategy : {};
  const simulation = input.simulation && typeof input.simulation === 'object' ? input.simulation : {};
  const blockers = [];
  const chainId = integer(input.chain_id, -1);
  const intent = text(input.intent_type || input.action_type, 80);
  const contractAddress = text(input.contract_address, 80);
  const detectedBlock = integer(input.detected_block, -1);
  const validUntilBlock = integer(input.valid_until_block, -1);
  const simulationBlock = integer(simulation.block_number ?? input.simulation_block, -1);
  const expectedNet = integer(input.expected_net_profit_usd_micros ?? simulation.expected_net_profit_usd_micros, -1);
  const executionCost = integer(input.estimated_total_cost_usd_micros ?? simulation.total_cost_usd_micros, -1);
  const gross = integer(input.estimated_gross_reward_usd_micros ?? simulation.gross_reward_usd_micros, -1);
  const success = integer(input.success_probability_ppm ?? simulation.success_probability_ppm, -1);

  if ((input.value_class || PERMISSIONLESS_VALUE_CLASS) !== PERMISSIONLESS_VALUE_CLASS) blockers.push('wrong-value-class');
  if (!PERMISSIONLESS_INTENTS.includes(intent)) blockers.push('specialized-intent-required');
  if (!Number.isSafeInteger(chainId) || chainId <= 0) blockers.push('invalid-chain');
  if (!ADDRESS.test(contractAddress)) blockers.push('invalid-contract-address');
  if (!bool(input.public_execution_verified)) blockers.push('public-execution-not-verified');
  if (!bool(input.reward_assignment_verified)) blockers.push('executor-reward-not-verified');
  if (!bool(protocol.official_registry_verified) || !HASH.test(text(protocol.registry_source_hash, 80))) blockers.push('official-registry-proof-missing');
  if (!bool(protocol.official_rules_verified) || !HASH.test(text(protocol.rules_source_hash, 80))) blockers.push('official-reward-rules-not-verified');
  if (!bool(protocol.adapter_compatible) || !text(input.adapter_id, 160) || !text(input.adapter_version, 80)) blockers.push('certified-adapter-required');
  if (!bool(protocol.contract_bytecode_verified)) blockers.push('contract-bytecode-not-verified');
  if (bool(input.requires_identity) || bool(input.requires_ownership_claim) || bool(input.requires_third_party_credentials)) blockers.push('claim-or-impersonation-required');
  if (bool(security.unauthorized_exploit) || bool(security.untrusted_contract) || bool(security.blind_signing) || bool(security.unlimited_approval)) blockers.push('unsafe-execution-path');
  if (strategy.auto_killed === true || ['LOSS_MAKING', 'DISABLED'].includes(text(strategy.classification, 40))) blockers.push('strategy-auto-disabled');
  if (integer(strategy.consecutive_failures, 0) >= integer(policy.maximum_consecutive_strategy_failures, 3)) blockers.push('strategy-failure-limit-reached');
  if (integer(strategy.daily_realized_net_profit_usd_micros, 0) < -integer(policy.maximum_daily_strategy_loss_usd_micros, 0)) blockers.push('strategy-daily-loss-limit-reached');
  if (containsForbiddenMaterial({ input, security })) blockers.push('forbidden-action-or-secret-material');
  if (detectedBlock < 0 || validUntilBlock < detectedBlock) blockers.push('invalid-block-validity');
  if (simulation.status !== 'passed' || simulation.deterministic !== true || !HASH.test(text(simulation.hash, 80))) blockers.push('fresh-deterministic-simulation-required');
  if (simulationBlock < detectedBlock || simulationBlock > validUntilBlock) blockers.push('simulation-outside-valid-window');
  const currentBlock = integer(options.current_block ?? input.current_block, simulationBlock);
  if (currentBlock > validUntilBlock) blockers.push('opportunity-stale');
  if (currentBlock - simulationBlock > integer(policy.maximum_simulation_age_blocks, 1)) blockers.push('simulation-stale');
  if (gross < 0 || executionCost < 0 || expectedNet !== gross - executionCost) blockers.push('profit-accounting-invalid');
  if (expectedNet < integer(policy.minimum_expected_net_profit_usd_micros, 0)) blockers.push('minimum-net-profit-not-met');
  if (success < integer(policy.minimum_success_probability_ppm, 0) || success > 1_000_000) blockers.push('success-probability-below-policy');
  if (executionCost > integer(policy.maximum_absolute_execution_cost_usd_micros, 0)) blockers.push('absolute-execution-cost-exceeded');
  if (gross > 0 && Math.floor(executionCost * 1_000_000 / gross) > integer(policy.maximum_execution_cost_ratio_ppm, 0)) blockers.push('execution-cost-ratio-exceeded');
  if (integer(input.daily_cost_used_usd_micros, 0) + executionCost > integer(policy.maximum_daily_execution_budget_usd_micros, 0)) blockers.push('daily-execution-budget-exceeded');
  if (integer(input.maximum_loss_usd_micros ?? executionCost, executionCost) > integer(policy.maximum_single_execution_loss_usd_micros, 0)) blockers.push('single-loss-limit-exceeded');
  if (policy.enabled !== true) blockers.push('permissionless-value-disabled');
  if (!Array.isArray(policy.allowed_chains) || !policy.allowed_chains.map(Number).includes(chainId)) blockers.push('chain-not-allowed');
  if (!Array.isArray(policy.allowed_protocols) || !policy.allowed_protocols.includes(text(input.protocol_id, 120))) blockers.push('protocol-not-allowed');
  if (!Array.isArray(policy.allowed_intents) || !policy.allowed_intents.includes(intent)) blockers.push('intent-not-authorized');

  const unique = [...new Set(blockers)];
  return {
    value_class: PERMISSIONLESS_VALUE_CLASS,
    state: unique.length ? (unique.includes('permissionless-value-disabled') ? 'PAUSED' : 'BLOCKED') : 'PROFITABLE',
    execution_allowed: unique.length === 0,
    claimant_identity_required: false,
    blockers: unique,
    expected_net_profit_usd_micros: expectedNet,
    simulation_block: simulationBlock,
    valid_until_block: validUntilBlock,
    confidence_is_permission_proof: false
  };
}

export const permissionlessCoreInternals = { ADDRESS, HASH, SECRET_KEY, FORBIDDEN_TEXT, text, integer, containsForbiddenMaterial };
