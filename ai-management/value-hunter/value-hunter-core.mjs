export const VALUE_STATES = Object.freeze([
  'DISCOVERED', 'POSSIBLE_MATCH', 'IDENTITY_MATCH', 'ENTITLEMENT_UNCERTAIN', 'ENTITLEMENT_PROVEN',
  'AUTOMATION_NOT_PERMITTED', 'OWNER_APPROVAL_REQUIRED', 'READY_TO_CLAIM', 'CLAIM_SUBMITTED',
  'CLAIM_ACCEPTED', 'PAYMENT_PENDING', 'RECEIVED', 'SWEPT_TO_APPROVED_DESTINATION', 'REJECTED',
  'EXPIRED', 'NOT_OURS', 'FRAUD_BLOCKED'
]);

export const VALUE_INTENT_TYPES = Object.freeze([
  'CLAIM_REWARD', 'SWEEP_RECEIVED_ASSET', 'WITHDRAW_OWNED_BALANCE'
]);

export const LEGAL_BASES = Object.freeze([
  'ownership', 'beneficiary', 'legal_heir', 'contract', 'refund', 'rebate', 'reward', 'bounty',
  'grant', 'credit_balance', 'unclaimed_property', 'tax_refund', 'insurance_proceeds',
  'statutory_finder_award', 'lawful_appropriation'
]);

export const DEFAULT_STANDING_MANDATE = Object.freeze({
  mandate_id: 'owner-standing-auto-collection-v1',
  active: true,
  auto_collect_proven_entitlements: true,
  covered_categories: [...LEGAL_BASES],
  allowed_intents: [...VALUE_INTENT_TYPES],
  require_official_source: true,
  require_current_terms: true,
  require_deterministic_entitlement_proof: true,
  require_approved_destination: true,
  maximum_fee_minor: 0,
  maximum_fee_ratio: 0,
  maximum_daily_fee_minor: 0,
  minimum_net_value_minor: 1,
  large_value_confirmation_threshold_minor: null,
  accepted_human_requirements: [],
  prohibited_actions: [
    'fabricate_identity', 'fabricate_evidence', 'accept_new_terms', 'create_new_contract',
    'blind_sign', 'expose_private_key', 'unlimited_token_approval', 'transfer_to_unknown_destination'
  ]
});

const TERMINAL_STATES = new Set([
  'SWEPT_TO_APPROVED_DESTINATION', 'REJECTED', 'EXPIRED', 'NOT_OURS', 'FRAUD_BLOCKED'
]);

const TRANSITIONS = Object.freeze({
  DISCOVERED: ['POSSIBLE_MATCH', 'IDENTITY_MATCH', 'ENTITLEMENT_UNCERTAIN', 'ENTITLEMENT_PROVEN', 'AUTOMATION_NOT_PERMITTED', 'OWNER_APPROVAL_REQUIRED', 'READY_TO_CLAIM', 'EXPIRED', 'NOT_OURS', 'FRAUD_BLOCKED'],
  POSSIBLE_MATCH: ['IDENTITY_MATCH', 'ENTITLEMENT_UNCERTAIN', 'ENTITLEMENT_PROVEN', 'NOT_OURS', 'EXPIRED', 'FRAUD_BLOCKED'],
  IDENTITY_MATCH: ['ENTITLEMENT_UNCERTAIN', 'ENTITLEMENT_PROVEN', 'NOT_OURS', 'EXPIRED', 'FRAUD_BLOCKED'],
  ENTITLEMENT_UNCERTAIN: ['ENTITLEMENT_PROVEN', 'NOT_OURS', 'EXPIRED', 'FRAUD_BLOCKED'],
  ENTITLEMENT_PROVEN: ['AUTOMATION_NOT_PERMITTED', 'OWNER_APPROVAL_REQUIRED', 'READY_TO_CLAIM', 'EXPIRED', 'FRAUD_BLOCKED'],
  AUTOMATION_NOT_PERMITTED: ['ENTITLEMENT_PROVEN', 'OWNER_APPROVAL_REQUIRED', 'READY_TO_CLAIM', 'EXPIRED', 'REJECTED'],
  OWNER_APPROVAL_REQUIRED: ['ENTITLEMENT_PROVEN', 'READY_TO_CLAIM', 'AUTOMATION_NOT_PERMITTED', 'EXPIRED', 'REJECTED'],
  READY_TO_CLAIM: ['CLAIM_SUBMITTED', 'AUTOMATION_NOT_PERMITTED', 'OWNER_APPROVAL_REQUIRED', 'EXPIRED', 'REJECTED', 'FRAUD_BLOCKED'],
  CLAIM_SUBMITTED: ['CLAIM_ACCEPTED', 'PAYMENT_PENDING', 'RECEIVED', 'REJECTED', 'FRAUD_BLOCKED'],
  CLAIM_ACCEPTED: ['PAYMENT_PENDING', 'RECEIVED', 'REJECTED', 'FRAUD_BLOCKED'],
  PAYMENT_PENDING: ['RECEIVED', 'REJECTED', 'FRAUD_BLOCKED'],
  RECEIVED: ['SWEPT_TO_APPROVED_DESTINATION', 'OWNER_APPROVAL_REQUIRED', 'FRAUD_BLOCKED']
});

function clean(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function finiteInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function list(value, maximum = 100) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, 120)).filter(Boolean))].slice(0, maximum);
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function expired(value, now) {
  return Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime());
}

function humanRequirement(input) {
  const requirements = list(input, 30);
  const mandatory = new Set([
    'kyc', 'identity-verification', 'wet-signature', 'notarization', 'captcha', 'accept-new-terms',
    'tax-declaration', 'create-account', 'create-contract', 'provider-mandated-human-submission'
  ]);
  return requirements.find(item => mandatory.has(item)) || null;
}

export function canTransitionValueState(from, to) {
  if (from === to) return true;
  if (TERMINAL_STATES.has(from)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertValueTransition(from, to) {
  if (!VALUE_STATES.includes(from) || !VALUE_STATES.includes(to)) throw new Error('Unknown Value Hunter state');
  if (!canTransitionValueState(from, to)) throw new Error(`Illegal Value Hunter state transition: ${from} -> ${to}`);
  return true;
}

export function evaluateValueOpportunity(input = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const mandate = { ...DEFAULT_STANDING_MANDATE, ...record(options.mandate || input.mandate) };
  const claimant = record(input.claimant);
  const entitlement = record(input.entitlement);
  const jurisdiction = record(input.jurisdiction);
  const source = record(input.source);
  const destination = record(input.destination);
  const security = record(input.security);
  const provider = record(input.provider);
  const amountMinor = Math.max(0, finiteInteger(input.amount_minor));
  const feeMinor = Math.max(0, finiteInteger(input.fee_minor));
  const netValueMinor = amountMinor - feeMinor;
  const legalBasis = clean(entitlement.legal_basis || input.legal_basis, 80);
  const reasons = [];
  const manualActions = [];

  if (security.malicious_airdrop === true || security.address_poisoning === true || security.phishing === true ||
      security.untrusted_contract === true || security.blind_signing_required === true) {
    return decision('FRAUD_BLOCKED', false, ['malicious-or-unsafe-asset-flow'], [], netValueMinor);
  }
  if (expired(input.expires_at, now) || expired(source.expires_at, now)) {
    return decision('EXPIRED', false, ['claim-window-expired'], [], netValueMinor);
  }
  if (entitlement.ownership_status === 'not-ours' || entitlement.ownership_status === 'unknown' || claimant.authorized === false) {
    return decision('NOT_OURS', false, ['ownership-or-authority-not-established'], [], netValueMinor);
  }
  if (legalBasis === 'lawful_appropriation' && entitlement.official_ownerless_determination !== true) {
    return decision('NOT_OURS', false, ['unclaimed-or-abandoned-does-not-establish-ownerless-property'], [], netValueMinor);
  }
  if (legalBasis === 'statutory_finder_award' && entitlement.official_award_rule_verified !== true) {
    return decision('ENTITLEMENT_UNCERTAIN', false, ['finder-award-rule-not-proven'], [], netValueMinor);
  }
  if (!LEGAL_BASES.includes(legalBasis)) reasons.push('unsupported-or-missing-legal-basis');
  if (mandate.require_official_source !== false && (source.official !== true || source.verified !== true || source.active === false)) reasons.push('official-source-not-verified');
  if (claimant.authorized !== true || claimant.authority_status !== 'proven') reasons.push('claimant-authority-not-proven');
  if (claimant.identity_status !== 'matched') reasons.push('identity-not-matched');
  if (entitlement.deterministic_proof !== true || finiteInteger(entitlement.evidence_count) < 1) reasons.push('deterministic-entitlement-proof-missing');
  if (reasons.length) return decision('ENTITLEMENT_UNCERTAIN', false, reasons, [], netValueMinor);

  if (input.terms_changed === true || source.terms_changed === true ||
      (source.validated_terms_hash && source.terms_hash && source.validated_terms_hash !== source.terms_hash)) {
    return decision('AUTOMATION_NOT_PERMITTED', false, ['provider-terms-changed'], ['revalidate-current-provider-terms'], netValueMinor);
  }
  if (mandate.require_current_terms !== false && (source.terms_current !== true || expired(source.terms_valid_until, now))) {
    return decision('AUTOMATION_NOT_PERMITTED', false, ['provider-terms-not-current'], ['revalidate-current-provider-terms'], netValueMinor);
  }
  if (jurisdiction.checked !== true || expired(jurisdiction.valid_until, now)) {
    return decision('AUTOMATION_NOT_PERMITTED', false, ['jurisdiction-check-not-current'], ['revalidate-jurisdiction-rules'], netValueMinor);
  }
  if (jurisdiction.claim_permitted !== true) {
    return decision('REJECTED', false, ['claim-not-lawful-in-jurisdiction'], [], netValueMinor);
  }
  if (jurisdiction.automation_permitted !== true || finiteInteger(jurisdiction.automation_level) < 3) {
    return decision('AUTOMATION_NOT_PERMITTED', false, ['jurisdiction-or-provider-disallows-automated-claim'], ['complete-provider-required-manual-claim'], netValueMinor);
  }
  const requiredHumanAction = humanRequirement(input.human_requirements);
  if (requiredHumanAction) {
    manualActions.push(requiredHumanAction);
    return decision('OWNER_APPROVAL_REQUIRED', false, ['mandatory-human-or-legal-step'], manualActions, netValueMinor);
  }
  if (mandate.active !== true || mandate.auto_collect_proven_entitlements !== true || !list(mandate.covered_categories).includes(legalBasis)) {
    return decision('OWNER_APPROVAL_REQUIRED', false, ['outside-active-standing-mandate'], ['approve-or-amend-standing-mandate'], netValueMinor);
  }
  if (destination.approved !== true || destination.active !== true || !destination.destination_id) {
    return decision('OWNER_APPROVAL_REQUIRED', false, ['approved-destination-required'], ['register-and-approve-destination'], netValueMinor);
  }
  if (provider.automation_supported !== true || !clean(provider.adapter_id, 120)) {
    return decision('AUTOMATION_NOT_PERMITTED', false, ['constrained-provider-adapter-unavailable'], ['install-and-validate-provider-adapter'], netValueMinor);
  }
  const maximumFee = Math.max(0, finiteInteger(mandate.maximum_fee_minor));
  const maximumRatio = Math.max(0, Number(mandate.maximum_fee_ratio || 0));
  if (feeMinor > maximumFee || (amountMinor > 0 && feeMinor / amountMinor > maximumRatio)) {
    return decision('OWNER_APPROVAL_REQUIRED', false, ['fee-policy-exceeded'], ['approve-specific-fee-or-wait-for-lower-fee'], netValueMinor);
  }
  if (netValueMinor < Math.max(0, finiteInteger(mandate.minimum_net_value_minor))) {
    return decision('REJECTED', false, ['non-positive-or-below-minimum-net-value'], [], netValueMinor);
  }
  const threshold = mandate.large_value_confirmation_threshold_minor;
  if (threshold != null && Number.isSafeInteger(Number(threshold)) && amountMinor >= Number(threshold)) {
    return decision('OWNER_APPROVAL_REQUIRED', false, ['configured-large-value-confirmation'], ['confirm-large-value-collection'], netValueMinor);
  }
  return decision('READY_TO_CLAIM', true, ['entitlement-proven-and-automation-authorized'], [], netValueMinor);
}

function decision(state, autoCollect, reasons, manualActions, netValueMinor) {
  return {
    state,
    entitlement_proven: !['DISCOVERED', 'POSSIBLE_MATCH', 'IDENTITY_MATCH', 'ENTITLEMENT_UNCERTAIN', 'NOT_OURS', 'FRAUD_BLOCKED'].includes(state),
    auto_collect: autoCollect,
    reasons,
    manual_actions: manualActions,
    net_value_minor: netValueMinor,
    confidence_is_legal_proof: false
  };
}

export function priorityScore(input = {}) {
  const amount = Math.max(0, finiteInteger(input.amount_minor));
  const fee = Math.max(0, finiteInteger(input.fee_minor));
  const successRate = Math.max(0, Math.min(1, Number(input.historical_success_rate ?? 0.5)));
  const expectedDays = Math.max(1, Number(input.expected_days ?? 30));
  const evidenceStrength = Math.max(0, Math.min(1, Number(input.evidence_strength ?? 0)));
  const fraudRisk = Math.max(0, Math.min(1, Number(input.fraud_risk ?? 0)));
  return Math.round((((amount - fee) * successRate * (0.5 + evidenceStrength / 2) * (1 - fraudRisk)) / expectedDays) * 1000) / 1000;
}

export const valueHunterInternals = { TRANSITIONS, TERMINAL_STATES, clean, finiteInteger, humanRequirement };
