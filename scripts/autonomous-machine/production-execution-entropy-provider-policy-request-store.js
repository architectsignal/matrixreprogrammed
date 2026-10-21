'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const ENTROPY_PROVIDER_POLICY_REQUEST_AUTHORITY =
  'single_use_entropy_provider_policy_request_only_no_provider_implementation_entropy_or_execution_authority';
const ENTROPY_PROVIDER_POLICY_REQUEST_STATUS = 'pending_manual_entropy_provider_policy_review';
const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 6;
const MIN_REMAINING_SECONDS = 1;
const REQUIRED_CHARACTERISTICS = Object.freeze({
  localOperatingSystemManaged: true,
  cryptographicallySecure: true,
  noNetworkDependency: true,
  noExternalProvider: true,
  noUserSuppliedSeed: true,
  noDeterministicFallback: true,
  failClosedOnUnavailable: true,
  entropyOutputLoggingForbidden: true,
});

function hmac(signingKey, value) {
  return crypto.createHmac('sha256', signingKey).update(String(value)).digest('hex');
}
function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string'
    || !/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
}
function assertHash(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) throw new TypeError(`${field} must be a SHA-256 hash`);
}
function assertIso(value, field) {
  if (typeof value !== 'string' || !value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO-8601 UTC timestamp`);
  }
}
function assertZeroSafety(safety) {
  assertObject(safety, 'entropy provider policy request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`entropy provider policy request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`entropy provider policy request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('entropy provider policy request safety requires productionTarget=null');
}
function assertProviderPolicy(state) {
  assertObject(state, 'entropy provider policy request providerPolicy');
  if (state.policyRequested !== true
    || state.sourceClassBound !== true
    || state.boundSourceClass !== 'operating_system_csprng'
    || state.providerPolicyDefined !== true
    || state.permittedProviderClass !== 'local_operating_system_managed_csprng_interface'
    || stableStringify(state.requiredCharacteristics) !== stableStringify(REQUIRED_CHARACTERISTICS)
    || state.providerSelectionRequired !== true
    || state.providerSelected !== false || state.providerName !== null
    || state.implementationSelectionRequired !== true
    || state.implementationSelected !== false || state.implementationName !== null
    || state.librarySelected !== false || state.libraryName !== null
    || state.apiSelected !== false || state.apiName !== null
    || state.deviceSelected !== false || state.deviceName !== null
    || state.syscallSelected !== false || state.syscallName !== null
    || state.networkSourceAllowed !== false || state.externalProviderAllowed !== false
    || state.entropyBytesRequested !== 0 || state.entropyGenerated !== false
    || state.entropyOutput !== null || state.entropyDigest !== null
    || state.tokenMaterialGenerated !== false || state.tokenMaterialIssued !== false
    || state.tokenDigest !== null || state.tokenId !== null
    || state.bearerSecretGenerated !== false || state.bearerSecretIssued !== false
    || state.credentialGenerated !== false || state.credentialIssued !== false
    || state.consumed !== false || state.useCount !== 0 || state.maxUses !== 1) {
    throw new Error('entropy provider policy request may define policy only and cannot select a provider or implementation, produce entropy, or create secret material');
  }
}
function assertCandidate(candidate, field) {
  assertObject(candidate, field);
  if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
    throw new TypeError(`${field} proposedRepositoryPath is invalid`);
  }
  for (const name of ['currentSha256', 'sourceBindingDecisionSha256']) assertHash(candidate[name], `${field} ${name}`);
  for (const name of ['currentBytes', 'sourceBindingDecisionBytes']) {
    if (!Number.isInteger(candidate[name]) || candidate[name] < 0) throw new Error(`${field} ${name} is invalid`);
  }
  if (candidate.currentSha256 !== candidate.sourceBindingDecisionSha256
    || candidate.currentBytes !== candidate.sourceBindingDecisionBytes
    || candidate.matchSourceBindingDecision !== true || candidate.writeAllowed !== false) {
    throw new Error(`${field} does not match the signed source binding decision`);
  }
}
function assertEntropyProviderPolicyRequestPayload(payload) {
  assertObject(payload, 'entropy provider policy request payload');
  if (payload.schemaVersion !== 1) throw new Error('entropy provider policy request schemaVersion must be 1');
  if (payload.requestType !== 'single_use_entropy_provider_policy_request') throw new Error('entropy provider policy request type is invalid');
  if (payload.mode !== 'entropy_provider_policy_request_record_only') throw new Error('entropy provider policy request mode is invalid');
  if (payload.authority !== ENTROPY_PROVIDER_POLICY_REQUEST_AUTHORITY) throw new Error('entropy provider policy request authority is invalid');
  if (payload.status !== ENTROPY_PROVIDER_POLICY_REQUEST_STATUS) throw new Error('entropy provider policy request status is invalid');

  assertObject(payload.sourceBindingDecision, 'entropy provider policy request sourceBindingDecision');
  for (const field of ['id', 'sourceBindingRequestId', 'sourceSelectionDecisionId', 'sourceSelectionRequestId',
    'entropyDecisionId', 'entropyRequestId', 'applicationId']) {
    if (typeof payload.sourceBindingDecision[field] !== 'string' || !payload.sourceBindingDecision[field]) {
      throw new TypeError(`entropy provider policy request sourceBindingDecision requires ${field}`);
    }
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint', 'scopeHash', 'preflightSnapshotHash']) {
    assertHash(payload.sourceBindingDecision[field], `entropy provider policy request sourceBindingDecision ${field}`);
  }

  assertObject(payload.requester, 'entropy provider policy request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`entropy provider policy request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('entropy provider policy request requester note is invalid');
  }

  assertObject(payload.validity, 'entropy provider policy request validity');
  for (const field of ['requestedAt', 'validFrom', 'expiresAt', 'sourceBindingRequestExpiresAt',
    'sourceSelectionRequestExpiresAt', 'entropyRequestExpiresAt']) {
    assertIso(payload.validity[field], `entropy provider policy request validity ${field}`);
  }
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('entropy provider policy request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  if (requestedAt !== validFrom || expiresAt - validFrom !== payload.validity.durationSeconds * 1000
    || expiresAt > Date.parse(payload.validity.sourceBindingRequestExpiresAt)
    || expiresAt > Date.parse(payload.validity.sourceSelectionRequestExpiresAt)
    || expiresAt > Date.parse(payload.validity.entropyRequestExpiresAt)) {
    throw new Error('entropy provider policy request validity is inconsistent');
  }
  if (payload.validity.timeLimited !== true || payload.validity.singleUsePolicyRequested !== true
    || payload.validity.expiredAtCreation !== false) {
    throw new Error('entropy provider policy request validity flags are invalid');
  }

  assertProviderPolicy(payload.providerPolicy);
  assertObject(payload.lastMomentPreflight, 'entropy provider policy request lastMomentPreflight');
  assertIso(payload.lastMomentPreflight.verifiedAt, 'entropy provider policy request lastMomentPreflight verifiedAt');
  assertHash(payload.lastMomentPreflight.snapshotHash, 'entropy provider policy request lastMomentPreflight snapshotHash');
  if (Date.parse(payload.lastMomentPreflight.verifiedAt) !== validFrom
    || payload.lastMomentPreflight.allMatchSourceBindingDecision !== true
    || !Array.isArray(payload.lastMomentPreflight.candidates)
    || payload.lastMomentPreflight.candidates.length < 1) {
    throw new Error('entropy provider policy request lastMomentPreflight is incomplete');
  }
  const candidatePaths = new Set();
  payload.lastMomentPreflight.candidates.forEach((candidate, index) => {
    assertCandidate(candidate, `entropy provider policy request candidate ${index}`);
    if (candidatePaths.has(candidate.proposedRepositoryPath)) throw new Error('entropy provider policy request has duplicate candidates');
    candidatePaths.add(candidate.proposedRepositoryPath);
  });
  if (payload.lastMomentPreflight.snapshotHash !== sha256(stableStringify(payload.lastMomentPreflight.candidates))) {
    throw new Error('entropy provider policy request preflight snapshotHash is invalid');
  }

  assertObject(payload.scope, 'entropy provider policy request scope');
  if (payload.scope.scopeType !== 'source_binding_decision_bound_candidate_paths_and_operations_only'
    || payload.scope.exactScopeMatch !== true) throw new Error('entropy provider policy request scope boundary is invalid');
  for (const field of ['sourceBindingRequestScopeHash', 'sourceBindingDecisionScopeHash', 'recomputedScopeHash']) {
    assertHash(payload.scope[field], `entropy provider policy request scope ${field}`);
  }
  if (new Set([payload.scope.sourceBindingRequestScopeHash, payload.scope.sourceBindingDecisionScopeHash,
    payload.scope.recomputedScopeHash]).size !== 1) {
    throw new Error('entropy provider policy request scope hashes do not match');
  }
  if (!Array.isArray(payload.scope.targetIds) || payload.scope.targetIds.length < 1
    || new Set(payload.scope.targetIds).size !== payload.scope.targetIds.length
    || !Array.isArray(payload.scope.operations) || payload.scope.operations.length < 1
    || payload.scope.operationCount !== payload.scope.operations.length
    || payload.scope.candidateCount !== candidatePaths.size) {
    throw new Error('entropy provider policy request scope counts are invalid');
  }
  const scopedPaths = new Set();
  payload.scope.operations.forEach((operation, index) => {
    assertObject(operation, `entropy provider policy request operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence'
      || !Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes) || operation.candidateHashes.length !== operation.candidatePaths.length
      || operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('entropy provider policy request operation is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (typeof candidatePath !== 'string' || !candidatePath || !candidatePaths.has(candidatePath)) {
        throw new Error('entropy provider policy request operation references an unauthorised candidate');
      }
      scopedPaths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'entropy provider policy request candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('entropy provider policy request candidate hash path is inconsistent');
      assertHash(hash.sha256, 'entropy provider policy request candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('entropy provider policy request candidate hash bytes are invalid');
    });
  });
  if (scopedPaths.size !== candidatePaths.size) throw new Error('entropy provider policy request candidate coverage is incomplete');

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('entropy provider policy request cannot grant or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_human_entropy_provider_policy_decision_no_provider_implementation_or_entropy_output') {
    throw new Error('entropy provider policy request nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionEntropyProviderPolicyRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionEntropyProviderPolicyRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }
  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid entropy provider policy request at line ${index + 1}: ${error.message}`); }
    });
  }
  findBySourceBindingDecisionId(decisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.sourceBindingDecision
      && record.payload.sourceBindingDecision.id === decisionId) || null;
  }
  appendSigned(payload, signingKey, signingKeyId = 'production-execution-entropy-provider-policy-request-key') {
    assertSigningKey(signingKey);
    assertEntropyProviderPolicyRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('entropy provider policy request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findBySourceBindingDecisionId(payload.sourceBindingDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed entropy provider policy request already exists for decision: ${payload.sourceBindingDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `entropy_provider_policy_request_${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      signingKeyId,
      signatureAlgorithm: 'hmac-sha256',
      previousRecordHash,
      payloadHash,
      payload,
    };
    const recordHash = sha256(stableStringify(unsigned));
    const record = { ...unsigned, recordHash, signature: hmac(signingKey, recordHash) };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return { record, idempotent: false };
  }
  verify(signingKey) {
    assertSigningKey(signingKey);
    const records = this.readRecords();
    let previousRecordHash = 'GENESIS';
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record.sequence !== index + 1) return { valid: false, index, reason: 'sequence_mismatch' };
      if (record.previousRecordHash !== previousRecordHash) return { valid: false, index, reason: 'previous_hash_mismatch' };
      if (record.signatureAlgorithm !== 'hmac-sha256') return { valid: false, index, reason: 'signature_algorithm_mismatch' };
      try { assertEntropyProviderPolicyRequestPayload(record.payload); }
      catch (error) { return { valid: false, index, reason: 'payload_contract_invalid', error: error.message }; }
      if (record.payloadHash !== sha256(stableStringify(record.payload))) return { valid: false, index, reason: 'payload_hash_mismatch' };
      const { recordHash, signature, ...unsigned } = record;
      const expectedRecordHash = sha256(stableStringify(unsigned));
      if (recordHash !== expectedRecordHash) return { valid: false, index, reason: 'record_hash_mismatch' };
      if (!safeEqualHex(signature, hmac(signingKey, recordHash))) return { valid: false, index, reason: 'signature_mismatch' };
      previousRecordHash = recordHash;
    }
    return { valid: true, records: records.length, finalHash: previousRecordHash };
  }
}

module.exports = {
  ENTROPY_PROVIDER_POLICY_REQUEST_AUTHORITY,
  ENTROPY_PROVIDER_POLICY_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
  REQUIRED_CHARACTERISTICS,
  ProductionExecutionEntropyProviderPolicyRequestStore,
  assertEntropyProviderPolicyRequestPayload,
};
