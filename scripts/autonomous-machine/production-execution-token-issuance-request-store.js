'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const EXECUTION_TOKEN_ISSUANCE_REQUEST_AUTHORITY =
  'single_use_execution_token_issuance_request_only_no_token_or_execution_authority';
const EXECUTION_TOKEN_ISSUANCE_REQUEST_STATUS =
  'pending_manual_single_use_execution_token_issuance_review';
const MIN_DURATION_SECONDS = 10;
const MAX_DURATION_SECONDS = 60;
const MIN_REMAINING_SECONDS = 10;

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
  assertObject(safety, 'execution token issuance request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution token issuance request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution token issuance request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution token issuance request safety requires productionTarget=null');
}

function assertExecutionTokenIssuanceRequestPayload(payload) {
  assertObject(payload, 'execution token issuance request payload');
  if (payload.schemaVersion !== 1) throw new Error('execution token issuance request schemaVersion must be 1');
  if (payload.requestType !== 'single_use_execution_token_issuance_request') throw new Error('execution token issuance request type is invalid');
  if (payload.mode !== 'token_issuance_request_record_only') throw new Error('execution token issuance request mode is invalid');
  if (payload.authority !== EXECUTION_TOKEN_ISSUANCE_REQUEST_AUTHORITY) throw new Error('execution token issuance request authority is invalid');
  if (payload.status !== EXECUTION_TOKEN_ISSUANCE_REQUEST_STATUS) throw new Error('execution token issuance request status is invalid');

  assertObject(payload.tokenDecision, 'execution token issuance request tokenDecision');
  for (const field of [
    'id', 'tokenRequestId', 'authorisationDecisionId', 'authorisationRequestId',
    'executionPlanDecisionId', 'executionPlanId', 'sourceDecisionId',
    'changeRequestId', 'applicationId',
  ]) {
    if (typeof payload.tokenDecision[field] !== 'string' || !payload.tokenDecision[field]) {
      throw new TypeError(`execution token issuance request tokenDecision requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'requestScopeHash',
    'requestFinalSnapshotHash', 'decisionPreflightSnapshotHash', 'decisionScopeHash',
    'candidateSnapshotHash', 'executionStepsHash', 'backupManifestHash',
    'restoreManifestHash',
  ]) assertHash(payload.tokenDecision[field], `execution token issuance request tokenDecision ${field}`);

  assertObject(payload.requester, 'execution token issuance request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`execution token issuance request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('execution token issuance request requester note is invalid');
  }

  assertObject(payload.validity, 'execution token issuance request validity');
  for (const field of ['requestedAt', 'validFrom', 'expiresAt', 'tokenRequestExpiresAt', 'upstreamExpiresAt']) {
    assertIso(payload.validity[field], `execution token issuance request validity ${field}`);
  }
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('execution token issuance request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  const tokenRequestExpiresAt = Date.parse(payload.validity.tokenRequestExpiresAt);
  const upstreamExpiresAt = Date.parse(payload.validity.upstreamExpiresAt);
  if (requestedAt !== validFrom) throw new Error('execution token issuance request requestedAt must equal validFrom');
  if (expiresAt - validFrom !== payload.validity.durationSeconds * 1000) throw new Error('execution token issuance request validity duration is inconsistent');
  if (expiresAt > tokenRequestExpiresAt || expiresAt > upstreamExpiresAt) throw new Error('execution token issuance request cannot outlive its signed authorisation windows');
  if (payload.validity.timeLimited !== true
    || payload.validity.singleUseIssuanceRequested !== true
    || payload.validity.expiredAtCreation !== false) {
    throw new Error('execution token issuance request validity flags are invalid');
  }

  assertObject(payload.issuanceState, 'execution token issuance request issuanceState');
  if (payload.issuanceState.issuanceRequested !== true
    || payload.issuanceState.tokenMaterialIssued !== false
    || payload.issuanceState.tokenDigest !== null
    || payload.issuanceState.tokenId !== null
    || payload.issuanceState.bearerSecretIssued !== false
    || payload.issuanceState.credentialIssued !== false
    || payload.issuanceState.consumed !== false
    || payload.issuanceState.useCount !== 0
    || payload.issuanceState.maxUses !== 1) {
    throw new Error('execution token issuance request cannot issue or consume token material');
  }

  assertObject(payload.lastMomentPreflight, 'execution token issuance request lastMomentPreflight');
  assertIso(payload.lastMomentPreflight.verifiedAt, 'execution token issuance request lastMomentPreflight verifiedAt');
  assertHash(payload.lastMomentPreflight.snapshotHash, 'execution token issuance request lastMomentPreflight snapshotHash');
  if (Date.parse(payload.lastMomentPreflight.verifiedAt) !== validFrom
    || payload.lastMomentPreflight.allMatchTokenDecision !== true
    || !Array.isArray(payload.lastMomentPreflight.candidates)
    || payload.lastMomentPreflight.candidates.length < 1) {
    throw new Error('execution token issuance request lastMomentPreflight is incomplete');
  }
  const candidatePaths = new Set();
  payload.lastMomentPreflight.candidates.forEach((candidate, index) => {
    assertObject(candidate, `execution token issuance request preflight candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) throw new TypeError('execution token issuance request preflight candidate path is invalid');
    if (candidatePaths.has(candidate.proposedRepositoryPath)) throw new Error('execution token issuance request has duplicate preflight candidate paths');
    candidatePaths.add(candidate.proposedRepositoryPath);
    for (const field of ['currentSha256', 'decisionSha256']) assertHash(candidate[field], `execution token issuance request preflight candidate ${field}`);
    for (const field of ['currentBytes', 'decisionBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) throw new Error(`execution token issuance request preflight candidate ${field} is invalid`);
    }
    if (candidate.currentSha256 !== candidate.decisionSha256
      || candidate.currentBytes !== candidate.decisionBytes
      || candidate.matchTokenDecision !== true
      || candidate.writeAllowed !== false) {
      throw new Error('execution token issuance request preflight candidate does not match the signed token decision');
    }
  });
  if (payload.lastMomentPreflight.snapshotHash !== sha256(stableStringify(payload.lastMomentPreflight.candidates))) throw new Error('execution token issuance request lastMomentPreflight snapshotHash is invalid');

  assertObject(payload.scope, 'execution token issuance request scope');
  if (payload.scope.scopeType !== 'decision_bound_candidate_paths_and_operations_only'
    || payload.scope.exactScopeMatch !== true) throw new Error('execution token issuance request scope boundary is invalid');
  for (const field of ['tokenRequestScopeHash', 'tokenDecisionScopeHash', 'recomputedScopeHash']) {
    assertHash(payload.scope[field], `execution token issuance request scope ${field}`);
  }
  if (payload.scope.tokenRequestScopeHash !== payload.scope.tokenDecisionScopeHash
    || payload.scope.tokenRequestScopeHash !== payload.scope.recomputedScopeHash) throw new Error('execution token issuance request scope hashes do not match');
  if (!Array.isArray(payload.scope.targetIds) || payload.scope.targetIds.length < 1
    || new Set(payload.scope.targetIds).size !== payload.scope.targetIds.length
    || !Number.isInteger(payload.scope.operationCount) || payload.scope.operationCount < 1
    || !Number.isInteger(payload.scope.candidateCount) || payload.scope.candidateCount !== candidatePaths.size
    || !Array.isArray(payload.scope.operations) || payload.scope.operations.length !== payload.scope.operationCount) {
    throw new Error('execution token issuance request scope counts are invalid');
  }
  const scopedPaths = new Set();
  payload.scope.operations.forEach((operation, index) => {
    assertObject(operation, `execution token issuance request operation ${index}`);
    if (operation.sequence !== index + 1
      || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence') throw new Error('execution token issuance request operation identity is invalid');
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length) throw new Error('execution token issuance request operation candidate scope is invalid');
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (!candidatePaths.has(candidatePath)) throw new Error('execution token issuance request operation references an unknown candidate path');
      scopedPaths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'execution token issuance request operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('execution token issuance request operation candidate hash path is inconsistent');
      assertHash(hash.sha256, 'execution token issuance request operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('execution token issuance request operation candidate hash bytes are invalid');
      const preflight = payload.lastMomentPreflight.candidates.find((candidate) => candidate.proposedRepositoryPath === candidatePath);
      if (!preflight || hash.sha256 !== preflight.currentSha256 || hash.bytes !== preflight.currentBytes) throw new Error('execution token issuance request operation hash does not match last-moment preflight');
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) throw new Error('execution token issuance request operation cannot grant execution');
  });
  if (scopedPaths.size !== candidatePaths.size) throw new Error('execution token issuance request scope does not cover every candidate');
  const recomputedScopeHash = sha256(stableStringify({ targetIds: payload.scope.targetIds, operations: payload.scope.operations }));
  if (payload.scope.recomputedScopeHash !== recomputedScopeHash) throw new Error('execution token issuance request recomputed scope hash is invalid');

  if (payload.productionFilePath !== null
    || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false
    || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false
    || payload.authorisationGranted !== false
    || payload.tokenIssued !== false
    || payload.executionTokenAvailable !== false) {
    throw new Error('execution token issuance request cannot grant, issue or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_human_token_issuance_decision_no_token_material') throw new Error('execution token issuance request nextAction is invalid');
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionTokenIssuanceRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionTokenIssuanceRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid execution token issuance request at line ${index + 1}: ${error.message}`); }
    });
  }

  findByTokenDecisionId(tokenDecisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.tokenDecision
      && record.payload.tokenDecision.id === tokenDecisionId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-token-issuance-request-key') {
    assertSigningKey(signingKey);
    assertExecutionTokenIssuanceRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) throw new TypeError('execution token issuance request signing key id is invalid');
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByTokenDecisionId(payload.tokenDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed execution token issuance request already exists for decision: ${payload.tokenDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_token_issuance_request_${crypto.randomUUID()}`,
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
      try { assertExecutionTokenIssuanceRequestPayload(record.payload); }
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
  EXECUTION_TOKEN_ISSUANCE_REQUEST_AUTHORITY,
  EXECUTION_TOKEN_ISSUANCE_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
  ProductionExecutionTokenIssuanceRequestStore,
  assertExecutionTokenIssuanceRequestPayload,
};
