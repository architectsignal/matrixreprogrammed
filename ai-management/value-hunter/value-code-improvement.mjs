const SECRET_FIELD = /(private.?key|seed.?phrase|mnemonic|password|client.?secret|access.?token|raw.?signature|recovery.?phrase|bank.?account|routing.?number)/i;
const FORBIDDEN_CODE = /\b(child_process|execSync|spawnSync|eval\s*\(|new\s+Function|process\.env|fs\.|net\.|tls\.|dgram\.|worker_threads|delegatecall|setApprovalForAll)\b/i;
const ALLOWED_INTENTS = Object.freeze(['CLAIM_REWARD', 'SWEEP_RECEIVED_ASSET', 'WITHDRAW_OWNED_BALANCE']);

function clean(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function safeId(value) {
  return clean(value, 160).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function hasSecretMaterial(value, trail = '') {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => SECRET_FIELD.test(`${trail}.${key}`) ||
    (nested && typeof nested === 'object' && hasSecretMaterial(nested, `${trail}.${key}`)));
}

function exactOfficialEndpoint(value, officialHost) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname.toLowerCase() === officialHost ? url.toString() : '';
  } catch { return ''; }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function renderCandidate({ adapterId, claimEndpoint, credentialReference, termsHash }) {
  return `export class GeneratedValueCollectionAdapter {
  constructor({ authorizedRequest, clock = () => new Date() } = {}) {
    this.adapterId = ${JSON.stringify(adapterId)};
    this.idempotencyEnforced = true;
    this.receiptSchemaVersion = 'value-receipt-v1';
    this.activationState = 'sandbox-candidate';
    this.authorizedRequest = authorizedRequest;
    this.clock = clock;
  }

  async claim(intent) {
    if (this.activationState !== 'live-certified') throw new Error('VALUE_ADAPTER_NOT_LIVE_CERTIFIED');
    if (typeof this.authorizedRequest !== 'function') throw new Error('AUTHORIZED_REQUEST_BROKER_REQUIRED');
    if (!${JSON.stringify(ALLOWED_INTENTS)}.includes(intent.intent_type)) throw new Error('VALUE_INTENT_REJECTED');
    if (!intent.idempotency_key || intent.terms_hash !== ${JSON.stringify(termsHash)}) throw new Error('VALUE_TERMS_OR_IDEMPOTENCY_REJECTED');
    if (!intent.claimant_id || !intent.destination_id || !Number.isSafeInteger(intent.amount_minor) || intent.amount_minor < 0) throw new Error('VALUE_INTENT_INCOMPLETE');
    const receipt = await this.authorizedRequest({
      url: ${JSON.stringify(claimEndpoint)}, method: 'POST', credential_reference: ${JSON.stringify(credentialReference)},
      headers: { 'idempotency-key': intent.idempotency_key, 'content-type': 'application/json' },
      body: {
        intent_type: intent.intent_type, opportunity_id: intent.opportunity_id, claimant_id: intent.claimant_id,
        destination_id: intent.destination_id, asset: intent.asset, amount_minor: intent.amount_minor,
        maximum_fee_minor: intent.maximum_fee_minor, contract_id: intent.contract_id, terms_hash: intent.terms_hash
      }
    });
    if (!receipt || !['accepted', 'pending', 'received'].includes(receipt.status)) throw new Error('VALUE_RECEIPT_REJECTED');
    if (!receipt.receipt_id || !Number.isSafeInteger(receipt.amount_minor) || receipt.amount_minor < 0) throw new Error('VALUE_RECEIPT_INCOMPLETE');
    if (!Number.isSafeInteger(receipt.fee_minor) || receipt.fee_minor < 0 || receipt.fee_minor > intent.maximum_fee_minor) throw new Error('VALUE_RECEIPT_FEE_REJECTED');
    return Object.freeze({
      receipt_id: String(receipt.receipt_id), provider_receipt_reference: String(receipt.provider_receipt_reference || receipt.receipt_id),
      status: receipt.status, amount_minor: receipt.amount_minor, fee_minor: receipt.fee_minor,
      confirmation_count: Math.max(0, Number(receipt.confirmation_count || 0)), reconciled: receipt.reconciled === true,
      received_at: String(receipt.received_at || this.clock().toISOString())
    });
  }
}
`;
}

export async function buildValueCollectionAdapterCandidate(specification = {}, { now = new Date() } = {}) {
  const blockers = [];
  if (hasSecretMaterial(specification)) blockers.push('secret-or-raw-financial-material-forbidden');
  const adapterId = safeId(specification.adapter_id || specification.adapterId);
  let officialHost = '';
  try {
    const official = new URL(String(specification.official_url || specification.officialUrl || ''));
    if (official.protocol === 'https:') officialHost = official.hostname.toLowerCase();
  } catch { /* reported below */ }
  const claimEndpoint = exactOfficialEndpoint(specification.claim_endpoint || specification.claimEndpoint, officialHost);
  const credentialReference = clean(specification.credential_vault_reference || specification.credentialVaultReference, 300);
  const termsHash = clean(specification.validated_terms_hash || specification.validatedTermsHash, 128);
  if (!adapterId) blockers.push('adapter-id-required');
  if (!officialHost) blockers.push('official-https-host-required');
  if (!claimEndpoint) blockers.push('same-host-official-claim-endpoint-required');
  if (!credentialReference.startsWith('vault://')) blockers.push('vault-credential-reference-required');
  if (!/^[a-f0-9]{64}$/i.test(termsHash)) blockers.push('validated-terms-sha256-required');
  if (specification.automation_permitted !== true) blockers.push('official-automation-permission-required');
  if (specification.idempotency_supported !== true) blockers.push('provider-idempotency-required');
  if (specification.receipt_reconciliation_supported !== true) blockers.push('provider-reconciliation-required');
  const uniqueBlockers = [...new Set(blockers)];
  const sourceCode = uniqueBlockers.length ? null : renderCandidate({ adapterId, claimEndpoint, credentialReference, termsHash });
  const sourceSha256 = sourceCode ? await sha256(sourceCode) : null;
  return {
    proposal_id: sourceSha256 ? `value-code-${sourceSha256.slice(0, 32)}` : `value-code-quarantine-${adapterId || 'unknown'}`,
    adapter_id: adapterId || null,
    target_path: adapterId ? `ai-management/provider-adapters/value/generated/${adapterId}.mjs` : null,
    official_host: officialHost || null,
    claim_endpoint: claimEndpoint || null,
    source_code: sourceCode,
    source_sha256: sourceSha256,
    state: uniqueBlockers.length ? 'quarantined' : 'static-tested',
    blockers: uniqueBlockers,
    generated_at: now.toISOString(),
    activation_allowed: false,
    immutable_boundaries: ['entitlement', 'claimant-authority', 'jurisdiction', 'terms', 'fees', 'destinations', 'signing', 'secrets', 'deployment']
  };
}

export function certifyValueCollectionAdapterCandidate(candidate = {}) {
  const blockers = [...(candidate.blockers || [])];
  const source = String(candidate.source_code || '');
  if (candidate.state !== 'static-tested' || !source) blockers.push('static-tested-source-required');
  if (FORBIDDEN_CODE.test(source)) blockers.push('forbidden-code-detected');
  for (const marker of [
    'idempotencyEnforced = true', "receiptSchemaVersion = 'value-receipt-v1'", "activationState = 'sandbox-candidate'",
    'VALUE_ADAPTER_NOT_LIVE_CERTIFIED', "'idempotency-key': intent.idempotency_key", 'receipt.reconciled === true'
  ]) if (!source.includes(marker)) blockers.push(`missing-contract-marker:${marker}`);
  const uniqueBlockers = [...new Set(blockers)];
  return {
    certified: uniqueBlockers.length === 0,
    state: uniqueBlockers.length ? 'quarantined' : 'sandbox-candidate',
    blockers: uniqueBlockers,
    adapter_id: candidate.adapter_id || null,
    source_sha256: candidate.source_sha256 || null,
    activation_allowed: false,
    next_required_gate: uniqueBlockers.length ? 'repair-and-regenerate' : 'provider-sandbox-contract-and-reconciliation-tests'
  };
}

export const valueCodeImprovementInternals = {
  SECRET_FIELD, FORBIDDEN_CODE, ALLOWED_INTENTS, clean, safeId, hasSecretMaterial, exactOfficialEndpoint, renderCandidate
};
