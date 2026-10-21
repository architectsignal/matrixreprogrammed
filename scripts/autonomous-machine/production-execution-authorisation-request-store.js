'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const EXECUTION_AUTHORISATION_REQUEST_AUTHORITY = 'time_limited_request_only_no_execution_authority';
const EXECUTION_AUTHORISATION_REQUEST_STATUS = 'pending_manual_execution_authorisation_review';
const MIN_DURATION_SECONDS = 60;
const MAX_DURATION_SECONDS = 3600;

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
  assertObject(safety, 'execution authorisation request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution authorisation request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution authorisation request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution authorisation request safety requires productionTarget=null');
}

function assertExecutionAuthorisationRequestPayload(payload) {
  assertObject(payload, 'execution authorisation request payload');
  if (payload.schemaVersion !== 1) throw new Error('execution authorisation request schemaVersion must be 1');
  if (payload.requestType !== 'time_limited_manual_execution_authorisation_request') throw new Error('execution authorisation request type is invalid');
  if (payload.mode !== 'authorisation_request_record_only') throw new Error('execution authorisation request mode is invalid');
  if (payload.authority !== EXECUTION_AUTHORISATION_REQUEST_AUTHORITY) throw new Error('execution authorisation request authority is invalid');
  if (payload.status !== EXECUTION_AUTHORISATION_REQUEST_STATUS) throw new Error('execution authorisation request status is invalid');

  assertObject(payload.executionPlanDecision, 'execution authorisation request executionPlanDecision');
  for (const field of ['id', 'executionPlanId', 'sourceDecisionId', 'changeRequestId', 'applicationId']) {
    if (typeof payload.executionPlanDecision[field] !== 'string' || !payload.executionPlanDecision[field]) {
      throw new TypeError(`execution authorisation request executionPlanDecision requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'executionPlanRecordHash', 'executionPlanPayloadHash',
    'applicationFingerprint', 'candidateSnapshotHash', 'executionStepsHash',
  ]) assertHash(payload.executionPlanDecision[field], `execution authorisation request executionPlanDecision ${field}`);

  assertObject(payload.requester, 'execution authorisation request requester');
  for (const field of ['name', 'role']) {
    if (typeof payload.requester[field] !== 'string' || payload.requester[field].trim().length < 3) {
      throw new TypeError(`execution authorisation request requester ${field} is invalid`);
    }
  }
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) {
    throw new TypeError('execution authorisation request requester note is invalid');
  }

  assertObject(payload.validity, 'execution authorisation request validity');
  for (const field of ['requestedAt', 'validFrom', 'expiresAt']) assertIso(payload.validity[field], `execution authorisation request validity ${field}`);
  if (!Number.isInteger(payload.validity.durationSeconds)
    || payload.validity.durationSeconds < MIN_DURATION_SECONDS
    || payload.validity.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('execution authorisation request durationSeconds is invalid');
  }
  const requestedAt = Date.parse(payload.validity.requestedAt);
  const validFrom = Date.parse(payload.validity.validFrom);
  const expiresAt = Date.parse(payload.validity.expiresAt);
  if (requestedAt !== validFrom) throw new Error('execution authorisation request requestedAt must equal validFrom');
  if (expiresAt - validFrom !== payload.validity.durationSeconds * 1000) throw new Error('execution authorisation request validity duration is inconsistent');
  if (payload.validity.timeLimited !== true || payload.validity.singleUseRequested !== true || payload.validity.expiredAtCreation !== false) {
    throw new Error('execution authorisation request validity flags are invalid');
  }

  assertObject(payload.freshSnapshot, 'execution authorisation request freshSnapshot');
  assertIso(payload.freshSnapshot.verifiedAt, 'execution authorisation request freshSnapshot verifiedAt');
  if (Date.parse(payload.freshSnapshot.verifiedAt) !== validFrom) throw new Error('execution authorisation request fresh snapshot must be captured at validFrom');
  for (const field of ['snapshotHash', 'originalCandidateSnapshotHash']) assertHash(payload.freshSnapshot[field], `execution authorisation request freshSnapshot ${field}`);
  for (const field of ['candidateReferenceCount', 'uniqueCandidateCount']) {
    if (!Number.isInteger(payload.freshSnapshot[field]) || payload.freshSnapshot[field] < 1) {
      throw new Error(`execution authorisation request freshSnapshot ${field} is invalid`);
    }
  }
  if (payload.freshSnapshot.candidateReferenceCount < payload.freshSnapshot.uniqueCandidateCount) {
    throw new Error('execution authorisation request candidateReferenceCount cannot be smaller than uniqueCandidateCount');
  }
  if (!Number.isInteger(payload.freshSnapshot.maxAgeSeconds)
    || payload.freshSnapshot.maxAgeSeconds < 30
    || payload.freshSnapshot.maxAgeSeconds > payload.validity.durationSeconds) {
    throw new Error('execution authorisation request freshSnapshot maxAgeSeconds is invalid');
  }
  if (payload.freshSnapshot.allMatchOriginal !== true) throw new Error('execution authorisation request requires every fresh hash to match the signed plan');
  if (!Array.isArray(payload.freshSnapshot.candidates)
    || payload.freshSnapshot.candidates.length !== payload.freshSnapshot.uniqueCandidateCount) {
    throw new Error('execution authorisation request freshSnapshot candidates are inconsistent');
  }
  const paths = new Set();
  payload.freshSnapshot.candidates.forEach((candidate, index) => {
    assertObject(candidate, `execution authorisation request fresh candidate ${index}`);
    if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) throw new TypeError('execution authorisation request candidate path is invalid');
    if (paths.has(candidate.proposedRepositoryPath)) throw new Error('execution authorisation request contains duplicate candidate paths');
    paths.add(candidate.proposedRepositoryPath);
    if (!Array.isArray(candidate.targetIds) || candidate.targetIds.length < 1 || !Array.isArray(candidate.roles) || candidate.roles.length < 1) {
      throw new Error('execution authorisation request candidate requires targetIds and roles');
    }
    for (const field of ['currentSha256', 'originalSha256']) assertHash(candidate[field], `execution authorisation request candidate ${field}`);
    for (const field of ['currentBytes', 'originalBytes']) {
      if (!Number.isInteger(candidate[field]) || candidate[field] < 0) throw new Error(`execution authorisation request candidate ${field} is invalid`);
    }
    if (candidate.exists !== true || candidate.regularFile !== true || candidate.symlink !== false
      || candidate.freshMatchOriginal !== true || candidate.writeAllowed !== false) {
      throw new Error('execution authorisation request candidate safety state is invalid');
    }
    if (candidate.currentSha256 !== candidate.originalSha256 || candidate.currentBytes !== candidate.originalBytes) {
      throw new Error('execution authorisation request candidate no longer matches the signed plan');
    }
  });
  if (payload.freshSnapshot.snapshotHash !== sha256(stableStringify(payload.freshSnapshot.candidates))) {
    throw new Error('execution authorisation request fresh snapshot hash is invalid');
  }

  assertObject(payload.rollbackPackage, 'execution authorisation request rollbackPackage');
  if (payload.rollbackPackage.packageType !== 'pre_execution_rollback_manifest_only') throw new Error('execution authorisation request rollback package type is invalid');
  if (payload.rollbackPackage.status !== 'external_verified_backup_required_before_execution') throw new Error('execution authorisation request rollback package status is invalid');
  assertObject(payload.rollbackPackage.custodian, 'execution authorisation request rollbackPackage custodian');
  if (typeof payload.rollbackPackage.custodian.name !== 'string' || payload.rollbackPackage.custodian.name.trim().length < 3) throw new TypeError('execution authorisation request rollback custodian name is invalid');
  if (typeof payload.rollbackPackage.custodian.note !== 'string' || payload.rollbackPackage.custodian.note.trim().length < 10) throw new TypeError('execution authorisation request rollback custodian note is invalid');
  if (payload.rollbackPackage.uniqueCandidateCount !== payload.freshSnapshot.uniqueCandidateCount
    || payload.rollbackPackage.backupsCreated !== 0
    || payload.rollbackPackage.externalVerifiedBackupRequired !== true
    || payload.rollbackPackage.restoreTestRequired !== true
    || payload.rollbackPackage.packageComplete !== false) {
    throw new Error('execution authorisation request rollback package safety flags are invalid');
  }
  if (!Array.isArray(payload.rollbackPackage.entries)
    || payload.rollbackPackage.entries.length !== payload.freshSnapshot.uniqueCandidateCount) {
    throw new Error('execution authorisation request rollback package entries are inconsistent');
  }
  const freshByPath = new Map(payload.freshSnapshot.candidates.map((candidate) => [candidate.proposedRepositoryPath, candidate]));
  payload.rollbackPackage.entries.forEach((entry, index) => {
    assertObject(entry, `execution authorisation request rollback entry ${index}`);
    assertHash(entry.preExecutionSha256, 'execution authorisation request rollback preExecutionSha256');
    if (!Number.isInteger(entry.preExecutionBytes) || entry.preExecutionBytes < 0) throw new Error('execution authorisation request rollback preExecutionBytes is invalid');
    const freshCandidate = freshByPath.get(entry.proposedRepositoryPath);
    if (!freshCandidate || entry.preExecutionSha256 !== freshCandidate.currentSha256
      || entry.preExecutionBytes !== freshCandidate.currentBytes
      || stableStringify(entry.targetIds) !== stableStringify(freshCandidate.targetIds)) {
      throw new Error('execution authorisation request rollback entry does not match the fresh snapshot');
    }
    if (entry.backupArtifactPath !== null || entry.backupArtifactSha256 !== null || entry.backupCreated !== false
      || entry.restoreAction !== 'restore_exact_pre_execution_bytes_from_verified_external_backup'
      || entry.restoreVerification !== 'sha256_must_match_pre_execution_snapshot'
      || entry.writeAllowed !== false) {
      throw new Error('execution authorisation request rollback entry safety state is invalid');
    }
  });
  if (!Array.isArray(payload.rollbackPackage.steps) || payload.rollbackPackage.steps.length < 4) {
    throw new Error('execution authorisation request rollback package requires explicit steps');
  }
  if (payload.rollbackPackage.manifestHash !== sha256(stableStringify({
    custodian: payload.rollbackPackage.custodian,
    entries: payload.rollbackPackage.entries,
    steps: payload.rollbackPackage.steps,
  }))) throw new Error('execution authorisation request rollback manifest hash is invalid');

  if (!Array.isArray(payload.targetIds) || payload.targetIds.length < 1) throw new Error('execution authorisation request requires targetIds');
  const targetIds = new Set();
  payload.targetIds.forEach((targetId) => {
    if (typeof targetId !== 'string' || targetId.length < 3) throw new TypeError('execution authorisation request targetId is invalid');
    if (targetIds.has(targetId)) throw new Error(`execution authorisation request has duplicate target: ${targetId}`);
    targetIds.add(targetId);
  });

  const candidateTargetIds = new Set(payload.freshSnapshot.candidates.flatMap((candidate) => candidate.targetIds));
  if (stableStringify([...candidateTargetIds].sort()) !== stableStringify([...targetIds].sort())) {
    throw new Error('execution authorisation request targetIds do not match fresh snapshot candidates');
  }

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false) {
    throw new Error('execution authorisation request cannot grant or confirm execution authority');
  }
  if (payload.nextAction !== 'separate_manual_execution_authorisation_decision_and_fresh_hash_check') {
    throw new Error('execution authorisation request nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionAuthorisationRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionAuthorisationRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid execution authorisation request at line ${index + 1}: ${error.message}`); }
    });
  }

  findByExecutionPlanDecisionId(executionPlanDecisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.executionPlanDecision
      && record.payload.executionPlanDecision.id === executionPlanDecisionId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-authorisation-request-key') {
    assertSigningKey(signingKey);
    assertExecutionAuthorisationRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('execution authorisation request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByExecutionPlanDecisionId(payload.executionPlanDecision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed execution authorisation request already exists for plan decision: ${payload.executionPlanDecision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_authorisation_request_${crypto.randomUUID()}`,
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
      try { assertExecutionAuthorisationRequestPayload(record.payload); }
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
  EXECUTION_AUTHORISATION_REQUEST_AUTHORITY,
  EXECUTION_AUTHORISATION_REQUEST_STATUS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  ProductionExecutionAuthorisationRequestStore,
  assertExecutionAuthorisationRequestPayload,
};
