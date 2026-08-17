'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const TOKEN_MATERIAL_GENERATION_DECISION_AUTHORITY =
  'signed_human_token_material_generation_decision_only_no_secret_or_execution_authority';
const TOKEN_MATERIAL_GENERATION_DECISION_STATUSES = Object.freeze({
  APPROVED: 'approved_token_material_generation_request_record_only',
  REJECTED: 'rejected_token_material_generation_request_no_secret_or_authority',
});
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
  assertObject(safety, 'token material generation decision safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`token material generation decision safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`token material generation decision safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) {
    throw new Error('token material generation decision safety requires productionTarget=null');
  }
}

function assertOptionalPreflight(preflight, required) {
  assertObject(preflight, 'token material generation decision finalPreflight');
  if (preflight.required !== required || typeof preflight.allMatchGenerationRequest !== 'boolean') {
    throw new Error('token material generation decision finalPreflight flags are invalid');
  }
  if (!required) {
    if (preflight.verifiedAt !== null || preflight.snapshotHash !== null
      || preflight.allMatchGenerationRequest !== false || !Array.isArray(preflight.candidates)
      || preflight.candidates.length !== 0) {
      throw new Error('token material generation decision optional finalPreflight state is invalid');
    }
    return;
  }
  assertIso(preflight.verifiedAt, 'token material generation decision finalPreflight verifiedAt');
  assertHash(preflight.snapshotHash, 'token material generation decision finalPreflight snapshotHash');
  if (!preflight.allMatchGenerationRequest || !Array.isArray(preflight.candidates)
    || preflight.candidates.length < 1) {
    throw new Error('token material generation decision finalPreflight is incomplete');
  }
  const paths = new Set();
  preflight.candidates.forEach((candidate, index) => {
    assertObject(candidate, `token material generation decision preflight candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
      throw new TypeError('token material generation decision preflight candidate path is invalid');
    }
    if (paths.has(candidate.proposedRepositoryPath)) {
      throw new Error('token material generation decision has duplicate preflight candidate paths');
    }
    paths.add(candidate.proposedRepositoryPath);
    for (const field of ['currentSha256', 'generationRequestSha256']) {
      assertHash(candidate[field], `token material generation decision preflight candidate ${field}`);
    }
    for (const field of ['currentBytes', 'generationRequestBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) {
        throw new Error(`token material generation decision preflight candidate ${field} is invalid`);
      }
    }
    if (candidate.currentSha256 !== candidate.generationRequestSha256
      || candidate.currentBytes !== candidate.generationRequestBytes
      || candidate.matchGenerationRequest !== true || candidate.writeAllowed !== false) {
      throw new Error('token material generation decision preflight candidate does not match the request');
    }
  });
  if (preflight.snapshotHash !== sha256(stableStringify(preflight.candidates))) {
    throw new Error('token material generation decision finalPreflight snapshotHash is invalid');
  }
}

function assertOptionalScopeReview(scopeReview, required) {
  assertObject(scopeReview, 'token material generation decision scopeReview');
  if (scopeReview.required !== required || typeof scopeReview.exactScopeMatch !== 'boolean') {
    throw new Error('token material generation decision scopeReview flags are invalid');
  }
  if (!required) {
    if (scopeReview.generationRequestScopeHash !== null || scopeReview.recomputedScopeHash !== null
      || scopeReview.exactScopeMatch !== false || scopeReview.operationCount !== 0
      || scopeReview.candidateCount !== 0 || !Array.isArray(scopeReview.operations)
      || scopeReview.operations.length !== 0) {
      throw new Error('token material generation decision optional scopeReview state is invalid');
    }
    return;
  }
  assertHash(scopeReview.generationRequestScopeHash,
    'token material generation decision scopeReview generationRequestScopeHash');
  assertHash(scopeReview.recomputedScopeHash,
    'token material generation decision scopeReview recomputedScopeHash');
  if (scopeReview.generationRequestScopeHash !== scopeReview.recomputedScopeHash
    || scopeReview.exactScopeMatch !== true) {
    throw new Error('token material generation decision scope does not exactly match the signed request');
  }
  if (!Number.isInteger(scopeReview.operationCount) || scopeReview.operationCount < 1
    || !Number.isInteger(scopeReview.candidateCount) || scopeReview.candidateCount < 1
    || !Array.isArray(scopeReview.operations)
    || scopeReview.operations.length !== scopeReview.operationCount) {
    throw new Error('token material generation decision scopeReview counts are invalid');
  }
  const paths = new Set();
  scopeReview.operations.forEach((operation, index) => {
    assertObject(operation, `token material generation decision operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence') {
      throw new Error('token material generation decision operation identity is invalid');
    }
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('token material generation decision operation candidate scope is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (typeof candidatePath !== 'string' || !candidatePath) {
        throw new TypeError('token material generation decision operation candidate path is invalid');
      }
      paths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'token material generation decision operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) {
        throw new Error('token material generation decision operation candidate hash path is inconsistent');
      }
      assertHash(hash.sha256, 'token material generation decision operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) {
        throw new Error('token material generation decision operation candidate hash bytes are invalid');
      }
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('token material generation decision operation cannot grant execution');
    }
  });
  if (paths.size !== scopeReview.candidateCount) {
    throw new Error('token material generation decision scopeReview candidateCount is inconsistent');
  }
}

function assertTokenMaterialGenerationDecisionPayload(payload) {
  assertObject(payload, 'token material generation decision payload');
  if (payload.schemaVersion !== 1) throw new Error('token material generation decision schemaVersion must be 1');
  if (payload.decisionType !== 'human_single_use_token_material_generation_request_decision') {
    throw new Error('token material generation decision type is invalid');
  }
  if (payload.mode !== 'token_material_generation_decision_record_only') {
    throw new Error('token material generation decision mode is invalid');
  }
  if (payload.authority !== TOKEN_MATERIAL_GENERATION_DECISION_AUTHORITY) {
    throw new Error('token material generation decision authority is invalid');
  }
  if (!['approve', 'reject'].includes(payload.decision)) {
    throw new Error('token material generation decision value is invalid');
  }
  const expectedStatus = payload.decision === 'approve'
    ? TOKEN_MATERIAL_GENERATION_DECISION_STATUSES.APPROVED
    : TOKEN_MATERIAL_GENERATION_DECISION_STATUSES.REJECTED;
  if (payload.status !== expectedStatus) {
    throw new Error('token material generation decision status does not match decision');
  }

  assertObject(payload.generationRequest, 'token material generation decision generationRequest');
  for (const field of [
    'id', 'issuanceDecisionId', 'issuanceRequestId', 'tokenDecisionId', 'tokenRequestId',
    'authorisationDecisionId', 'authorisationRequestId', 'executionPlanDecisionId',
    'executionPlanId', 'sourceDecisionId', 'changeRequestId', 'applicationId',
  ]) {
    if (typeof payload.generationRequest[field] !== 'string' || !payload.generationRequest[field]) {
      throw new TypeError(`token material generation decision generationRequest requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'requestScopeHash', 'decisionScopeHash',
    'issuanceScopeHash', 'generationScopeHash', 'generationRequestScopeHash',
    'requestFinalSnapshotHash', 'decisionPreflightSnapshotHash', 'issuancePreflightSnapshotHash',
    'issuanceDecisionPreflightSnapshotHash', 'generationRequestPreflightSnapshotHash',
    'candidateSnapshotHash', 'executionStepsHash', 'backupManifestHash', 'restoreManifestHash',
  ]) {
    assertHash(payload.generationRequest[field],
      `token material generation decision generationRequest ${field}`);
  }

  assertObject(payload.reviewer, 'token material generation decision reviewer');
  for (const field of ['name', 'role']) {
    if (typeof payload.reviewer[field] !== 'string' || payload.reviewer[field].trim().length < 3) {
      throw new TypeError(`token material generation decision reviewer ${field} is invalid`);
    }
  }
  if (typeof payload.reviewer.note !== 'string' || payload.reviewer.note.trim().length < 10) {
    throw new TypeError('token material generation decision reviewer note is invalid');
  }

  assertObject(payload.completedReviews, 'token material generation decision completedReviews');
  for (const field of [
    'generationRequestWindowReview', 'finalPreflightReview', 'exactScopeReview',
    'entropyBoundaryReview', 'backupEvidenceReview', 'restoreEvidenceReview',
    'productionOwnerReview',
  ]) {
    if (typeof payload.completedReviews[field] !== 'boolean') {
      throw new TypeError(`token material generation decision completedReviews ${field} must be boolean`);
    }
  }

  assertObject(payload.validityReview, 'token material generation decision validityReview');
  for (const field of [
    'decisionAt', 'requestValidFrom', 'requestExpiresAt', 'issuanceRequestExpiresAt',
    'tokenRequestExpiresAt', 'upstreamExpiresAt',
  ]) {
    assertIso(payload.validityReview[field], `token material generation decision validityReview ${field}`);
  }
  if (!Number.isInteger(payload.validityReview.remainingSeconds)
    || payload.validityReview.remainingSeconds < 0
    || typeof payload.validityReview.activeAtDecision !== 'boolean'
    || typeof payload.validityReview.withinIssuanceRequestWindow !== 'boolean'
    || typeof payload.validityReview.withinTokenRequestWindow !== 'boolean'
    || typeof payload.validityReview.withinUpstreamWindow !== 'boolean') {
    throw new Error('token material generation decision validityReview is invalid');
  }

  const approval = payload.decision === 'approve';
  assertOptionalPreflight(payload.finalPreflight, approval);
  assertOptionalScopeReview(payload.scopeReview, approval);

  assertObject(payload.generationState, 'token material generation decision generationState');
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
    throw new Error('token material generation decision cannot generate, issue or consume secret material');
  }

  if (!Array.isArray(payload.targetIds) || payload.targetIds.length < 1
    || new Set(payload.targetIds).size !== payload.targetIds.length) {
    throw new Error('token material generation decision targetIds are invalid');
  }

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('token material generation decision cannot grant, issue or confirm execution authority');
  }
  const expectedNextAction = approval
    ? 'separate_entropy_generation_request_no_secret_output_or_execution'
    : 'none';
  if (payload.nextAction !== expectedNextAction) {
    throw new Error('token material generation decision nextAction is invalid');
  }

  if (approval) {
    if (!payload.validityReview.activeAtDecision
      || !payload.validityReview.withinIssuanceRequestWindow
      || !payload.validityReview.withinTokenRequestWindow
      || !payload.validityReview.withinUpstreamWindow
      || payload.validityReview.remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`approved token material generation decision requires at least ${MIN_REMAINING_SECONDS} seconds in active signed windows`);
    }
    for (const [field, complete] of Object.entries(payload.completedReviews)) {
      if (complete !== true) {
        throw new Error(`approved token material generation decision requires completed ${field}`);
      }
    }
    if (!payload.finalPreflight.allMatchGenerationRequest || !payload.scopeReview.exactScopeMatch) {
      throw new Error('approved token material generation decision requires exact preflight and scope matches');
    }
  }

  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionTokenMaterialGenerationDecisionStore {
  constructor(filePath) {
    if (!filePath) {
      throw new TypeError('ProductionExecutionTokenMaterialGenerationDecisionStore requires a file path');
    }
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) {
        throw new Error(`Invalid token material generation decision at line ${index + 1}: ${error.message}`);
      }
    });
  }

  findByGenerationRequestId(generationRequestId) {
    return this.readRecords().find((record) => record.payload && record.payload.generationRequest
      && record.payload.generationRequest.id === generationRequestId) || null;
  }

  appendSigned(payload, signingKey,
    signingKeyId = 'production-execution-token-material-generation-decision-key') {
    assertSigningKey(signingKey);
    assertTokenMaterialGenerationDecisionPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('token material generation decision signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByGenerationRequestId(payload.generationRequest.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed token material generation decision already exists for request: ${payload.generationRequest.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `token_material_generation_decision_${crypto.randomUUID()}`,
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
      if (record.previousRecordHash !== previousRecordHash) {
        return { valid: false, index, reason: 'previous_hash_mismatch' };
      }
      if (record.signatureAlgorithm !== 'hmac-sha256') {
        return { valid: false, index, reason: 'signature_algorithm_mismatch' };
      }
      try { assertTokenMaterialGenerationDecisionPayload(record.payload); }
      catch (error) {
        return { valid: false, index, reason: 'payload_contract_invalid', error: error.message };
      }
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
  TOKEN_MATERIAL_GENERATION_DECISION_AUTHORITY,
  TOKEN_MATERIAL_GENERATION_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
  ProductionExecutionTokenMaterialGenerationDecisionStore,
  assertTokenMaterialGenerationDecisionPayload,
};
