'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const EXECUTION_TOKEN_REQUEST_AUTHORITY = 'single_use_execution_token_request_only_no_token_or_execution_authority';
const EXECUTION_TOKEN_REQUEST_STATUS = 'pending_manual_single_use_execution_token_review';
const MIN_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 300;

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
  assertObject(safety, 'execution token request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution token request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution token request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution token request safety requires productionTarget=null');
}

function assertExecutionTokenRequestPayload(payload) {
  assertObject(payload, 'execution token request payload');
  if (payload.schemaVersion !== 1) throw new Error('execution token request schemaVersion must be 1');
  if (payload.requestType !== 'single_use_execution_token_request') throw new Error('execution token request type is invalid');
  if (payload.mode !== 'token_request_record_only') throw new Error('execution token request mode is invalid');
  if (payload.authority !== EXECUTION_TOKEN_REQUEST_AUTHORITY) throw new Error('execution token request authority is invalid');
  if (payload.status !== EXECUTION_TOKEN_REQUEST_STATUS) throw new Error('execution token request status is invalid');

  assertObject(payload.authorisationDecision, 'execution token request authorisationDecision');
  for (const field of [
    'id', 'authorisationRequestId', 'executionPlanDecisionId', 'executionPlanId',
    'sourceDecisionId', 'changeRequestId', 'applicationId',
  ]) {
    if (typeof payload.authorisationDecision[field] !== 'string' || !payload.authorisationDecision[field]) {
      throw new TypeError(`execution token request authorisationDecision requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'candidateSnapshotHash',
    'executionStepsHash', 'requestFreshSnapshotHash', 'decisionFreshSnapshotHash',
    'backupManifestHash', 'restoreManifestHash',
  ]) assertHash(payload.authorisationDecision[field], `execution token request authorisationDecision ${field}`);

  assertObject(payload.requester, 'execution token request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`execution token request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('execution token request requester note is invalid');
  }

  assertObject(payload.validity, 'execution token request validity');
  for (const field of ['requestedAt', 'validFrom', 'expiresAt', 'upstreamExpiresAt']) {
    assertIso(payload.validity[field], `execution token request validity ${field}`);
  }
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('execution token request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  const upstreamExpiresAt = Date.parse(payload.validity.upstreamExpiresAt);
  if (requestedAt !== validFrom) throw new Error('execution token request requestedAt must equal validFrom');
  if (expiresAt - validFrom !== payload.validity.durationSeconds * 1000) {
    throw new Error('execution token request validity duration is inconsistent');
  }
  if (expiresAt > upstreamExpiresAt) throw new Error('execution token request cannot outlive its upstream authorisation window');
  if (payload.validity.timeLimited !== true || payload.validity.singleUseRequested !== true
    || payload.validity.expiredAtCreation !== false) {
    throw new Error('execution token request validity flags are invalid');
  }

  assertObject(payload.tokenState, 'execution token request tokenState');
  if (payload.tokenState.tokenMaterialIssued !== false || payload.tokenState.tokenDigest !== null
    || payload.tokenState.tokenId !== null || payload.tokenState.consumed !== false
    || payload.tokenState.useCount !== 0 || payload.tokenState.maxUses !== 1) {
    throw new Error('execution token request cannot issue or consume token material');
  }

  assertObject(payload.finalSnapshot, 'execution token request finalSnapshot');
  assertIso(payload.finalSnapshot.verifiedAt, 'execution token request finalSnapshot verifiedAt');
  assertHash(payload.finalSnapshot.snapshotHash, 'execution token request finalSnapshot snapshotHash');
  if (Date.parse(payload.finalSnapshot.verifiedAt) !== validFrom) {
    throw new Error('execution token request final snapshot must be captured at validFrom');
  }
  if (payload.finalSnapshot.allMatchAuthorisationDecision !== true
    || !Array.isArray(payload.finalSnapshot.candidates) || payload.finalSnapshot.candidates.length < 1) {
    throw new Error('execution token request finalSnapshot is incomplete');
  }
  const candidatePaths = new Set();
  payload.finalSnapshot.candidates.forEach((candidate, index) => {
    assertObject(candidate, `execution token request final candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
      throw new TypeError('execution token request final candidate path is invalid');
    }
    if (candidatePaths.has(candidate.proposedRepositoryPath)) throw new Error('execution token request has duplicate candidate paths');
    candidatePaths.add(candidate.proposedRepositoryPath);
    for (const field of ['currentSha256', 'authorisationSha256']) {
      assertHash(candidate[field], `execution token request final candidate ${field}`);
    }
    for (const field of ['currentBytes', 'authorisationBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) {
        throw new Error(`execution token request final candidate ${field} is invalid`);
      }
    }
    if (candidate.currentSha256 !== candidate.authorisationSha256
      || candidate.currentBytes !== candidate.authorisationBytes
      || candidate.matchAuthorisationDecision !== true || candidate.writeAllowed !== false) {
      throw new Error('execution token request final candidate does not match the signed authorisation decision');
    }
  });
  if (payload.finalSnapshot.snapshotHash !== sha256(stableStringify(payload.finalSnapshot.candidates))) {
    throw new Error('execution token request finalSnapshot snapshotHash is invalid');
  }

  assertObject(payload.scope, 'execution token request scope');
  if (payload.scope.scopeType !== 'candidate_paths_and_plan_operations_only') {
    throw new Error('execution token request scope type is invalid');
  }
  if (!Array.isArray(payload.scope.targetIds) || payload.scope.targetIds.length < 1
    || new Set(payload.scope.targetIds).size !== payload.scope.targetIds.length) {
    throw new Error('execution token request scope targetIds are invalid');
  }
  if (!Number.isInteger(payload.scope.operationCount) || payload.scope.operationCount < 1
    || !Number.isInteger(payload.scope.candidateCount) || payload.scope.candidateCount !== candidatePaths.size) {
    throw new Error('execution token request scope counts are invalid');
  }
  if (!Array.isArray(payload.scope.operations) || payload.scope.operations.length !== payload.scope.operationCount) {
    throw new Error('execution token request scope operations are inconsistent');
  }
  const scopedTargets = new Set();
  const scopedPaths = new Set();
  payload.scope.operations.forEach((operation, index) => {
    assertObject(operation, `execution token request operation ${index}`);
    if (operation.sequence !== index + 1) throw new Error('execution token request operation sequence is invalid');
    if (typeof operation.targetId !== 'string' || !operation.targetId) throw new TypeError('execution token request operation targetId is invalid');
    if (scopedTargets.has(operation.targetId)) throw new Error('execution token request has duplicate operation targets');
    scopedTargets.add(operation.targetId);
    if (operation.operation !== 'manual_review_and_integrate_evidence') throw new Error('execution token request operation is invalid');
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes) || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('execution token request operation candidate scope is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (!candidatePaths.has(candidatePath)) throw new Error('execution token request operation references an unknown candidate path');
      scopedPaths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'execution token request operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('execution token request operation candidate hash path is inconsistent');
      assertHash(hash.sha256, 'execution token request operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('execution token request operation candidate hash bytes are invalid');
      const snapshot = payload.finalSnapshot.candidates.find((candidate) => candidate.proposedRepositoryPath === candidatePath);
      if (!snapshot || hash.sha256 !== snapshot.currentSha256 || hash.bytes !== snapshot.currentBytes) {
        throw new Error('execution token request operation hash does not match final snapshot');
      }
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('execution token request operation cannot grant execution');
    }
  });
  if (stableStringify([...scopedTargets].sort()) !== stableStringify([...payload.scope.targetIds].sort())) {
    throw new Error('execution token request operation targets do not match scope targetIds');
  }
  if (scopedPaths.size !== candidatePaths.size) throw new Error('execution token request scope does not cover every final candidate');
  assertHash(payload.scope.scopeHash, 'execution token request scope scopeHash');
  if (payload.scope.scopeHash !== sha256(stableStringify({
    targetIds: payload.scope.targetIds,
    operations: payload.scope.operations,
  }))) throw new Error('execution token request scopeHash is invalid');

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('execution token request cannot grant, issue or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_human_execution_token_decision_and_final_preflight') {
    throw new Error('execution token request nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionTokenRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionTokenRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid execution token request at line ${index + 1}: ${error.message}`); }
    });
  }

  findByAuthorisationDecisionId(authorisationDecisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.authorisationDecision
      && record.payload.authorisationDecision.id === authorisationDecisionId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-token-request-key') {
    assertSigningKey(signingKey);
    assertExecutionTokenRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('execution token request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByAuthorisationDecisionId(payload.authorisationDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed execution token request already exists for authorisation decision: ${payload.authorisationDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_token_request_${crypto.randomUUID()}`,
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
      try { assertExecutionTokenRequestPayload(record.payload); }
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
  EXECUTION_TOKEN_REQUEST_AUTHORITY,
  EXECUTION_TOKEN_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  ProductionExecutionTokenRequestStore,
  assertExecutionTokenRequestPayload,
};
