'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const ENTROPY_GENERATION_REQUEST_AUTHORITY =
  'single_use_entropy_generation_request_only_no_entropy_output_or_execution_authority';
const ENTROPY_GENERATION_REQUEST_STATUS = 'pending_manual_entropy_generation_review';
const MIN_DURATION_SECONDS = 3;
const MAX_DURATION_SECONDS = 15;
const MIN_REMAINING_SECONDS = 3;

function hmac(signingKey, value) {
  return crypto.createHmac('sha256', signingKey).update(String(value)).digest('hex');
}

function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string'
    || !/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}
function assertHash(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new TypeError(`${field} must be a SHA-256 hash`);
  }
}
function assertIso(value, field) {
  if (typeof value !== 'string' || !value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO-8601 UTC timestamp`);
  }
}
function assertZeroSafety(safety) {
  assertObject(safety, 'entropy generation request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`entropy generation request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`entropy generation request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('entropy generation request safety requires productionTarget=null');
}

function assertEntropyGenerationRequestPayload(payload) {
  assertObject(payload, 'entropy generation request payload');
  if (payload.schemaVersion !== 1) throw new Error('entropy generation request schemaVersion must be 1');
  if (payload.requestType !== 'single_use_entropy_generation_request') throw new Error('entropy generation request type is invalid');
  if (payload.mode !== 'entropy_generation_request_record_only') throw new Error('entropy generation request mode is invalid');
  if (payload.authority !== ENTROPY_GENERATION_REQUEST_AUTHORITY) throw new Error('entropy generation request authority is invalid');
  if (payload.status !== ENTROPY_GENERATION_REQUEST_STATUS) throw new Error('entropy generation request status is invalid');

  assertObject(payload.generationDecision, 'entropy generation request generationDecision');
  for (const field of [
    'id', 'generationRequestId', 'issuanceDecisionId', 'issuanceRequestId', 'tokenDecisionId',
    'tokenRequestId', 'authorisationDecisionId', 'authorisationRequestId',
    'executionPlanDecisionId', 'executionPlanId', 'sourceDecisionId', 'changeRequestId', 'applicationId',
  ]) {
    if (typeof payload.generationDecision[field] !== 'string' || !payload.generationDecision[field]) {
      throw new TypeError(`entropy generation request generationDecision requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'requestScopeHash', 'decisionScopeHash',
    'issuanceScopeHash', 'generationScopeHash', 'generationRequestScopeHash',
    'generationDecisionScopeHash', 'requestFinalSnapshotHash', 'decisionPreflightSnapshotHash',
    'issuancePreflightSnapshotHash', 'issuanceDecisionPreflightSnapshotHash',
    'generationRequestPreflightSnapshotHash', 'generationDecisionPreflightSnapshotHash',
    'candidateSnapshotHash', 'executionStepsHash', 'backupManifestHash', 'restoreManifestHash',
  ]) assertHash(payload.generationDecision[field], `entropy generation request generationDecision ${field}`);

  assertObject(payload.requester, 'entropy generation request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`entropy generation request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('entropy generation request requester note is invalid');
  }

  assertObject(payload.validity, 'entropy generation request validity');
  for (const field of [
    'requestedAt', 'validFrom', 'expiresAt', 'generationRequestExpiresAt',
    'issuanceRequestExpiresAt', 'tokenRequestExpiresAt', 'upstreamExpiresAt',
  ]) assertIso(payload.validity[field], `entropy generation request validity ${field}`);
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('entropy generation request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  if (requestedAt !== validFrom || expiresAt - validFrom !== payload.validity.durationSeconds * 1000) {
    throw new Error('entropy generation request duration is inconsistent');
  }
  for (const field of ['generationRequestExpiresAt', 'issuanceRequestExpiresAt', 'tokenRequestExpiresAt', 'upstreamExpiresAt']) {
    if (expiresAt > Date.parse(payload.validity[field])) {
      throw new Error('entropy generation request cannot outlive signed authorisation windows');
    }
  }
  if (payload.validity.timeLimited !== true || payload.validity.singleUseEntropyGenerationRequested !== true
    || payload.validity.expiredAtCreation !== false) {
    throw new Error('entropy generation request validity flags are invalid');
  }

  assertObject(payload.entropyState, 'entropy generation request entropyState');
  if (payload.entropyState.generationRequested !== true
    || payload.entropyState.entropySourceSelected !== false
    || payload.entropyState.entropySource !== null
    || payload.entropyState.entropyBytesRequested !== 0
    || payload.entropyState.entropyGenerated !== false
    || payload.entropyState.entropyOutput !== null
    || payload.entropyState.entropyDigest !== null
    || payload.entropyState.tokenMaterialGenerated !== false
    || payload.entropyState.tokenMaterialIssued !== false
    || payload.entropyState.tokenDigest !== null
    || payload.entropyState.tokenId !== null
    || payload.entropyState.bearerSecretGenerated !== false
    || payload.entropyState.bearerSecretIssued !== false
    || payload.entropyState.credentialGenerated !== false
    || payload.entropyState.credentialIssued !== false
    || payload.entropyState.consumed !== false
    || payload.entropyState.useCount !== 0
    || payload.entropyState.maxUses !== 1) {
    throw new Error('entropy generation request cannot select a source, generate entropy, or create secret material');
  }

  assertObject(payload.lastMomentPreflight, 'entropy generation request lastMomentPreflight');
  assertIso(payload.lastMomentPreflight.verifiedAt, 'entropy generation request lastMomentPreflight verifiedAt');
  assertHash(payload.lastMomentPreflight.snapshotHash, 'entropy generation request lastMomentPreflight snapshotHash');
  if (Date.parse(payload.lastMomentPreflight.verifiedAt) !== validFrom
    || payload.lastMomentPreflight.allMatchGenerationDecision !== true
    || !Array.isArray(payload.lastMomentPreflight.candidates)
    || payload.lastMomentPreflight.candidates.length < 1) {
    throw new Error('entropy generation request lastMomentPreflight is incomplete');
  }
  const candidatePaths = new Set();
  payload.lastMomentPreflight.candidates.forEach((candidate, index) => {
    assertObject(candidate, `entropy generation request candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
      throw new TypeError('entropy generation request candidate path is invalid');
    }
    if (candidatePaths.has(candidate.proposedRepositoryPath)) throw new Error('entropy generation request has duplicate candidate paths');
    candidatePaths.add(candidate.proposedRepositoryPath);
    for (const field of ['currentSha256', 'generationDecisionSha256']) {
      assertHash(candidate[field], `entropy generation request candidate ${field}`);
    }
    for (const field of ['currentBytes', 'generationDecisionBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) throw new Error(`entropy generation request candidate ${field} is invalid`);
    }
    if (candidate.currentSha256 !== candidate.generationDecisionSha256
      || candidate.currentBytes !== candidate.generationDecisionBytes
      || candidate.matchGenerationDecision !== true || candidate.writeAllowed !== false) {
      throw new Error('entropy generation request candidate does not match the signed generation decision');
    }
  });
  if (payload.lastMomentPreflight.snapshotHash !== sha256(stableStringify(payload.lastMomentPreflight.candidates))) {
    throw new Error('entropy generation request preflight snapshotHash is invalid');
  }

  assertObject(payload.scope, 'entropy generation request scope');
  if (payload.scope.scopeType !== 'generation_decision_bound_candidate_paths_and_operations_only'
    || payload.scope.exactScopeMatch !== true) throw new Error('entropy generation request scope boundary is invalid');
  for (const field of [
    'tokenRequestScopeHash', 'tokenDecisionScopeHash', 'issuanceRequestScopeHash',
    'issuanceDecisionScopeHash', 'generationRequestScopeHash', 'generationDecisionScopeHash',
    'recomputedScopeHash',
  ]) assertHash(payload.scope[field], `entropy generation request scope ${field}`);
  const scopeHashes = [
    payload.scope.tokenRequestScopeHash, payload.scope.tokenDecisionScopeHash,
    payload.scope.issuanceRequestScopeHash, payload.scope.issuanceDecisionScopeHash,
    payload.scope.generationRequestScopeHash, payload.scope.generationDecisionScopeHash,
    payload.scope.recomputedScopeHash,
  ];
  if (new Set(scopeHashes).size !== 1) throw new Error('entropy generation request scope hashes do not match');
  if (!Array.isArray(payload.scope.targetIds) || payload.scope.targetIds.length < 1
    || new Set(payload.scope.targetIds).size !== payload.scope.targetIds.length
    || !Number.isInteger(payload.scope.operationCount) || payload.scope.operationCount < 1
    || !Number.isInteger(payload.scope.candidateCount) || payload.scope.candidateCount !== candidatePaths.size
    || !Array.isArray(payload.scope.operations) || payload.scope.operations.length !== payload.scope.operationCount) {
    throw new Error('entropy generation request scope counts are invalid');
  }
  const scopedPaths = new Set();
  payload.scope.operations.forEach((operation, index) => {
    assertObject(operation, `entropy generation request operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence') {
      throw new Error('entropy generation request operation identity is invalid');
    }
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('entropy generation request operation candidate scope is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (!candidatePaths.has(candidatePath)) throw new Error('entropy generation request operation references an unknown candidate');
      scopedPaths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'entropy generation request operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('entropy generation request operation candidate hash path is inconsistent');
      assertHash(hash.sha256, 'entropy generation request operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('entropy generation request operation candidate hash bytes are invalid');
      const preflight = payload.lastMomentPreflight.candidates.find((item) => item.proposedRepositoryPath === candidatePath);
      if (!preflight || hash.sha256 !== preflight.currentSha256 || hash.bytes !== preflight.currentBytes) {
        throw new Error('entropy generation request operation hash does not match preflight');
      }
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('entropy generation request operation cannot grant execution');
    }
  });
  if (scopedPaths.size !== candidatePaths.size) throw new Error('entropy generation request scope does not cover every candidate');
  if (payload.scope.recomputedScopeHash !== sha256(stableStringify({
    targetIds: payload.scope.targetIds,
    operations: payload.scope.operations,
  }))) throw new Error('entropy generation request recomputed scope hash is invalid');

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('entropy generation request cannot grant, issue or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_human_entropy_generation_decision_no_entropy_output') {
    throw new Error('entropy generation request nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionEntropyGenerationRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionEntropyGenerationRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }
  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid entropy generation request at line ${index + 1}: ${error.message}`); }
    });
  }
  findByGenerationDecisionId(generationDecisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.generationDecision
      && record.payload.generationDecision.id === generationDecisionId) || null;
  }
  appendSigned(payload, signingKey, signingKeyId = 'production-execution-entropy-generation-request-key') {
    assertSigningKey(signingKey);
    assertEntropyGenerationRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('entropy generation request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByGenerationDecisionId(payload.generationDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed entropy generation request already exists for decision: ${payload.generationDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `entropy_generation_request_${crypto.randomUUID()}`,
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
      try { assertEntropyGenerationRequestPayload(record.payload); }
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
  ENTROPY_GENERATION_REQUEST_AUTHORITY,
  ENTROPY_GENERATION_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
  ProductionExecutionEntropyGenerationRequestStore,
  assertEntropyGenerationRequestPayload,
};
