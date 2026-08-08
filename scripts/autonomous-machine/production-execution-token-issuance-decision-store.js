'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const EXECUTION_TOKEN_ISSUANCE_DECISION_AUTHORITY =
  'signed_human_token_issuance_decision_only_no_token_or_execution_authority';
const EXECUTION_TOKEN_ISSUANCE_DECISION_STATUSES = Object.freeze({
  APPROVED: 'approved_execution_token_issuance_request_record_only',
  REJECTED: 'rejected_execution_token_issuance_request_no_token_or_authority',
});
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
  assertObject(safety, 'execution token issuance decision safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution token issuance decision safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution token issuance decision safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution token issuance decision safety requires productionTarget=null');
}

function assertOptionalPreflight(preflight, required) {
  assertObject(preflight, 'execution token issuance decision finalPreflight');
  if (preflight.required !== required || typeof preflight.allMatchIssuanceRequest !== 'boolean') {
    throw new Error('execution token issuance decision finalPreflight flags are invalid');
  }
  if (!required) {
    if (preflight.verifiedAt !== null || preflight.snapshotHash !== null
      || preflight.allMatchIssuanceRequest !== false || !Array.isArray(preflight.candidates)
      || preflight.candidates.length !== 0) {
      throw new Error('execution token issuance decision optional finalPreflight state is invalid');
    }
    return;
  }
  assertIso(preflight.verifiedAt, 'execution token issuance decision finalPreflight verifiedAt');
  assertHash(preflight.snapshotHash, 'execution token issuance decision finalPreflight snapshotHash');
  if (!preflight.allMatchIssuanceRequest || !Array.isArray(preflight.candidates) || preflight.candidates.length < 1) {
    throw new Error('execution token issuance decision finalPreflight is incomplete');
  }
  const paths = new Set();
  preflight.candidates.forEach((candidate, index) => {
    assertObject(candidate, `execution token issuance decision preflight candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
      throw new TypeError('execution token issuance decision preflight candidate path is invalid');
    }
    if (paths.has(candidate.proposedRepositoryPath)) throw new Error('execution token issuance decision has duplicate preflight candidate paths');
    paths.add(candidate.proposedRepositoryPath);
    for (const field of ['currentSha256', 'issuanceRequestSha256']) {
      assertHash(candidate[field], `execution token issuance decision preflight candidate ${field}`);
    }
    for (const field of ['currentBytes', 'issuanceRequestBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) {
        throw new Error(`execution token issuance decision preflight candidate ${field} is invalid`);
      }
    }
    if (candidate.currentSha256 !== candidate.issuanceRequestSha256
      || candidate.currentBytes !== candidate.issuanceRequestBytes
      || candidate.matchIssuanceRequest !== true || candidate.writeAllowed !== false) {
      throw new Error('execution token issuance decision preflight candidate does not match the request');
    }
  });
  if (preflight.snapshotHash !== sha256(stableStringify(preflight.candidates))) {
    throw new Error('execution token issuance decision finalPreflight snapshotHash is invalid');
  }
}

function assertOptionalScopeReview(scopeReview, required) {
  assertObject(scopeReview, 'execution token issuance decision scopeReview');
  if (scopeReview.required !== required || typeof scopeReview.exactScopeMatch !== 'boolean') {
    throw new Error('execution token issuance decision scopeReview flags are invalid');
  }
  if (!required) {
    if (scopeReview.issuanceRequestScopeHash !== null || scopeReview.recomputedScopeHash !== null
      || scopeReview.exactScopeMatch !== false || scopeReview.operationCount !== 0
      || scopeReview.candidateCount !== 0 || !Array.isArray(scopeReview.operations)
      || scopeReview.operations.length !== 0) {
      throw new Error('execution token issuance decision optional scopeReview state is invalid');
    }
    return;
  }
  assertHash(scopeReview.issuanceRequestScopeHash, 'execution token issuance decision scopeReview issuanceRequestScopeHash');
  assertHash(scopeReview.recomputedScopeHash, 'execution token issuance decision scopeReview recomputedScopeHash');
  if (scopeReview.issuanceRequestScopeHash !== scopeReview.recomputedScopeHash || scopeReview.exactScopeMatch !== true) {
    throw new Error('execution token issuance decision scope review does not exactly match the signed request');
  }
  if (!Number.isInteger(scopeReview.operationCount) || scopeReview.operationCount < 1
    || !Number.isInteger(scopeReview.candidateCount) || scopeReview.candidateCount < 1
    || !Array.isArray(scopeReview.operations) || scopeReview.operations.length !== scopeReview.operationCount) {
    throw new Error('execution token issuance decision scopeReview counts are invalid');
  }
  const paths = new Set();
  scopeReview.operations.forEach((operation, index) => {
    assertObject(operation, `execution token issuance decision scope operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence') {
      throw new Error('execution token issuance decision scope operation identity is invalid');
    }
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('execution token issuance decision scope operation candidate data is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (typeof candidatePath !== 'string' || !candidatePath) throw new TypeError('execution token issuance decision scope candidate path is invalid');
      paths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'execution token issuance decision scope candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('execution token issuance decision scope candidate hash path is inconsistent');
      assertHash(hash.sha256, 'execution token issuance decision scope candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('execution token issuance decision scope candidate hash bytes are invalid');
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('execution token issuance decision scope operation cannot grant execution');
    }
  });
  if (paths.size !== scopeReview.candidateCount) throw new Error('execution token issuance decision scopeReview candidateCount is inconsistent');
}

function assertExecutionTokenIssuanceDecisionPayload(payload) {
  assertObject(payload, 'execution token issuance decision payload');
  if (payload.schemaVersion !== 1) throw new Error('execution token issuance decision schemaVersion must be 1');
  if (payload.decisionType !== 'human_single_use_execution_token_issuance_request_decision') {
    throw new Error('execution token issuance decision type is invalid');
  }
  if (payload.mode !== 'token_issuance_decision_record_only') throw new Error('execution token issuance decision mode is invalid');
  if (payload.authority !== EXECUTION_TOKEN_ISSUANCE_DECISION_AUTHORITY) throw new Error('execution token issuance decision authority is invalid');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('execution token issuance decision value is invalid');
  const expectedStatus = payload.decision === 'approve'
    ? EXECUTION_TOKEN_ISSUANCE_DECISION_STATUSES.APPROVED
    : EXECUTION_TOKEN_ISSUANCE_DECISION_STATUSES.REJECTED;
  if (payload.status !== expectedStatus) throw new Error('execution token issuance decision status does not match decision');

  assertObject(payload.issuanceRequest, 'execution token issuance decision issuanceRequest');
  for (const field of [
    'id', 'tokenDecisionId', 'tokenRequestId', 'authorisationDecisionId', 'authorisationRequestId',
    'executionPlanDecisionId', 'executionPlanId', 'sourceDecisionId', 'changeRequestId', 'applicationId',
  ]) {
    if (typeof payload.issuanceRequest[field] !== 'string' || !payload.issuanceRequest[field]) {
      throw new TypeError(`execution token issuance decision issuanceRequest requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'requestScopeHash', 'decisionScopeHash',
    'issuanceScopeHash', 'requestFinalSnapshotHash', 'decisionPreflightSnapshotHash',
    'issuancePreflightSnapshotHash', 'candidateSnapshotHash', 'executionStepsHash',
    'backupManifestHash', 'restoreManifestHash',
  ]) assertHash(payload.issuanceRequest[field], `execution token issuance decision issuanceRequest ${field}`);

  assertObject(payload.reviewer, 'execution token issuance decision reviewer');
  for (const field of ['name', 'role']) {
    if (typeof payload.reviewer[field] !== 'string' || payload.reviewer[field].trim().length < 3) {
      throw new TypeError(`execution token issuance decision reviewer ${field} is invalid`);
    }
  }
  if (typeof payload.reviewer.note !== 'string' || payload.reviewer.note.trim().length < 10) {
    throw new TypeError('execution token issuance decision reviewer note is invalid');
  }

  assertObject(payload.completedReviews, 'execution token issuance decision completedReviews');
  for (const field of [
    'issuanceRequestWindowReview', 'finalPreflightReview', 'exactScopeReview',
    'backupEvidenceReview', 'restoreEvidenceReview', 'productionOwnerReview',
  ]) {
    if (typeof payload.completedReviews[field] !== 'boolean') {
      throw new TypeError(`execution token issuance decision completedReviews ${field} must be boolean`);
    }
  }

  assertObject(payload.validityReview, 'execution token issuance decision validityReview');
  for (const field of [
    'decisionAt', 'requestValidFrom', 'requestExpiresAt', 'tokenRequestExpiresAt', 'upstreamExpiresAt',
  ]) assertIso(payload.validityReview[field], `execution token issuance decision validityReview ${field}`);
  if (!Number.isInteger(payload.validityReview.remainingSeconds) || payload.validityReview.remainingSeconds < 0
    || typeof payload.validityReview.activeAtDecision !== 'boolean'
    || typeof payload.validityReview.withinTokenRequestWindow !== 'boolean'
    || typeof payload.validityReview.withinUpstreamWindow !== 'boolean') {
    throw new Error('execution token issuance decision validityReview is invalid');
  }

  const approval = payload.decision === 'approve';
  assertOptionalPreflight(payload.finalPreflight, approval);
  assertOptionalScopeReview(payload.scopeReview, approval);

  assertObject(payload.issuanceState, 'execution token issuance decision issuanceState');
  if (payload.issuanceState.issuanceRequested !== true
    || payload.issuanceState.tokenMaterialIssued !== false
    || payload.issuanceState.tokenDigest !== null
    || payload.issuanceState.tokenId !== null
    || payload.issuanceState.bearerSecretIssued !== false
    || payload.issuanceState.credentialIssued !== false
    || payload.issuanceState.consumed !== false
    || payload.issuanceState.useCount !== 0
    || payload.issuanceState.maxUses !== 1
    || payload.issuanceState.tokenIssued !== false
    || payload.issuanceState.executionTokenAvailable !== false) {
    throw new Error('execution token issuance decision cannot issue, expose or consume token material');
  }

  if (!Array.isArray(payload.targetIds) || payload.targetIds.length < 1
    || new Set(payload.targetIds).size !== payload.targetIds.length) {
    throw new Error('execution token issuance decision targetIds are invalid');
  }

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('execution token issuance decision cannot grant, issue or confirm execution authority');
  }
  const expectedNextAction = approval
    ? 'separate_token_material_generation_request_and_execution_firebreak'
    : 'none';
  if (payload.nextAction !== expectedNextAction) throw new Error('execution token issuance decision nextAction is invalid');

  if (approval) {
    if (!payload.validityReview.activeAtDecision || !payload.validityReview.withinTokenRequestWindow
      || !payload.validityReview.withinUpstreamWindow
      || payload.validityReview.remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`approved execution token issuance decision requires at least ${MIN_REMAINING_SECONDS} seconds in active signed windows`);
    }
    for (const [field, complete] of Object.entries(payload.completedReviews)) {
      if (complete !== true) throw new Error(`approved execution token issuance decision requires completed ${field}`);
    }
    if (!payload.finalPreflight.allMatchIssuanceRequest || !payload.scopeReview.exactScopeMatch) {
      throw new Error('approved execution token issuance decision requires exact preflight and scope matches');
    }
  }

  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionTokenIssuanceDecisionStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionTokenIssuanceDecisionStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid execution token issuance decision at line ${index + 1}: ${error.message}`); }
    });
  }

  findByIssuanceRequestId(issuanceRequestId) {
    return this.readRecords().find((record) => record.payload && record.payload.issuanceRequest
      && record.payload.issuanceRequest.id === issuanceRequestId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-token-issuance-decision-key') {
    assertSigningKey(signingKey);
    assertExecutionTokenIssuanceDecisionPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('execution token issuance decision signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByIssuanceRequestId(payload.issuanceRequest.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed execution token issuance decision already exists for request: ${payload.issuanceRequest.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_token_issuance_decision_${crypto.randomUUID()}`,
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
      try { assertExecutionTokenIssuanceDecisionPayload(record.payload); }
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
  EXECUTION_TOKEN_ISSUANCE_DECISION_AUTHORITY,
  EXECUTION_TOKEN_ISSUANCE_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
  ProductionExecutionTokenIssuanceDecisionStore,
  assertExecutionTokenIssuanceDecisionPayload,
};
