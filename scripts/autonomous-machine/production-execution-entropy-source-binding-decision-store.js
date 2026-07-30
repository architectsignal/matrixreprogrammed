'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const ENTROPY_SOURCE_BINDING_DECISION_AUTHORITY =
  'signed_human_entropy_source_binding_decision_only_class_bound_no_provider_implementation_entropy_or_execution_authority';
const ENTROPY_SOURCE_BINDING_DECISION_STATUSES = Object.freeze({
  APPROVED: 'approved_entropy_source_binding_request_record_only',
  REJECTED: 'rejected_entropy_source_binding_request_no_provider_implementation_or_authority',
});
const MIN_REMAINING_SECONDS = 1;
const REVIEW_FIELDS = Object.freeze([
  'sourceBindingRequestWindowReview',
  'approvedSourceClassBindingReview',
  'noProviderSelectionReview',
  'noImplementationSelectionReview',
  'noApiDeviceSyscallSelectionReview',
  'noNetworkSourceReview',
  'finalPreflightReview',
  'exactScopeReview',
  'backupEvidenceReview',
  'restoreEvidenceReview',
  'productionOwnerReview',
]);

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
  assertObject(safety, 'entropy source binding decision safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`entropy source binding decision safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`entropy source binding decision safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('entropy source binding decision safety requires productionTarget=null');
}
function assertBindingState(state) {
  assertObject(state, 'entropy source binding decision bindingState');
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
    throw new Error('entropy source binding decision may approve only the bound class and cannot select a provider or implementation, produce entropy, or create secret material');
  }
}
function assertCandidate(candidate, field) {
  assertObject(candidate, field);
  if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) {
    throw new TypeError(`${field} proposedRepositoryPath is invalid`);
  }
  for (const name of ['currentSha256', 'sourceBindingRequestSha256']) assertHash(candidate[name], `${field} ${name}`);
  for (const name of ['currentBytes', 'sourceBindingRequestBytes']) {
    if (!Number.isInteger(candidate[name]) || candidate[name] < 0) throw new Error(`${field} ${name} is invalid`);
  }
  if (candidate.currentSha256 !== candidate.sourceBindingRequestSha256
    || candidate.currentBytes !== candidate.sourceBindingRequestBytes
    || candidate.matchSourceBindingRequest !== true || candidate.writeAllowed !== false) {
    throw new Error(`${field} does not match the signed source binding request`);
  }
}
function assertOptionalPreflight(preflight, required) {
  assertObject(preflight, 'entropy source binding decision finalPreflight');
  if (preflight.required !== required || typeof preflight.allMatchSourceBindingRequest !== 'boolean') {
    throw new Error('entropy source binding decision finalPreflight flags are invalid');
  }
  if (!required) {
    if (preflight.verifiedAt !== null || preflight.snapshotHash !== null
      || preflight.allMatchSourceBindingRequest !== false || !Array.isArray(preflight.candidates)
      || preflight.candidates.length !== 0) {
      throw new Error('entropy source binding decision optional finalPreflight state is invalid');
    }
    return;
  }
  assertIso(preflight.verifiedAt, 'entropy source binding decision finalPreflight verifiedAt');
  assertHash(preflight.snapshotHash, 'entropy source binding decision finalPreflight snapshotHash');
  if (!preflight.allMatchSourceBindingRequest || !Array.isArray(preflight.candidates) || preflight.candidates.length < 1) {
    throw new Error('entropy source binding decision finalPreflight is incomplete');
  }
  const paths = new Set();
  preflight.candidates.forEach((candidate, index) => {
    assertCandidate(candidate, `entropy source binding decision candidate ${index}`);
    if (paths.has(candidate.proposedRepositoryPath)) throw new Error('entropy source binding decision has duplicate candidates');
    paths.add(candidate.proposedRepositoryPath);
  });
  if (preflight.snapshotHash !== sha256(stableStringify(preflight.candidates))) {
    throw new Error('entropy source binding decision finalPreflight snapshotHash is invalid');
  }
}
function assertOptionalScopeReview(scopeReview, required) {
  assertObject(scopeReview, 'entropy source binding decision scopeReview');
  if (scopeReview.required !== required || typeof scopeReview.exactScopeMatch !== 'boolean') {
    throw new Error('entropy source binding decision scopeReview flags are invalid');
  }
  if (!required) {
    if (scopeReview.sourceBindingRequestScopeHash !== null || scopeReview.recomputedScopeHash !== null
      || scopeReview.exactScopeMatch !== false || scopeReview.operationCount !== 0
      || scopeReview.candidateCount !== 0 || !Array.isArray(scopeReview.operations)
      || scopeReview.operations.length !== 0) {
      throw new Error('entropy source binding decision optional scopeReview state is invalid');
    }
    return;
  }
  assertHash(scopeReview.sourceBindingRequestScopeHash, 'entropy source binding decision scopeReview sourceBindingRequestScopeHash');
  assertHash(scopeReview.recomputedScopeHash, 'entropy source binding decision scopeReview recomputedScopeHash');
  if (scopeReview.sourceBindingRequestScopeHash !== scopeReview.recomputedScopeHash || !scopeReview.exactScopeMatch) {
    throw new Error('entropy source binding decision scope does not exactly match the signed request');
  }
  if (!Number.isInteger(scopeReview.operationCount) || scopeReview.operationCount < 1
    || !Number.isInteger(scopeReview.candidateCount) || scopeReview.candidateCount < 1
    || !Array.isArray(scopeReview.operations) || scopeReview.operations.length !== scopeReview.operationCount) {
    throw new Error('entropy source binding decision scope counts are invalid');
  }
  const paths = new Set();
  scopeReview.operations.forEach((operation, index) => {
    assertObject(operation, `entropy source binding decision operation ${index}`);
    if (operation.sequence !== index + 1 || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence') {
      throw new Error('entropy source binding decision operation identity is invalid');
    }
    if (!Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length) {
      throw new Error('entropy source binding decision operation candidate scope is invalid');
    }
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      if (typeof candidatePath !== 'string' || !candidatePath) throw new TypeError('entropy source binding decision operation path is invalid');
      paths.add(candidatePath);
      const hash = operation.candidateHashes[candidateIndex];
      assertObject(hash, 'entropy source binding decision operation candidate hash');
      if (hash.proposedRepositoryPath !== candidatePath) throw new Error('entropy source binding decision operation hash path is inconsistent');
      assertHash(hash.sha256, 'entropy source binding decision operation candidate hash sha256');
      if (!Number.isInteger(hash.bytes) || hash.bytes < 0) throw new Error('entropy source binding decision operation candidate bytes are invalid');
    });
    if (operation.executionAllowed !== false || operation.productionWriteAllowed !== false) {
      throw new Error('entropy source binding decision operation cannot grant execution');
    }
  });
  if (paths.size !== scopeReview.candidateCount) throw new Error('entropy source binding decision candidateCount is inconsistent');
}
function assertEntropySourceBindingDecisionPayload(payload) {
  assertObject(payload, 'entropy source binding decision payload');
  if (payload.schemaVersion !== 1) throw new Error('entropy source binding decision schemaVersion must be 1');
  if (payload.decisionType !== 'human_single_use_entropy_source_binding_request_decision') {
    throw new Error('entropy source binding decision type is invalid');
  }
  if (payload.mode !== 'entropy_source_binding_decision_record_only') throw new Error('entropy source binding decision mode is invalid');
  if (payload.authority !== ENTROPY_SOURCE_BINDING_DECISION_AUTHORITY) throw new Error('entropy source binding decision authority is invalid');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('entropy source binding decision value is invalid');
  const expectedStatus = payload.decision === 'approve'
    ? ENTROPY_SOURCE_BINDING_DECISION_STATUSES.APPROVED
    : ENTROPY_SOURCE_BINDING_DECISION_STATUSES.REJECTED;
  if (payload.status !== expectedStatus) throw new Error('entropy source binding decision status does not match decision');

  assertObject(payload.sourceBindingRequest, 'entropy source binding decision sourceBindingRequest');
  for (const field of [
    'id', 'sourceSelectionDecisionId', 'sourceSelectionRequestId',
    'entropyDecisionId', 'entropyRequestId', 'applicationId',
  ]) {
    if (typeof payload.sourceBindingRequest[field] !== 'string' || !payload.sourceBindingRequest[field]) {
      throw new TypeError(`entropy source binding decision sourceBindingRequest requires ${field}`);
    }
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint', 'scopeHash', 'preflightSnapshotHash']) {
    assertHash(payload.sourceBindingRequest[field], `entropy source binding decision sourceBindingRequest ${field}`);
  }

  assertObject(payload.reviewer, 'entropy source binding decision reviewer');
  for (const field of ['name', 'role']) {
    if (typeof payload.reviewer[field] !== 'string' || payload.reviewer[field].trim().length < 3) {
      throw new TypeError(`entropy source binding decision reviewer ${field} is invalid`);
    }
  }
  if (typeof payload.reviewer.note !== 'string' || payload.reviewer.note.trim().length < 10) {
    throw new TypeError('entropy source binding decision reviewer note is invalid');
  }

  assertObject(payload.completedReviews, 'entropy source binding decision completedReviews');
  for (const field of REVIEW_FIELDS) {
    if (typeof payload.completedReviews[field] !== 'boolean') {
      throw new TypeError(`entropy source binding decision completedReviews ${field} must be boolean`);
    }
  }

  assertObject(payload.validityReview, 'entropy source binding decision validityReview');
  for (const field of [
    'decisionAt', 'requestValidFrom', 'requestExpiresAt',
    'sourceSelectionRequestExpiresAt', 'entropyRequestExpiresAt',
  ]) {
    assertIso(payload.validityReview[field], `entropy source binding decision validityReview ${field}`);
  }
  if (!Number.isInteger(payload.validityReview.remainingSeconds) || payload.validityReview.remainingSeconds < 0
    || typeof payload.validityReview.activeAtDecision !== 'boolean'
    || typeof payload.validityReview.withinSourceSelectionRequestWindow !== 'boolean'
    || typeof payload.validityReview.withinEntropyRequestWindow !== 'boolean') {
    throw new Error('entropy source binding decision validityReview is invalid');
  }

  const approval = payload.decision === 'approve';
  assertOptionalPreflight(payload.finalPreflight, approval);
  assertOptionalScopeReview(payload.scopeReview, approval);
  assertBindingState(payload.bindingState);

  if (!Array.isArray(payload.targetIds) || payload.targetIds.length < 1
    || new Set(payload.targetIds).size !== payload.targetIds.length) {
    throw new Error('entropy source binding decision targetIds are invalid');
  }
  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false
    || payload.tokenIssued !== false || payload.executionTokenAvailable !== false) {
    throw new Error('entropy source binding decision cannot grant or confirm execution authority');
  }
  const expectedNextAction = approval
    ? 'separate_entropy_provider_policy_request_no_provider_implementation_or_entropy_output'
    : 'none';
  if (payload.nextAction !== expectedNextAction) throw new Error('entropy source binding decision nextAction is invalid');
  if (approval) {
    if (!payload.validityReview.activeAtDecision
      || !payload.validityReview.withinSourceSelectionRequestWindow
      || !payload.validityReview.withinEntropyRequestWindow
      || payload.validityReview.remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`approved entropy source binding decision requires at least ${MIN_REMAINING_SECONDS} second remaining`);
    }
    for (const [field, complete] of Object.entries(payload.completedReviews)) {
      if (complete !== true) throw new Error(`approved entropy source binding decision requires completed ${field}`);
    }
    if (!payload.finalPreflight.allMatchSourceBindingRequest || !payload.scopeReview.exactScopeMatch) {
      throw new Error('approved entropy source binding decision requires exact preflight and scope matches');
    }
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionEntropySourceBindingDecisionStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionEntropySourceBindingDecisionStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }
  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid entropy source binding decision at line ${index + 1}: ${error.message}`); }
    });
  }
  findBySourceBindingRequestId(requestId) {
    return this.readRecords().find((record) => record.payload && record.payload.sourceBindingRequest
      && record.payload.sourceBindingRequest.id === requestId) || null;
  }
  appendSigned(payload, signingKey, signingKeyId = 'production-execution-entropy-source-binding-decision-key') {
    assertSigningKey(signingKey);
    assertEntropySourceBindingDecisionPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('entropy source binding decision signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findBySourceBindingRequestId(payload.sourceBindingRequest.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed entropy source binding decision already exists for request: ${payload.sourceBindingRequest.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `entropy_source_binding_decision_${crypto.randomUUID()}`,
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
      try { assertEntropySourceBindingDecisionPayload(record.payload); }
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
  ENTROPY_SOURCE_BINDING_DECISION_AUTHORITY,
  ENTROPY_SOURCE_BINDING_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
  REVIEW_FIELDS,
  ProductionExecutionEntropySourceBindingDecisionStore,
  assertEntropySourceBindingDecisionPayload,
};
