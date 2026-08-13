import assert from 'node:assert/strict';
import {
  DEFAULT_STANDING_MANDATE, evaluateValueOpportunity, priorityScore
} from '../ai-management/value-hunter/value-hunter-core.mjs';
import { collectProvenValue, ValueProviderRegistry } from '../ai-management/value-hunter/value-collector.mjs';
import { financialFirewallInternals, validateFinancialIntent } from '../ai-management/value-hunter/financial-firewall.mjs';

function opportunity(overrides = {}) {
  const base = {
    opportunity_id: 'value-fixture-1', state: 'DISCOVERED', legal_basis: 'refund', amount_minor: 250000, fee_minor: 0,
    currency: 'EUR', idempotency_key: 'value-fixture-1:claim', claim_intent_type: 'CLAIM_REWARD', sweep_required: false,
    claimant: { claimant_id: 'claimant-matrix', authorized: true, authority_status: 'proven', identity_status: 'matched' },
    entitlement: { legal_basis: 'refund', ownership_status: 'proven', deterministic_proof: true, evidence_count: 2 },
    source: { official: true, verified: true, active: true, terms_current: true, terms_hash: 'terms-v1', validated_terms_hash: 'terms-v1' },
    jurisdiction: { checked: true, claim_permitted: true, automation_permitted: true, automation_level: 4 },
    destination: { destination_id: 'approved-eur-account', approved: true, active: true, allowed_assets: ['EUR', 'TEST'] },
    provider: { adapter_id: 'fixture-lawful-collector', automation_supported: true }, security: {}, human_requirements: []
  };
  return {
    ...base, ...overrides,
    claimant: { ...base.claimant, ...(overrides.claimant || {}) },
    entitlement: { ...base.entitlement, ...(overrides.entitlement || {}) },
    source: { ...base.source, ...(overrides.source || {}) },
    jurisdiction: { ...base.jurisdiction, ...(overrides.jurisdiction || {}) },
    destination: { ...base.destination, ...(overrides.destination || {}) },
    provider: { ...base.provider, ...(overrides.provider || {}) },
    security: { ...base.security, ...(overrides.security || {}) }
  };
}

class FixtureProvider {
  constructor() { this.adapterId = 'fixture-lawful-collector'; this.calls = 0; }
  async claim(intent) {
    this.calls += 1;
    assert.equal(financialFirewallInternals.hasSecretMaterial(intent), false, 'provider intent must never contain private keys, seeds or secrets');
    return { receipt_id: `claim-receipt-${this.calls}`, status: 'received', amount_minor: intent.amount_minor, fee_minor: 0 };
  }
}

class MemoryLedger {
  constructor() { this.rows = new Map(); }
  async get(key) { return this.rows.get(key); }
  async put(key, value) { this.rows.set(key, value); }
}

const provider = new FixtureProvider();
const providers = new ValueProviderRegistry([provider]);
const ledger = new MemoryLedger();
const dependencies = { mandate: DEFAULT_STANDING_MANDATE, providers, ledger, approvedContracts: ['fixture-approved-contract'] };

const automatic = await collectProvenValue(opportunity(), dependencies);
assert.equal(automatic.collected, true);
assert.equal(automatic.state, 'SWEPT_TO_APPROVED_DESTINATION');
assert.deepEqual(automatic.transitions.map(item => item.to), ['READY_TO_CLAIM', 'CLAIM_SUBMITTED', 'RECEIVED', 'SWEPT_TO_APPROVED_DESTINATION']);
assert.equal(provider.calls, 1);

const jurisdictionBlocked = evaluateValueOpportunity(opportunity({ jurisdiction: { automation_permitted: false, automation_level: 1 } }));
assert.equal(jurisdictionBlocked.state, 'AUTOMATION_NOT_PERMITTED');
assert.deepEqual(jurisdictionBlocked.manual_actions, ['complete-provider-required-manual-claim']);

const notOurs = evaluateValueOpportunity(opportunity({ entitlement: { ownership_status: 'unknown' } }));
assert.equal(notOurs.state, 'NOT_OURS');

const unclaimedIsNotOwnerless = evaluateValueOpportunity(opportunity({
  legal_basis: 'lawful_appropriation',
  entitlement: { legal_basis: 'lawful_appropriation', ownership_status: 'proven', official_ownerless_determination: false }
}));
assert.equal(unclaimedIsNotOwnerless.state, 'NOT_OURS');

const ownerlessLegallyAppropriable = evaluateValueOpportunity(opportunity({
  legal_basis: 'lawful_appropriation',
  entitlement: { legal_basis: 'lawful_appropriation', ownership_status: 'proven', official_ownerless_determination: true }
}));
assert.equal(ownerlessLegallyAppropriable.state, 'READY_TO_CLAIM');

let signedIntent = null;
const cryptoInput = opportunity({
  opportunity_id: 'value-crypto-1', idempotency_key: 'value-crypto-1:claim', asset: 'TEST', currency: 'TEST',
  legal_basis: 'reward', entitlement: { legal_basis: 'reward' }, contract_id: 'fixture-approved-contract', sweep_required: true
});
const cryptoResult = await collectProvenValue(cryptoInput, {
  ...dependencies,
  ledger: new MemoryLedger(),
  signer: { async executeIntent(intent) { signedIntent = intent; return { receipt_id: 'sweep-receipt-1', status: 'confirmed', confirmations: 12 }; } }
});
assert.equal(cryptoResult.state, 'SWEPT_TO_APPROVED_DESTINATION');
assert.equal(signedIntent.intent_type, 'SWEEP_RECEIVED_ASSET');
assert.equal(financialFirewallInternals.hasSecretMaterial(signedIntent), false);

const highFee = evaluateValueOpportunity(opportunity({ amount_minor: 10000, fee_minor: 1 }));
assert.equal(highFee.state, 'OWNER_APPROVAL_REQUIRED');
assert.ok(highFee.reasons.includes('fee-policy-exceeded'));

const malicious = evaluateValueOpportunity(opportunity({ security: { malicious_airdrop: true } }));
assert.equal(malicious.state, 'FRAUD_BLOCKED');

const changedTerms = evaluateValueOpportunity(opportunity({ source: { terms_hash: 'terms-v2', validated_terms_hash: 'terms-v1' } }));
assert.equal(changedTerms.state, 'AUTOMATION_NOT_PERMITTED');
assert.ok(changedTerms.reasons.includes('provider-terms-changed'));

const duplicate = await collectProvenValue(opportunity(), dependencies);
assert.equal(duplicate.duplicate, true);
assert.equal(provider.calls, 2, 'the crypto claim is the only additional provider call; duplicate fiat collection must not call again');

const unsafeIntent = validateFinancialIntent({
  intent_type: 'SWEEP_RECEIVED_ASSET', provider_adapter_id: 'fixture-lawful-collector', destination_id: 'approved-eur-account',
  asset: 'EUR', amount_minor: 100, maximum_fee_minor: 0, idempotency_key: 'unsafe', private_key: 'forbidden'
}, { mandate: DEFAULT_STANDING_MANDATE, destinations: [opportunity().destination], approved_provider_adapters: providers.approvedAdapterIds(), approved_contracts: [] });
assert.equal(unsafeIntent.allowed, false);
assert.ok(unsafeIntent.blockers.includes('secret-material-present'));

assert.ok(priorityScore({ amount_minor: 100000, fee_minor: 0, historical_success_rate: 0.9, expected_days: 2, evidence_strength: 1 }) >
  priorityScore({ amount_minor: 100000, fee_minor: 0, historical_success_rate: 0.1, expected_days: 90, evidence_strength: 0.2 }),
'learning score must prioritize demonstrated net-value yield, evidence and speed');

console.log('Value Hunter golden tests passed: automatic collection, jurisdiction, ownership, lawful appropriation, constrained crypto signing, fees, fraud, terms, idempotency and learned priority.');
