import { assertValueTransition, evaluateValueOpportunity } from './value-hunter-core.mjs';
import { buildConstrainedIntent, validateFinancialIntent } from './financial-firewall.mjs';

function clean(value, maximum = 300) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export class ValueProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map(providers.map(provider => [provider.adapterId, provider]));
  }
  get(adapterId) { return this.providers.get(adapterId); }
  approvedAdapterIds() { return [...this.providers.keys()]; }
}

function addTransition(transitions, from, to, receipt = {}) {
  assertValueTransition(from, to);
  transitions.push({ from, to, receipt });
  return to;
}

export async function collectProvenValue(input = {}, dependencies = {}) {
  const evaluation = evaluateValueOpportunity(input, { mandate: dependencies.mandate, now: dependencies.now });
  const initialState = input.state || 'DISCOVERED';
  const transitions = [];
  if (!evaluation.auto_collect) {
    if (initialState !== evaluation.state) addTransition(transitions, initialState, evaluation.state, { reasons: evaluation.reasons });
    return { ok: true, collected: false, state: evaluation.state, evaluation, transitions };
  }
  let state = initialState;
  if (state !== 'READY_TO_CLAIM') state = addTransition(transitions, state, 'READY_TO_CLAIM', { evaluation: evaluation.reasons });
  const idempotencyKey = clean(input.idempotency_key, 200);
  if (!idempotencyKey) throw new Error('Collection requires an idempotency key');
  const existing = await dependencies.ledger?.get?.(idempotencyKey);
  if (existing) return { ok: true, collected: false, duplicate: true, state: existing.state, receipt: existing, evaluation, transitions };

  const adapterId = clean(input.provider?.adapter_id, 160);
  const provider = dependencies.providers?.get?.(adapterId);
  if (!provider || typeof provider.claim !== 'function') {
    state = addTransition(transitions, state, 'AUTOMATION_NOT_PERMITTED', { reason: 'approved-provider-adapter-unavailable' });
    return { ok: true, collected: false, state, evaluation, transitions };
  }
  const claimIntent = buildConstrainedIntent({
    intent_id: `${idempotencyKey}:claim`, intent_type: input.claim_intent_type || 'CLAIM_REWARD',
    opportunity_id: input.opportunity_id, claimant_id: input.claimant?.claimant_id,
    provider_adapter_id: adapterId, destination_id: input.destination?.destination_id,
    asset: input.currency || input.asset, amount_minor: Number(input.amount_minor || 0),
    maximum_fee_minor: Number(input.fee_minor || 0), contract_id: input.contract_id || null,
    idempotency_key: idempotencyKey, terms_hash: input.source?.terms_hash
  });
  const firewall = validateFinancialIntent(claimIntent, {
    mandate: dependencies.mandate,
    destinations: [input.destination],
    approved_provider_adapters: dependencies.providers.approvedAdapterIds(),
    approved_contracts: dependencies.approvedContracts || []
  });
  if (!firewall.allowed) {
    state = addTransition(transitions, state, 'FRAUD_BLOCKED', { blockers: firewall.blockers });
    return { ok: true, collected: false, state, evaluation, firewall, transitions };
  }

  const claimReceipt = await provider.claim(claimIntent);
  state = addTransition(transitions, state, 'CLAIM_SUBMITTED', { receipt_id: clean(claimReceipt?.receipt_id, 160) });
  if (!claimReceipt || !['accepted', 'pending', 'received'].includes(claimReceipt.status)) {
    state = addTransition(transitions, state, 'REJECTED', { provider_status: clean(claimReceipt?.status || 'invalid-receipt', 80) });
    return { ok: true, collected: false, state, evaluation, firewall, transitions };
  }
  if (claimReceipt.status === 'accepted') state = addTransition(transitions, state, 'CLAIM_ACCEPTED', { receipt_id: claimReceipt.receipt_id });
  if (claimReceipt.status === 'pending') state = addTransition(transitions, state, 'PAYMENT_PENDING', { receipt_id: claimReceipt.receipt_id });
  if (claimReceipt.status !== 'received') return { ok: true, collected: false, state, evaluation, firewall, claim_receipt: claimReceipt, transitions };
  state = addTransition(transitions, state, 'RECEIVED', { receipt_id: claimReceipt.receipt_id, amount_minor: claimReceipt.amount_minor });

  let sweepReceipt = null;
  if (input.sweep_required === true) {
    if (!dependencies.signer || typeof dependencies.signer.executeIntent !== 'function') {
      state = addTransition(transitions, state, 'OWNER_APPROVAL_REQUIRED', { reason: 'constrained-signer-unavailable' });
      return { ok: true, collected: true, state, evaluation, firewall, claim_receipt: claimReceipt, transitions };
    }
    const sweepIntent = buildConstrainedIntent({
      ...claimIntent, intent_id: `${idempotencyKey}:sweep`, intent_type: 'SWEEP_RECEIVED_ASSET',
      amount_minor: Number(claimReceipt.amount_minor || input.amount_minor || 0), idempotency_key: `${idempotencyKey}:sweep`
    });
    const sweepFirewall = validateFinancialIntent(sweepIntent, {
      mandate: dependencies.mandate,
      destinations: [input.destination], approved_provider_adapters: dependencies.providers.approvedAdapterIds(),
      approved_contracts: dependencies.approvedContracts || []
    });
    if (!sweepFirewall.allowed) {
      state = addTransition(transitions, state, 'FRAUD_BLOCKED', { blockers: sweepFirewall.blockers });
      return { ok: true, collected: true, state, evaluation, firewall: sweepFirewall, claim_receipt: claimReceipt, transitions };
    }
    sweepReceipt = await dependencies.signer.executeIntent(sweepIntent);
    if (!sweepReceipt || sweepReceipt.status !== 'confirmed') {
      state = addTransition(transitions, state, 'OWNER_APPROVAL_REQUIRED', { reason: 'sweep-not-confirmed' });
      return { ok: true, collected: true, state, evaluation, claim_receipt: claimReceipt, sweep_receipt: sweepReceipt, transitions };
    }
  }
  state = addTransition(transitions, state, 'SWEPT_TO_APPROVED_DESTINATION', { receipt_id: sweepReceipt?.receipt_id || claimReceipt.receipt_id });
  const finalReceipt = {
    idempotency_key: idempotencyKey, state, opportunity_id: input.opportunity_id,
    amount_minor: Number(claimReceipt.amount_minor || input.amount_minor || 0), fee_minor: Number(claimReceipt.fee_minor || input.fee_minor || 0),
    destination_id: input.destination?.destination_id, claim_receipt_id: claimReceipt.receipt_id,
    sweep_receipt_id: sweepReceipt?.receipt_id || null
  };
  await dependencies.ledger?.put?.(idempotencyKey, finalReceipt);
  return { ok: true, collected: true, state, evaluation, firewall, receipt: finalReceipt, transitions };
}
