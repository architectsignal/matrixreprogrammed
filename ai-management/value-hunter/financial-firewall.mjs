import { DEFAULT_STANDING_MANDATE, VALUE_INTENT_TYPES } from './value-hunter-core.mjs';

const SECRET_FIELD = /(private.?key|seed.?phrase|mnemonic|password|secret|raw.?signature|recovery.?phrase)/i;
const FORBIDDEN_ACTION = /(unlimited|approve.?all|setapprovalforall|arbitrary.?call|blind.?sign|delegatecall|transfer.?unknown)/i;

function clean(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function hasSecretMaterial(value, trail = '') {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => {
    const path = `${trail}.${key}`;
    if (SECRET_FIELD.test(path)) return true;
    return nested && typeof nested === 'object' ? hasSecretMaterial(nested, path) : false;
  });
}

export function buildConstrainedIntent(input = {}) {
  const intentType = clean(input.intent_type, 80);
  if (!VALUE_INTENT_TYPES.includes(intentType)) throw new Error('Financial intent type is not allowlisted');
  const intent = {
    intent_id: clean(input.intent_id, 160),
    intent_type: intentType,
    opportunity_id: clean(input.opportunity_id, 160),
    claimant_id: clean(input.claimant_id, 160),
    provider_adapter_id: clean(input.provider_adapter_id, 160),
    destination_id: clean(input.destination_id, 160),
    asset: clean(input.asset, 80),
    amount_minor: Number(input.amount_minor || 0),
    maximum_fee_minor: Number(input.maximum_fee_minor || 0),
    contract_id: input.contract_id ? clean(input.contract_id, 240) : null,
    idempotency_key: clean(input.idempotency_key, 200),
    terms_hash: clean(input.terms_hash, 128),
    blind_signing: false,
    unlimited_approval: false
  };
  if (!intent.intent_id || !intent.opportunity_id || !intent.claimant_id || !intent.provider_adapter_id || !intent.destination_id || !intent.idempotency_key) {
    throw new Error('Constrained financial intent is incomplete');
  }
  return Object.freeze(intent);
}

export function validateFinancialIntent(intent = {}, context = {}) {
  const mandate = { ...DEFAULT_STANDING_MANDATE, ...(context.mandate || {}) };
  const blockers = [];
  if (!VALUE_INTENT_TYPES.includes(intent.intent_type)) blockers.push('intent-type-not-allowlisted');
  if (!Array.isArray(mandate.allowed_intents) || !mandate.allowed_intents.includes(intent.intent_type)) blockers.push('intent-outside-standing-mandate');
  if (hasSecretMaterial(intent)) blockers.push('secret-material-present');
  const requestedOperation = [intent.action, intent.method, intent.function_name, intent.calldata_mode].map(value => String(value || '')).join(' ');
  if (intent.blind_signing === true || intent.unlimited_approval === true || FORBIDDEN_ACTION.test(requestedOperation)) blockers.push('unsafe-signing-operation');
  const destination = (context.destinations || []).find(item => item.destination_id === intent.destination_id);
  if (!destination || destination.active !== true || destination.approved !== true) blockers.push('destination-not-approved');
  if (destination && Array.isArray(destination.allowed_assets) && destination.allowed_assets.length && !destination.allowed_assets.includes(intent.asset)) blockers.push('asset-not-approved-for-destination');
  if (!Array.isArray(context.approved_provider_adapters) || !context.approved_provider_adapters.includes(intent.provider_adapter_id)) blockers.push('provider-adapter-not-approved');
  if (intent.contract_id && (!Array.isArray(context.approved_contracts) || !context.approved_contracts.includes(intent.contract_id))) blockers.push('contract-not-approved');
  if (!intent.idempotency_key) blockers.push('idempotency-key-required');
  if (!Number.isSafeInteger(intent.amount_minor) || intent.amount_minor < 0) blockers.push('invalid-amount');
  if (!Number.isSafeInteger(intent.maximum_fee_minor) || intent.maximum_fee_minor < 0 || intent.maximum_fee_minor > Number(mandate.maximum_fee_minor || 0)) blockers.push('fee-policy-exceeded');
  return { allowed: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export const financialFirewallInternals = { SECRET_FIELD, FORBIDDEN_ACTION, hasSecretMaterial };
