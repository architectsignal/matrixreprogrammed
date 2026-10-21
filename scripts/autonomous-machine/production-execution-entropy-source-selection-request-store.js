'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const ENTROPY_SOURCE_SELECTION_REQUEST_AUTHORITY =
  'single_use_entropy_source_selection_request_only_no_source_selected_or_entropy_output';
const ENTROPY_SOURCE_SELECTION_REQUEST_STATUS = 'pending_manual_entropy_source_selection_review';
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 10;
const MIN_REMAINING_SECONDS = 2;

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
  assertObject(safety, 'entropy source selection request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`entropy source selection request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`entropy source selection request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('entropy source selection request safety requires productionTarget=null');
}
function assertCandidate(candidate, field) {
  assertObject(candidate, field);
  if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
    throw new TypeError(`${field} proposedRepositoryPath is invalid`);
  }
  for (const name of ['currentSha256', 'entropyDecisionSha256']) assertHash(candidate[name], `${field} ${name}`);
  for (const name of ['currentBytes', 'entropyDecisionBytes']) {
    if (!Number.isInteger(candidate[name]) || candidate[name] < 0) throw new Error(`${field} ${name} is invalid`);
  }
  if (candidate.currentSha256 !== candidate.entropyDecisionSha256
    || candidate.currentBytes !== candidate.entropyDecisionBytes
    || candidate.matchEntropyDecision !== true || candidate.writeAllowed !== false) {
    throw new Error(`${field} does not match the signed entropy decision`);
  }
}
function assertSelectionState(state) {
  assertObject(state, 'entropy source selection request selectionState');
  if (state.selectionRequested !== true
    || !Array.isArray(state.permittedSourceClasses)
    || state.permittedSourceClasses.length !== 1
    || state.permittedSourceClasses[0] !== 'operating_system_csprng'
    || state.requestedSourceClass !== null
    || state.entropySourceSelected !== false
    || state.entropySource !== null
    || state.providerSelected !== false
    || state.providerName !== null
    || state.networkSourceAllowed !== false
    || state.externalProviderAllowed !== false
    || state.entropyBytesRequested !== 0
    || state.entropyGenerated !== false
    || state.entropyOutput !== null
    || state.entropyDigest !== null
    || state.tokenMaterialGenerated !== false
    || state.tokenMaterialIssued !== false
    || state.tokenDigest !== null
    || state.tokenId !== null
    || state.bearerSecretGenerated !== false
    || state.bearerSecretIssued !== false
    || state.credentialGenerated !== false
    || state.credentialIssued !== false
    || state.consumed !== false || state.useCount !== 0 || state.maxUses !== 1) {
    throw new Error('entropy source selection request cannot select a provider, request bytes, produce entropy, or create secret material');
  }
}
function assertEntropySourceSelectionRequestPayload(payload) {
  assertObject(payload, 'entropy source selection request payload');
  if (payload.schemaVersion !== 1) throw new Error('entropy source selection request schemaVersion must be 1');
  if (payload.requestType !== 'single_use_entropy_source_selection_request') {
    throw new Error('entropy source selection request type is invalid');
  }
  if (payload.mode !== 'entropy_source_selection_request_record_only') {
    throw new Error('entropy source selection request mode is invalid');
  }
  if (payload.authority !== ENTROPY_SOURCE_SELECTION_REQUEST_AUTHORITY) {
    throw new Error('entropy source selection request authority is invalid');
  }
  if (payload.status !== ENTROPY_SOURCE_SELECTION_REQUEST_STATUS) {
    throw new Error('entropy source selection request status is invalid');
  }

  assertObject(payload.entropyDecision, 'entropy source selection request entropyDecision');
  for (const field of ['id', 'entropyRequestId', 'applicationId']) {
    if (typeof payload.entropyDecision[field] !== 'string' || !payload.entropyDecision[field]) {
      throw new TypeError(`entropy source selection request entropyDecision requires ${field}`);
    }
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint', 'scopeHash', 'preflightSnapshotHash']) {
    assertHash(payload.entropyDecision[field], `entropy source selection request entropyDecision ${field}`);
  }

  assertObject(payload.requester, 'entropy source selection request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`entropy source selection request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('entropy source selection request requester note is invalid');
  }

  assertObject(payload.validity, 'entropy source selection request validity');
  for (const field of ['requestedAt', 'validFrom', 'expiresAt', 'entropyRequestExpiresAt']) {
    assertIso(payload.validity[field], `entropy source selection request validity ${field}`);
  }
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('entropy source selection request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  if (requestedAt !== validFrom || expiresAt - validFrom !== payload.validity.durationSeconds * 1000
    || expiresAt > Date.parse(payload.validity.entropyRequestExpiresAt)) {
    throw new Error('entropy source selection request validity is inconsistent');
  }
  if (payload.validity.timeLimited !== true
    || payload.validity.singleUseSourceSelectionRequested !== true
    || payload.validity.expiredAtCreation !== false) {
    throw new Error('entropy source selection request validity flags are invalid');
  }

  assertSelectionState(payload.selectionState);

  assertObject(payload.lastMomentPreflight, 'entropy source selection request lastMomentPreflight');
  assertIso(payload.lastMomentPreflight.verifiedAt, 'entropy source selection request lastMomentPreflight verifiedAt');
  assertHash(payload.lastMomentPreflight.snapshotHash, 'entropy source selection request lastMomentPreflight snapshotHash');
  if (Date.parse(payload.lastMomentPreflight.verifiedAt) !== validFrom
    || payload.lastMomentPreflight.allMatchEntropyDecision !== true
    || !Array.isArray(payload.lastMomentPreflight.candidates)
    || payload.lastMomentPreflight.candidates.length < 1) {
    throw new Error('entropy source selection request lastMomentPreflight is incomplete');
  }
  const candidatePaths = new Set();
  payload.lastMomentPreflight.candidates.forEach((candidate, index) => {
    assertCandidate(candidate, `entropy source selection request candidate ${index}`);
    if (candidatePaths.has(candidate.proposedRepositoryPath)) {
      throw new Error('entropy source selection request has duplicate candidates');
    }
    candidatePaths.add(candidate.proposedRepositoryPath);
  });
  if (payload.lastMomentPreflight.snapshotHash !== sha256(stableStringify(payload.lastMomentPreflight.candidates))) {
    throw new Error('entropy source selection request preflight snapshotHash is invalid');
  }

  assertObject(payload.scope, 'entropy source selection request scope');
  if (payload.scope.scopeType !== 'entropy_decision_bound_candidate_paths_and_operations_only'
    || payload.scope.exactScopeMatch !== true) {
    throw new Error('entropy source selection request scope boundary is invalid');
  }
  for (const field of ['entropyRequestScopeHash', 'entropyDecisionScopeHash', 'recomputedScopeHash']) {
    assertHash(payload.scope[field], `entropy source selection request scope ${field}`);
  }
  if (new Set([
    payload.scope.entropyRequestScopeHash,
    payload.scope.entropyDecisionScopeHash,
    payload.scope.recomputedScopeHash,
  ]).size !== 1) {
    throw new Error('entropy source selection request scope hashes do not match');
  }
  if (!Array.isArray(payload.scope.targetIds) || payload.scope.targetIds.length < 1
    || new Set(payload.scope.targetIds).size !== payload.scope.targetIds.length
    || !Number.isInteger(payload.scope.operationCount) || payload.scope.operationCount < 1
    || !Number.isInteger(payload.scope.candidateCount) || payload.scope.candidateCount !== candidatePaths.size
    || !Array.isArray(payload.scope.operations) || payload.scope.operations.length !== payload.scope.operationCount) {
    throw new Error('entropy source selection request scope counts are invalid');
  }
  const scopedPaths = new Set();
  payload.scope.operations.forEach((operation, index) => {
    assertObject(operation, `entropy source selection request operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence') {
      throw new Error('entropy source selection request operation identity is invalid');
    }
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('entropy source selection request operation candidate scope is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (!candidatePaths.has(candidatePath)) {
        throw new Error('entropy source selection request operation references an unknown candidate');
      }
      scopedPaths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'entropy source selection request operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) {
        throw new Error('entropy source selection request operation candidate hash path is inconsistent');
      }
      assertHash(hash.sha256, 'entropy source selection request operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) {
        throw new Error('entropy source selection request operation candidate hash bytes are invalid');
      }
      const preflight = payload.lastMomentPreflight.candidates.find((item) => item.proposedRepositoryPath === candidatePath);
      if (!preflight || hash.sha256 !== preflight.currentSha256 || hash.bytes !== preflight.currentBytes) {
        throw new Error('entropy source selection request operation hash does not match preflight');
      }
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('entropy source selection request operation cannot grant execution');
    }
  });
  if (scopedPaths.size !== candidatePaths.size) {
    throw new Error('entropy source selection request scope does not cover every candidate');
  }
  if (payload.scope.recomputedScopeHash !== sha256(stableStringify({
    targetIds: payload.scope.targetIds,
    operations: payload.scope.operations,
  }))) {
    throw new Error('entropy source selection request recomputed scope hash is invalid');
  }

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('entropy source selection request cannot grant or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_human_entropy_source_selection_decision_no_source_or_entropy_output') {
    throw new Error('entropy source selection request nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionEntropySourceSelectionRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionEntropySourceSelectionRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }
  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid entropy source selection request at line ${index + 1}: ${error.message}`); }
    });
  }
  findByEntropyDecisionId(entropyDecisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.entropyDecision
      && record.payload.entropyDecision.id === entropyDecisionId) || null;
  }
  appendSigned(payload, signingKey, signingKeyId = 'production-execution-entropy-source-selection-request-key') {
    assertSigningKey(signingKey);
    assertEntropySourceSelectionRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('entropy source selection request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByEntropyDecisionId(payload.entropyDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed entropy source selection request already exists for decision: ${payload.entropyDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `entropy_source_selection_request_${crypto.randomUUID()}`,
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
      try { assertEntropySourceSelectionRequestPayload(record.payload); }
      catch (error) { return { valid: false, index, reason: 'payload_contract_invalid', error: error.message }; }
      if (record.payloadHash !== sha256(stableStringify(record.payload))) {
        return { valid: false, index, reason: 'payload_hash_mismatch' };
      }
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
  ENTROPY_SOURCE_SELECTION_REQUEST_AUTHORITY,
  ENTROPY_SOURCE_SELECTION_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
  ProductionExecutionEntropySourceSelectionRequestStore,
  assertEntropySourceSelectionRequestPayload,
};