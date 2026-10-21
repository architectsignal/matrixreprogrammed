'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const ENTROPY_SOURCE_BINDING_REQUEST_AUTHORITY =
  'single_use_entropy_source_binding_request_only_class_bound_no_provider_implementation_entropy_or_execution_authority';
const ENTROPY_SOURCE_BINDING_REQUEST_STATUS = 'pending_manual_entropy_source_binding_review';
const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 8;
const MIN_REMAINING_SECONDS = 1;

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
  assertObject(safety, 'entropy source binding request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`entropy source binding request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`entropy source binding request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('entropy source binding request safety requires productionTarget=null');
}
function assertBindingState(state) {
  assertObject(state, 'entropy source binding request bindingState');
  if (state.bindingRequested !== true
    || state.permittedSourceClass !== 'operating_system_csprng'
    || state.sourceClassBound !== true
    || state.boundSourceClass !== 'operating_system_csprng'
    || state.providerSelectionRequired !== true
    || state.providerSelected !== false || state.providerName !== null
    || state.implementationSelectionRequired !== true
    || state.implementationSelected !== false || state.implementationName !== null
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
    throw new Error('entropy source binding request may bind only the approved class and cannot select a provider or implementation, produce entropy, or create secret material');
  }
}
function assertCandidate(candidate, field) {
  assertObject(candidate, field);
  if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
    throw new TypeError(`${field} proposedRepositoryPath is invalid`);
  }
  for (const name of ['currentSha256', 'sourceSelectionDecisionSha256']) assertHash(candidate[name], `${field} ${name}`);
  for (const name of ['currentBytes', 'sourceSelectionDecisionBytes']) {
    if (!Number.isInteger(candidate[name]) || candidate[name] < 0) throw new Error(`${field} ${name} is invalid`);
  }
  if (candidate.currentSha256 !== candidate.sourceSelectionDecisionSha256
    || candidate.currentBytes !== candidate.sourceSelectionDecisionBytes
    || candidate.matchSourceSelectionDecision !== true || candidate.writeAllowed !== false) {
    throw new Error(`${field} does not match the signed source selection decision`);
  }
}
function assertEntropySourceBindingRequestPayload(payload) {
  assertObject(payload, 'entropy source binding request payload');
  if (payload.schemaVersion !== 1) throw new Error('entropy source binding request schemaVersion must be 1');
  if (payload.requestType !== 'single_use_entropy_source_binding_request') throw new Error('entropy source binding request type is invalid');
  if (payload.mode !== 'entropy_source_binding_request_record_only') throw new Error('entropy source binding request mode is invalid');
  if (payload.authority !== ENTROPY_SOURCE_BINDING_REQUEST_AUTHORITY) throw new Error('entropy source binding request authority is invalid');
  if (payload.status !== ENTROPY_SOURCE_BINDING_REQUEST_STATUS) throw new Error('entropy source binding request status is invalid');

  assertObject(payload.sourceSelectionDecision, 'entropy source binding request sourceSelectionDecision');
  for (const field of ['id', 'sourceSelectionRequestId', 'entropyDecisionId', 'entropyRequestId', 'applicationId']) {
    if (typeof payload.sourceSelectionDecision[field] !== 'string' || !payload.sourceSelectionDecision[field]) {
      throw new TypeError(`entropy source binding request sourceSelectionDecision requires ${field}`);
    }
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint', 'scopeHash', 'preflightSnapshotHash']) {
    assertHash(payload.sourceSelectionDecision[field], `entropy source binding request sourceSelectionDecision ${field}`);
  }

  assertObject(payload.requester, 'entropy source binding request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`entropy source binding request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('entropy source binding request requester note is invalid');
  }

  assertObject(payload.validity, 'entropy source binding request validity');
  for (const field of ['requestedAt', 'validFrom', 'expiresAt', 'sourceSelectionRequestExpiresAt', 'entropyRequestExpiresAt']) {
    assertIso(payload.validity[field], `entropy source binding request validity ${field}`);
  }
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('entropy source binding request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  if (requestedAt !== validFrom || expiresAt - validFrom !== payload.validity.durationSeconds * 1000
    || expiresAt > Date.parse(payload.validity.sourceSelectionRequestExpiresAt)
    || expiresAt > Date.parse(payload.validity.entropyRequestExpiresAt)) {
    throw new Error('entropy source binding request validity is inconsistent');
  }
  if (payload.validity.timeLimited !== true || payload.validity.singleUseBindingRequested !== true
    || payload.validity.expiredAtCreation !== false) {
    throw new Error('entropy source binding request validity flags are invalid');
  }

  assertBindingState(payload.bindingState);
  assertObject(payload.lastMomentPreflight, 'entropy source binding request lastMomentPreflight');
  assertIso(payload.lastMomentPreflight.verifiedAt, 'entropy source binding request lastMomentPreflight verifiedAt');
  assertHash(payload.lastMomentPreflight.snapshotHash, 'entropy source binding request lastMomentPreflight snapshotHash');
  if (Date.parse(payload.lastMomentPreflight.verifiedAt) !== validFrom
    || payload.lastMomentPreflight.allMatchSourceSelectionDecision !== true
    || !Array.isArray(payload.lastMomentPreflight.candidates)
    || payload.lastMomentPreflight.candidates.length < 1) {
    throw new Error('entropy source binding request lastMomentPreflight is incomplete');
  }
  const candidatePaths = new Set();
  payload.lastMomentPreflight.candidates.forEach((candidate, index) => {
    assertCandidate(candidate, `entropy source binding request candidate ${index}`);
    if (candidatePaths.has(candidate.proposedRepositoryPath)) throw new Error('entropy source binding request has duplicate candidates');
    candidatePaths.add(candidate.proposedRepositoryPath);
  });
  if (payload.lastMomentPreflight.snapshotHash !== sha256(stableStringify(payload.lastMomentPreflight.candidates))) {
    throw new Error('entropy source binding request preflight snapshotHash is invalid');
  }

  assertObject(payload.scope, 'entropy source binding request scope');
  if (payload.scope.scopeType !== 'source_selection_decision_bound_candidate_paths_and_operations_only'
    || payload.scope.exactScopeMatch !== true) throw new Error('entropy source binding request scope boundary is invalid');
  for (const field of ['sourceSelectionRequestScopeHash', 'sourceSelectionDecisionScopeHash', 'recomputedScopeHash']) {
    assertHash(payload.scope[field], `entropy source binding request scope ${field}`);
  }
  if (new Set([payload.scope.sourceSelectionRequestScopeHash, payload.scope.sourceSelectionDecisionScopeHash, payload.scope.recomputedScopeHash]).size !== 1) {
    throw new Error('entropy source binding request scope hashes do not match');
  }
  if (!Array.isArray(payload.scope.targetIds) || payload.scope.targetIds.length < 1
    || new Set(payload.scope.targetIds).size !== payload.scope.targetIds.length
    || !Array.isArray(payload.scope.operations) || payload.scope.operations.length < 1
    || payload.scope.operationCount !== payload.scope.operations.length
    || payload.scope.candidateCount !== candidatePaths.size) {
    throw new Error('entropy source binding request scope counts are invalid');
  }
  const scopedPaths = new Set();
  payload.scope.operations.forEach((operation, index) => {
    assertObject(operation, `entropy source binding request operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence'
      || !Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes) || operation.candidateHashes.length !== operation.candidatePaths.length
      || operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('entropy source binding request operation is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (!candidatePaths.has(candidatePath)) throw new Error('entropy source binding request operation references an unknown candidate');
      scopedPaths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'entropy source binding request operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('entropy source binding request operation hash path is inconsistent');
      assertHash(hash.sha256, 'entropy source binding request operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('entropy source binding request operation candidate hash bytes are invalid');
      const preflight = payload.lastMomentPreflight.candidates.find((item) => item.proposedRepositoryPath === candidatePath);
      if (!preflight || hash.sha256 !== preflight.currentSha256 || hash.bytes !== preflight.currentBytes) {
        throw new Error('entropy source binding request operation hash does not match preflight');
      }
    });
  });
  if (scopedPaths.size !== candidatePaths.size
    || payload.scope.recomputedScopeHash !== sha256(stableStringify({ targetIds: payload.scope.targetIds, operations: payload.scope.operations }))) {
    throw new Error('entropy source binding request scope is incomplete or invalid');
  }

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('entropy source binding request cannot grant or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_human_entropy_source_binding_decision_no_provider_implementation_or_entropy_output') {
    throw new Error('entropy source binding request nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionEntropySourceBindingRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionEntropySourceBindingRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }
  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid entropy source binding request at line ${index + 1}: ${error.message}`); }
    });
  }
  findBySourceSelectionDecisionId(decisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.sourceSelectionDecision
      && record.payload.sourceSelectionDecision.id === decisionId) || null;
  }
  appendSigned(payload, signingKey, signingKeyId = 'production-execution-entropy-source-binding-request-key') {
    assertSigningKey(signingKey);
    assertEntropySourceBindingRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('entropy source binding request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findBySourceSelectionDecisionId(payload.sourceSelectionDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed entropy source binding request already exists for decision: ${payload.sourceSelectionDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `entropy_source_binding_request_${crypto.randomUUID()}`,
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
      try { assertEntropySourceBindingRequestPayload(record.payload); }
      catch (error) { return { valid: false, index, reason: 'payload_contract_invalid', error: error.message }; }
      if (record.payloadHash !== sha256(stableStringify(record.payload))) return { valid: false, index, reason: 'payload_hash_mismatch' };
      const { recordHash, signature, ...unsigned } = record;
      if (recordHash !== sha256(stableStringify(unsigned))) return { valid: false, index, reason: 'record_hash_mismatch' };
      if (!safeEqualHex(signature, hmac(signingKey, recordHash))) return { valid: false, index, reason: 'signature_mismatch' };
      previousRecordHash = recordHash;
    }
    return { valid: true, records: records.length, finalHash: previousRecordHash };
  }
}

module.exports = {
  ENTROPY_SOURCE_BINDING_REQUEST_AUTHORITY,
  ENTROPY_SOURCE_BINDING_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
  ProductionExecutionEntropySourceBindingRequestStore,
  assertEntropySourceBindingRequestPayload,
};
