'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const TOKEN_MATERIAL_GENERATION_REQUEST_AUTHORITY =
  'single_use_token_material_generation_request_only_no_secret_or_execution_authority';
const TOKEN_MATERIAL_GENERATION_REQUEST_STATUS =
  'pending_manual_token_material_generation_review';
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 30;
const MIN_REMAINING_SECONDS = 5;

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
  assertObject(safety, 'token material generation request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`token material generation request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`token material generation request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('token material generation request safety requires productionTarget=null');
}

function assertTokenMaterialGenerationRequestPayload(payload) {
  assertObject(payload, 'token material generation request payload');
  if (payload.schemaVersion !== 1) throw new Error('token material generation request schemaVersion must be 1');
  if (payload.requestType !== 'single_use_token_material_generation_request') {
    throw new Error('token material generation request type is invalid');
  }
  if (payload.mode !== 'token_material_generation_request_record_only') {
    throw new Error('token material generation request mode is invalid');
  }
  if (payload.authority !== TOKEN_MATERIAL_GENERATION_REQUEST_AUTHORITY) {
    throw new Error('token material generation request authority is invalid');
  }
  if (payload.status !== TOKEN_MATERIAL_GENERATION_REQUEST_STATUS) {
    throw new Error('token material generation request status is invalid');
  }

  assertObject(payload.issuanceDecision, 'token material generation request issuanceDecision');
  for (const field of [
    'id', 'issuanceRequestId', 'tokenDecisionId', 'tokenRequestId', 'authorisationDecisionId',
    'authorisationRequestId', 'executionPlanDecisionId', 'executionPlanId', 'sourceDecisionId',
    'changeRequestId', 'applicationId',
  ]) {
    if (typeof payload.issuanceDecision[field] !== 'string' || !payload.issuanceDecision[field]) {
      throw new TypeError(`token material generation request issuanceDecision requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'requestScopeHash', 'decisionScopeHash',
    'issuanceScopeHash', 'generationScopeHash', 'requestFinalSnapshotHash',
    'decisionPreflightSnapshotHash', 'issuancePreflightSnapshotHash',
    'issuanceDecisionPreflightSnapshotHash', 'candidateSnapshotHash', 'executionStepsHash',
    'backupManifestHash', 'restoreManifestHash',
  ]) assertHash(payload.issuanceDecision[field], `token material generation request issuanceDecision ${field}`);

  assertObject(payload.requester, 'token material generation request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`token material generation request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('token material generation request requester note is invalid');
  }

  assertObject(payload.validity, 'token material generation request validity');
  for (const field of [
    'requestedAt', 'validFrom', 'expiresAt', 'issuanceRequestExpiresAt',
    'tokenRequestExpiresAt', 'upstreamExpiresAt',
  ]) assertIso(payload.validity[field], `token material generation request validity ${field}`);
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('token material generation request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  const issuanceRequestExpiresAt = Date.parse(payload.validity.issuanceRequestExpiresAt);
  const tokenRequestExpiresAt = Date.parse(payload.validity.tokenRequestExpiresAt);
  const upstreamExpiresAt = Date.parse(payload.validity.upstreamExpiresAt);
  if (requestedAt !== validFrom) throw new Error('token material generation request requestedAt must equal validFrom');
  if (expiresAt - validFrom !== payload.validity.durationSeconds * 1000) {
    throw new Error('token material generation request duration is inconsistent');
  }
  if (expiresAt > issuanceRequestExpiresAt || expiresAt > tokenRequestExpiresAt || expiresAt > upstreamExpiresAt) {
    throw new Error('token material generation request cannot outlive signed authorisation windows');
  }
  if (payload.validity.timeLimited !== true || payload.validity.singleUseGenerationRequested !== true
    || payload.validity.expiredAtCreation !== false) {
    throw new Error('token material generation request validity flags are invalid');
  }

  assertObject(payload.generationState, 'token material generation request generationState');
  if (payload.generationState.generationRequested !== true
    || payload.generationState.entropyGenerated !== false
    || payload.generationState.tokenMaterialGenerated !== false
    || payload.generationState.tokenMaterialIssued !== false
    || payload.generationState.tokenDigest !== null
    || payload.generationState.tokenId !== null
    || payload.generationState.bearerSecretGenerated !== false
    || payload.generationState.bearerSecretIssued !== false
    || payload.generationState.credentialGenerated !== false
    || payload.generationState.credentialIssued !== false
    || payload.generationState.consumed !== false
    || payload.generationState.useCount !== 0
    || payload.generationState.maxUses !== 1) {
    throw new Error('token material generation request cannot generate, issue or consume secret material');
  }

  assertObject(payload.lastMomentPreflight, 'token material generation request lastMomentPreflight');
  assertIso(payload.lastMomentPreflight.verifiedAt, 'token material generation request lastMomentPreflight verifiedAt');
  assertHash(payload.lastMomentPreflight.snapshotHash, 'token material generation request lastMomentPreflight snapshotHash');
  if (Date.parse(payload.lastMomentPreflight.verifiedAt) !== validFrom
    || payload.lastMomentPreflight.allMatchIssuanceDecision !== true
    || !Array.isArray(payload.lastMomentPreflight.candidates)
    || payload.lastMomentPreflight.candidates.length < 1) {
    throw new Error('token material generation request lastMomentPreflight is incomplete');
  }
  const candidatePaths = new Set();
  payload.lastMomentPreflight.candidates.forEach((candidate, index) => {
    assertObject(candidate, `token material generation request preflight candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
      throw new TypeError('token material generation request preflight candidate path is invalid');
    }
    if (candidatePaths.has(candidate.proposedRepositoryPath)) {
      throw new Error('token material generation request has duplicate candidate paths');
    }
    candidatePaths.add(candidate.proposedRepositoryPath);
    for (const field of ['currentSha256', 'issuanceDecisionSha256']) {
      assertHash(candidate[field], `token material generation request preflight candidate ${field}`);
    }
    for (const field of ['currentBytes', 'issuanceDecisionBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) {
        throw new Error(`token material generation request preflight candidate ${field} is invalid`);
      }
    }
    if (candidate.currentSha256 !== candidate.issuanceDecisionSha256
      || candidate.currentBytes !== candidate.issuanceDecisionBytes
      || candidate.matchIssuanceDecision !== true || candidate.writeAllowed !== false) {
      throw new Error('token material generation request candidate does not match the signed issuance decision');
    }
  });
  if (payload.lastMomentPreflight.snapshotHash !== sha256(stableStringify(payload.lastMomentPreflight.candidates))) {
    throw new Error('token material generation request preflight snapshotHash is invalid');
  }

  assertObject(payload.scope, 'token material generation request scope');
  if (payload.scope.scopeType !== 'issuance_decision_bound_candidate_paths_and_operations_only'
    || payload.scope.exactScopeMatch !== true) {
    throw new Error('token material generation request scope boundary is invalid');
  }
  for (const field of [
    'tokenRequestScopeHash', 'tokenDecisionScopeHash', 'issuanceRequestScopeHash',
    'issuanceDecisionScopeHash', 'recomputedScopeHash',
  ]) assertHash(payload.scope[field], `token material generation request scope ${field}`);
  if (payload.scope.tokenRequestScopeHash !== payload.scope.tokenDecisionScopeHash
    || payload.scope.tokenRequestScopeHash !== payload.scope.issuanceRequestScopeHash
    || payload.scope.tokenRequestScopeHash !== payload.scope.issuanceDecisionScopeHash
    || payload.scope.tokenRequestScopeHash !== payload.scope.recomputedScopeHash) {
    throw new Error('token material generation request scope hashes do not match');
  }
  if (!Array.isArray(payload.scope.targetIds) || payload.scope.targetIds.length < 1
    || new Set(payload.scope.targetIds).size !== payload.scope.targetIds.length
    || !Number.isInteger(payload.scope.operationCount) || payload.scope.operationCount < 1
    || !Number.isInteger(payload.scope.candidateCount) || payload.scope.candidateCount !== candidatePaths.size
    || !Array.isArray(payload.scope.operations) || payload.scope.operations.length !== payload.scope.operationCount) {
    throw new Error('token material generation request scope counts are invalid');
  }
  const scopedPaths = new Set();
  payload.scope.operations.forEach((operation, index) => {
    assertObject(operation, `token material generation request operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence') {
      throw new Error('token material generation request operation identity is invalid');
    }
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('token material generation request operation candidate scope is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (!candidatePaths.has(candidatePath)) {
        throw new Error('token material generation request operation references an unknown candidate');
      }
      scopedPaths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'token material generation request operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) {
        throw new Error('token material generation request operation candidate hash path is inconsistent');
      }
      assertHash(hash.sha256, 'token material generation request operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) {
        throw new Error('token material generation request operation candidate hash bytes are invalid');
      }
      const preflight = payload.lastMomentPreflight.candidates.find((item) => item.proposedRepositoryPath === candidatePath);
      if (!preflight || hash.sha256 !== preflight.currentSha256 || hash.bytes !== preflight.currentBytes) {
        throw new Error('token material generation request operation hash does not match preflight');
      }
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('token material generation request operation cannot grant execution');
    }
  });
  if (scopedPaths.size !== candidatePaths.size) {
    throw new Error('token material generation request scope does not cover every candidate');
  }
  const recomputedScopeHash = sha256(stableStringify({
    targetIds: payload.scope.targetIds,
    operations: payload.scope.operations,
  }));
  if (payload.scope.recomputedScopeHash !== recomputedScopeHash) {
    throw new Error('token material generation request recomputed scope hash is invalid');
  }

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('token material generation request cannot grant, issue or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_human_token_material_generation_decision_no_secret') {
    throw new Error('token material generation request nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionTokenMaterialGenerationRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionTokenMaterialGenerationRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid token material generation request at line ${index + 1}: ${error.message}`); }
    });
  }

  findByIssuanceDecisionId(issuanceDecisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.issuanceDecision
      && record.payload.issuanceDecision.id === issuanceDecisionId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-token-material-generation-request-key') {
    assertSigningKey(signingKey);
    assertTokenMaterialGenerationRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('token material generation request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByIssuanceDecisionId(payload.issuanceDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed token material generation request already exists for decision: ${payload.issuanceDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `token_material_generation_request_${crypto.randomUUID()}`,
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
      try { assertTokenMaterialGenerationRequestPayload(record.payload); }
      catch (error) { return { valid: false, index, reason: 'payload_contract_invalid', error: error.message }; }
      if (record.payloadHash !== sha256(stableStringify(record.payload))) {
        return { valid: false, index, reason: 'payload_hash_mismatch' };
      }
      const { recordHash, signature, ...unsigned } = record;
      const expectedRecordHash = sha256(stableStringify(unsigned));
      if (recordHash !== expectedRecordHash) return { valid: false, index, reason: 'record_hash_mismatch' };
      if (!safeEqualHex(signature, hmac(signingKey, recordHash))) {
        return { valid: false, index, reason: 'signature_mismatch' };
      }
      previousRecordHash = recordHash;
    }
    return { valid: true, records: records.length, finalHash: previousRecordHash };
  }
}

module.exports = {
  TOKEN_MATERIAL_GENERATION_REQUEST_AUTHORITY,
  TOKEN_MATERIAL_GENERATION_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
  ProductionExecutionTokenMaterialGenerationRequestStore,
  assertTokenMaterialGenerationRequestPayload,
};
