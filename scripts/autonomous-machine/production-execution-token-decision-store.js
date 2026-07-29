'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const EXECUTION_TOKEN_DECISION_AUTHORITY = 'signed_human_execution_token_decision_only_no_token_or_execution_authority';
const EXECUTION_TOKEN_DECISION_STATUSES = Object.freeze({
  APPROVED: 'approved_execution_token_request_record_only',
  REJECTED: 'rejected_execution_token_request_no_token_or_authority',
});
const MIN_REMAINING_SECONDS = 15;

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
  assertObject(safety, 'execution token decision safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution token decision safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution token decision safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution token decision safety requires productionTarget=null');
}

function assertOptionalPreflight(preflight, required) {
  assertObject(preflight, 'execution token decision finalPreflight');
  if (preflight.required !== required || typeof preflight.allMatchRequest !== 'boolean') {
    throw new Error('execution token decision finalPreflight flags are invalid');
  }
  if (!required) {
    if (preflight.verifiedAt !== null || preflight.snapshotHash !== null || preflight.allMatchRequest !== false
      || !Array.isArray(preflight.candidates) || preflight.candidates.length !== 0) {
      throw new Error('execution token decision optional finalPreflight state is invalid');
    }
    return;
  }
  assertIso(preflight.verifiedAt, 'execution token decision finalPreflight verifiedAt');
  assertHash(preflight.snapshotHash, 'execution token decision finalPreflight snapshotHash');
  if (!preflight.allMatchRequest || !Array.isArray(preflight.candidates) || preflight.candidates.length < 1) {
    throw new Error('execution token decision finalPreflight is incomplete');
  }
  const paths = new Set();
  preflight.candidates.forEach((candidate, index) => {
    assertObject(candidate, `execution token decision preflight candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
      throw new TypeError('execution token decision preflight candidate path is invalid');
    }
    if (paths.has(candidate.proposedRepositoryPath)) throw new Error('execution token decision has duplicate preflight candidate paths');
    paths.add(candidate.proposedRepositoryPath);
    for (const field of ['currentSha256', 'requestSha256']) assertHash(candidate[field], `execution token decision preflight candidate ${field}`);
    for (const field of ['currentBytes', 'requestBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) throw new Error(`execution token decision preflight candidate ${field} is invalid`);
    }
    if (candidate.currentSha256 !== candidate.requestSha256 || candidate.currentBytes !== candidate.requestBytes
      || candidate.matchRequest !== true || candidate.writeAllowed !== false) {
      throw new Error('execution token decision preflight candidate does not match the request');
    }
  });
  if (preflight.snapshotHash !== sha256(stableStringify(preflight.candidates))) {
    throw new Error('execution token decision finalPreflight snapshotHash is invalid');
  }
}

function assertOptionalScopeReview(scopeReview, required) {
  assertObject(scopeReview, 'execution token decision scopeReview');
  if (scopeReview.required !== required || typeof scopeReview.exactScopeMatch !== 'boolean') {
    throw new Error('execution token decision scopeReview flags are invalid');
  }
  if (!required) {
    if (scopeReview.requestScopeHash !== null || scopeReview.recomputedScopeHash !== null
      || scopeReview.exactScopeMatch !== false || scopeReview.operationCount !== 0
      || scopeReview.candidateCount !== 0 || !Array.isArray(scopeReview.operations)
      || scopeReview.operations.length !== 0) {
      throw new Error('execution token decision optional scopeReview state is invalid');
    }
    return;
  }
  assertHash(scopeReview.requestScopeHash, 'execution token decision scopeReview requestScopeHash');
  assertHash(scopeReview.recomputedScopeHash, 'execution token decision scopeReview recomputedScopeHash');
  if (scopeReview.requestScopeHash !== scopeReview.recomputedScopeHash || scopeReview.exactScopeMatch !== true) {
    throw new Error('execution token decision scope review does not exactly match the signed request');
  }
  if (!Number.isInteger(scopeReview.operationCount) || scopeReview.operationCount < 1
    || !Number.isInteger(scopeReview.candidateCount) || scopeReview.candidateCount < 1
    || !Array.isArray(scopeReview.operations) || scopeReview.operations.length !== scopeReview.operationCount) {
    throw new Error('execution token decision scopeReview counts are invalid');
  }
  const paths = new Set();
  scopeReview.operations.forEach((operation, index) => {
    assertObject(operation, `execution token decision scope operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId) {
      throw new Error('execution token decision scope operation identity is invalid');
    }
    if (operation.operation !== 'manual_review_and_integrate_evidence') throw new Error('execution token decision scope operation is invalid');
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes) || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('execution token decision scope operation candidate data is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (typeof candidatePath !== 'string' || !candidatePath) throw new TypeError('execution token decision scope candidate path is invalid');
      paths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'execution token decision scope candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('execution token decision scope candidate hash path is inconsistent');
      assertHash(hash.sha256, 'execution token decision scope candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('execution token decision scope candidate hash bytes are invalid');
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('execution token decision scope operation cannot grant execution');
    }
  });
  if (paths.size !== scopeReview.candidateCount) throw new Error('execution token decision scopeReview candidateCount is inconsistent');
}

function assertExecutionTokenDecisionPayload(payload) {
  assertObject(payload, 'execution token decision payload');
  if (payload.schemaVersion !== 1) throw new Error('execution token decision schemaVersion must be 1');
  if (payload.decisionType !== 'human_single_use_execution_token_request_decision') throw new Error('execution token decision type is invalid');
  if (payload.mode !== 'token_decision_record_only') throw new Error('execution token decision mode is invalid');
  if (payload.authority !== EXECUTION_TOKEN_DECISION_AUTHORITY) throw new Error('execution token decision authority is invalid');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('execution token decision value is invalid');
  const expectedStatus = payload.decision === 'approve'
    ? EXECUTION_TOKEN_DECISION_STATUSES.APPROVED
    : EXECUTION_TOKEN_DECISION_STATUSES.REJECTED;
  if (payload.status !== expectedStatus) throw new Error('execution token decision status does not match decision');

  assertObject(payload.tokenRequest, 'execution token decision tokenRequest');
  for (const field of [
    'id', 'authorisationDecisionId', 'authorisationRequestId', 'executionPlanDecisionId',
    'executionPlanId', 'sourceDecisionId', 'changeRequestId', 'applicationId',
  ]) {
    if (typeof payload.tokenRequest[field] !== 'string' || !payload.tokenRequest[field]) {
      throw new TypeError(`execution token decision tokenRequest requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'scopeHash', 'finalSnapshotHash',
    'candidateSnapshotHash', 'executionStepsHash', 'backupManifestHash', 'restoreManifestHash',
  ]) assertHash(payload.tokenRequest[field], `execution token decision tokenRequest ${field}`);

  assertObject(payload.reviewer, 'execution token decision reviewer');
  for (const field of ['name', 'role']) {
    if (typeof payload.reviewer[field] !== 'string' || payload.reviewer[field].trim().length < 3) {
      throw new TypeError(`execution token decision reviewer ${field} is invalid`);
    }
  }
  if (typeof payload.reviewer.note !== 'string' || payload.reviewer.note.trim().length < 10) {
    throw new TypeError('execution token decision reviewer note is invalid');
  }

  assertObject(payload.completedReviews, 'execution token decision completedReviews');
  for (const field of [
    'tokenRequestWindowReview', 'finalPreflightReview', 'scopeReview',
    'backupEvidenceReview', 'restoreEvidenceReview', 'productionOwnerReview',
  ]) {
    if (typeof payload.completedReviews[field] !== 'boolean') {
      throw new TypeError(`execution token decision completedReviews ${field} must be boolean`);
    }
  }

  assertObject(payload.validityReview, 'execution token decision validityReview');
  for (const field of ['decisionAt', 'requestValidFrom', 'requestExpiresAt', 'upstreamExpiresAt']) {
    assertIso(payload.validityReview[field], `execution token decision validityReview ${field}`);
  }
  if (!Number.isInteger(payload.validityReview.remainingSeconds) || payload.validityReview.remainingSeconds < 0
    || typeof payload.validityReview.activeAtDecision !== 'boolean'
    || typeof payload.validityReview.withinUpstreamWindow !== 'boolean') {
    throw new Error('execution token decision validityReview is invalid');
  }

  const approval = payload.decision === 'approve';
  assertOptionalPreflight(payload.finalPreflight, approval);
  assertOptionalScopeReview(payload.scopeReview, approval);

  assertObject(payload.tokenState, 'execution token decision tokenState');
  if (payload.tokenState.tokenMaterialIssued !== false || payload.tokenState.tokenDigest !== null
    || payload.tokenState.tokenId !== null || payload.tokenState.consumed !== false
    || payload.tokenState.useCount !== 0 || payload.tokenState.maxUses !== 1
    || payload.tokenState.tokenIssued !== false || payload.tokenState.executionTokenAvailable !== false) {
    throw new Error('execution token decision cannot issue, expose or consume token material');
  }

  if (!Array.isArray(payload.targetIds) || payload.targetIds.length < 1
    || new Set(payload.targetIds).size !== payload.targetIds.length) {
    throw new Error('execution token decision targetIds are invalid');
  }

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('execution token decision cannot grant, issue or confirm execution authority');
  }
  const expectedNextAction = approval
    ? 'separate_execution_token_issuance_review_and_last_moment_hash_check'
    : 'none';
  if (payload.nextAction !== expectedNextAction) throw new Error('execution token decision nextAction is invalid');

  if (approval) {
    if (!payload.validityReview.activeAtDecision || !payload.validityReview.withinUpstreamWindow
      || payload.validityReview.remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`approved execution token decision requires at least ${MIN_REMAINING_SECONDS} seconds in an active request window`);
    }
    for (const [field, complete] of Object.entries(payload.completedReviews)) {
      if (complete !== true) throw new Error(`approved execution token decision requires completed ${field}`);
    }
    if (!payload.finalPreflight.allMatchRequest || !payload.scopeReview.exactScopeMatch) {
      throw new Error('approved execution token decision requires exact preflight and scope matches');
    }
  }

  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionTokenDecisionStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionTokenDecisionStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid execution token decision at line ${index + 1}: ${error.message}`); }
    });
  }

  findByTokenRequestId(tokenRequestId) {
    return this.readRecords().find((record) => record.payload && record.payload.tokenRequest
      && record.payload.tokenRequest.id === tokenRequestId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-token-decision-key') {
    assertSigningKey(signingKey);
    assertExecutionTokenDecisionPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('execution token decision signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByTokenRequestId(payload.tokenRequest.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed execution token decision already exists for request: ${payload.tokenRequest.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_token_decision_${crypto.randomUUID()}`,
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
      try { assertExecutionTokenDecisionPayload(record.payload); }
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
  EXECUTION_TOKEN_DECISION_AUTHORITY,
  EXECUTION_TOKEN_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
  ProductionExecutionTokenDecisionStore,
  assertExecutionTokenDecisionPayload,
};
