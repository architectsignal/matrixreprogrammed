'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const EXECUTION_AUTHORISATION_DECISION_AUTHORITY = 'signed_human_execution_authorisation_decision_only_no_execution_authority';
const EXECUTION_AUTHORISATION_DECISION_STATUSES = Object.freeze({
  APPROVED: 'approved_execution_authorisation_record_only',
  REJECTED: 'rejected_execution_authorisation_no_authorisation',
});

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
  assertObject(safety, 'execution authorisation decision safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution authorisation decision safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution authorisation decision safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution authorisation decision safety requires productionTarget=null');
}

function assertExecutionAuthorisationDecisionPayload(payload) {
  assertObject(payload, 'execution authorisation decision payload');
  if (payload.schemaVersion !== 1) throw new Error('execution authorisation decision schemaVersion must be 1');
  if (payload.decisionType !== 'human_execution_authorisation_request_decision') throw new Error('execution authorisation decision type is invalid');
  if (payload.mode !== 'authorisation_decision_record_only') throw new Error('execution authorisation decision mode is invalid');
  if (payload.authority !== EXECUTION_AUTHORISATION_DECISION_AUTHORITY) throw new Error('execution authorisation decision authority is invalid');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('execution authorisation decision value is invalid');
  const expectedStatus = payload.decision === 'approve'
    ? EXECUTION_AUTHORISATION_DECISION_STATUSES.APPROVED
    : EXECUTION_AUTHORISATION_DECISION_STATUSES.REJECTED;
  if (payload.status !== expectedStatus) throw new Error('execution authorisation decision status does not match decision');

  assertObject(payload.authorisationRequest, 'execution authorisation decision authorisationRequest');
  for (const field of ['id', 'executionPlanDecisionId', 'executionPlanId', 'sourceDecisionId', 'changeRequestId', 'applicationId']) {
    if (typeof payload.authorisationRequest[field] !== 'string' || !payload.authorisationRequest[field]) {
      throw new TypeError(`execution authorisation decision authorisationRequest requires ${field}`);
    }
  }
  for (const field of [
    'recordHash', 'payloadHash', 'applicationFingerprint', 'candidateSnapshotHash',
    'executionStepsHash', 'requestFreshSnapshotHash', 'rollbackManifestHash',
  ]) assertHash(payload.authorisationRequest[field], `execution authorisation decision authorisationRequest ${field}`);

  assertObject(payload.reviewer, 'execution authorisation decision reviewer');
  for (const field of ['name', 'role']) {
    if (typeof payload.reviewer[field] !== 'string' || payload.reviewer[field].trim().length < 3) {
      throw new TypeError(`execution authorisation decision reviewer ${field} is invalid`);
    }
  }
  if (typeof payload.reviewer.note !== 'string' || payload.reviewer.note.trim().length < 10) {
    throw new TypeError('execution authorisation decision reviewer note is invalid');
  }

  assertObject(payload.completedReviews, 'execution authorisation decision completedReviews');
  for (const field of ['requestWindowReview', 'freshHashReview', 'externalBackupReview', 'restoreRehearsalReview', 'productionOwnerReview']) {
    if (typeof payload.completedReviews[field] !== 'boolean') {
      throw new TypeError(`execution authorisation decision completedReviews ${field} must be boolean`);
    }
  }

  assertObject(payload.validityReview, 'execution authorisation decision validityReview');
  for (const field of ['decisionAt', 'requestValidFrom', 'requestExpiresAt']) {
    assertIso(payload.validityReview[field], `execution authorisation decision validityReview ${field}`);
  }
  for (const field of ['remainingSeconds', 'requestSnapshotAgeSeconds']) {
    if (!Number.isInteger(payload.validityReview[field]) || payload.validityReview[field] < 0) {
      throw new Error(`execution authorisation decision validityReview ${field} is invalid`);
    }
  }
  for (const field of ['activeAtDecision', 'requestSnapshotWithinMaxAge']) {
    if (typeof payload.validityReview[field] !== 'boolean') {
      throw new TypeError(`execution authorisation decision validityReview ${field} must be boolean`);
    }
  }

  assertObject(payload.freshRecheck, 'execution authorisation decision freshRecheck');
  if (typeof payload.freshRecheck.required !== 'boolean' || typeof payload.freshRecheck.allMatchRequest !== 'boolean') {
    throw new TypeError('execution authorisation decision freshRecheck flags must be boolean');
  }
  if (payload.freshRecheck.required) {
    assertIso(payload.freshRecheck.verifiedAt, 'execution authorisation decision freshRecheck verifiedAt');
    assertHash(payload.freshRecheck.snapshotHash, 'execution authorisation decision freshRecheck snapshotHash');
    if (!Array.isArray(payload.freshRecheck.candidates) || payload.freshRecheck.candidates.length < 1) {
      throw new Error('execution authorisation decision freshRecheck requires candidates');
    }
    if (payload.freshRecheck.snapshotHash !== sha256(stableStringify(payload.freshRecheck.candidates))) {
      throw new Error('execution authorisation decision freshRecheck snapshotHash is invalid');
    }
    payload.freshRecheck.candidates.forEach((candidate, index) => {
      assertObject(candidate, `execution authorisation decision fresh candidate ${index}`);
      if (typeof candidate.proposedRepositoryPath !== 'string' || !candidate.proposedRepositoryPath) throw new TypeError('execution authorisation decision fresh candidate path is invalid');
      for (const field of ['currentSha256', 'requestSha256']) assertHash(candidate[field], `execution authorisation decision fresh candidate ${field}`);
      for (const field of ['currentBytes', 'requestBytes']) {
        if (!Number.isInteger(candidate[field]) || candidate[field] < 0) throw new Error(`execution authorisation decision fresh candidate ${field} is invalid`);
      }
      if (candidate.currentSha256 !== candidate.requestSha256 || candidate.currentBytes !== candidate.requestBytes
        || candidate.matchRequest !== true || candidate.writeAllowed !== false) {
        throw new Error('execution authorisation decision fresh candidate does not match the request');
      }
    });
  } else if (payload.freshRecheck.verifiedAt !== null || payload.freshRecheck.snapshotHash !== null
    || !Array.isArray(payload.freshRecheck.candidates) || payload.freshRecheck.candidates.length !== 0
    || payload.freshRecheck.allMatchRequest !== false) {
    throw new Error('execution authorisation decision optional freshRecheck state is invalid');
  }

  assertObject(payload.backupVerification, 'execution authorisation decision backupVerification');
  if (typeof payload.backupVerification.required !== 'boolean' || typeof payload.backupVerification.allVerified !== 'boolean') {
    throw new TypeError('execution authorisation decision backupVerification flags must be boolean');
  }
  if (payload.backupVerification.required) {
    if (payload.backupVerification.rootLabel !== 'external_backup_root' || payload.backupVerification.rootOutsideRepository !== true) {
      throw new Error('execution authorisation decision backup root boundary is invalid');
    }
    assertHash(payload.backupVerification.manifestHash, 'execution authorisation decision backup manifestHash');
    if (!Array.isArray(payload.backupVerification.entries) || payload.backupVerification.entries.length < 1) {
      throw new Error('execution authorisation decision backupVerification requires entries');
    }
    if (payload.backupVerification.manifestHash !== sha256(stableStringify(payload.backupVerification.entries))) {
      throw new Error('execution authorisation decision backup manifestHash is invalid');
    }
    payload.backupVerification.entries.forEach((entry, index) => {
      assertObject(entry, `execution authorisation decision backup entry ${index}`);
      for (const field of ['proposedRepositoryPath', 'backupArtifactPath']) {
        if (typeof entry[field] !== 'string' || !entry[field]) throw new TypeError(`execution authorisation decision backup entry requires ${field}`);
      }
      for (const field of ['backupSha256', 'sourceSha256']) assertHash(entry[field], `execution authorisation decision backup entry ${field}`);
      for (const field of ['backupBytes', 'sourceBytes']) {
        if (!Number.isInteger(entry[field]) || entry[field] < 0) throw new Error(`execution authorisation decision backup entry ${field} is invalid`);
      }
      if (entry.backupSha256 !== entry.sourceSha256 || entry.backupBytes !== entry.sourceBytes
        || entry.verified !== true || entry.readOnlyVerification !== true) {
        throw new Error('execution authorisation decision backup entry is not verified');
      }
    });
  } else if (payload.backupVerification.rootLabel !== null || payload.backupVerification.rootOutsideRepository !== false
    || payload.backupVerification.manifestHash !== null || !Array.isArray(payload.backupVerification.entries)
    || payload.backupVerification.entries.length !== 0 || payload.backupVerification.allVerified !== false) {
    throw new Error('execution authorisation decision optional backupVerification state is invalid');
  }

  assertObject(payload.restoreRehearsal, 'execution authorisation decision restoreRehearsal');
  if (typeof payload.restoreRehearsal.required !== 'boolean' || typeof payload.restoreRehearsal.allVerified !== 'boolean') {
    throw new TypeError('execution authorisation decision restoreRehearsal flags must be boolean');
  }
  if (payload.restoreRehearsal.required) {
    if (payload.restoreRehearsal.mode !== 'disposable_restore_rehearsal'
      || payload.restoreRehearsal.rootLabel !== 'gitignored_runtime_restore_rehearsal'
      || payload.restoreRehearsal.cleanedUp !== true) {
      throw new Error('execution authorisation decision restore rehearsal boundary is invalid');
    }
    if (!Number.isInteger(payload.restoreRehearsal.filesRestored) || payload.restoreRehearsal.filesRestored < 1
      || payload.restoreRehearsal.disposableRuntimeWrites !== payload.restoreRehearsal.filesRestored) {
      throw new Error('execution authorisation decision restore rehearsal counts are invalid');
    }
    assertHash(payload.restoreRehearsal.manifestHash, 'execution authorisation decision restore rehearsal manifestHash');
    if (!Array.isArray(payload.restoreRehearsal.entries)
      || payload.restoreRehearsal.entries.length !== payload.restoreRehearsal.filesRestored) {
      throw new Error('execution authorisation decision restore rehearsal entries are inconsistent');
    }
    if (payload.restoreRehearsal.manifestHash !== sha256(stableStringify(payload.restoreRehearsal.entries))) {
      throw new Error('execution authorisation decision restore rehearsal manifestHash is invalid');
    }
    payload.restoreRehearsal.entries.forEach((entry, index) => {
      assertObject(entry, `execution authorisation decision restore rehearsal entry ${index}`);
      if (typeof entry.proposedRepositoryPath !== 'string' || !entry.proposedRepositoryPath) throw new TypeError('execution authorisation decision restore rehearsal entry path is invalid');
      for (const field of ['restoredSha256', 'expectedSha256']) assertHash(entry[field], `execution authorisation decision restore rehearsal entry ${field}`);
      if (!Number.isInteger(entry.restoredBytes) || entry.restoredBytes < 0
        || entry.restoredSha256 !== entry.expectedSha256 || entry.verified !== true) {
        throw new Error('execution authorisation decision restore rehearsal entry is invalid');
      }
    });
  } else if (payload.restoreRehearsal.mode !== null || payload.restoreRehearsal.rootLabel !== null
    || payload.restoreRehearsal.filesRestored !== 0 || payload.restoreRehearsal.disposableRuntimeWrites !== 0
    || payload.restoreRehearsal.cleanedUp !== true || payload.restoreRehearsal.manifestHash !== null
    || !Array.isArray(payload.restoreRehearsal.entries) || payload.restoreRehearsal.entries.length !== 0
    || payload.restoreRehearsal.allVerified !== false) {
    throw new Error('execution authorisation decision optional restoreRehearsal state is invalid');
  }

  if (!Array.isArray(payload.targetIds) || payload.targetIds.length < 1) throw new Error('execution authorisation decision requires targetIds');
  if (new Set(payload.targetIds).size !== payload.targetIds.length) throw new Error('execution authorisation decision has duplicate targetIds');

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.finalDestinationConfirmed !== false || payload.readyForExecution !== false
    || payload.executionAuthorityGranted !== false || payload.authorisationGranted !== false) {
    throw new Error('execution authorisation decision cannot grant or confirm execution authority');
  }
  const expectedNextAction = payload.decision === 'approve'
    ? 'separate_single_use_execution_token_review_and_final_hash_check'
    : 'none';
  if (payload.nextAction !== expectedNextAction) throw new Error('execution authorisation decision nextAction is invalid');

  if (payload.decision === 'approve') {
    if (!payload.validityReview.activeAtDecision || !payload.validityReview.requestSnapshotWithinMaxAge) {
      throw new Error('approved execution authorisation decision requires an active, fresh request');
    }
    for (const [field, complete] of Object.entries(payload.completedReviews)) {
      if (complete !== true) throw new Error(`approved execution authorisation decision requires completed ${field}`);
    }
    if (!payload.freshRecheck.required || !payload.freshRecheck.allMatchRequest
      || !payload.backupVerification.required || !payload.backupVerification.allVerified
      || !payload.restoreRehearsal.required || !payload.restoreRehearsal.allVerified) {
      throw new Error('approved execution authorisation decision requires fresh hashes, backups and restore rehearsal');
    }
  }

  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionAuthorisationDecisionStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionAuthorisationDecisionStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid execution authorisation decision at line ${index + 1}: ${error.message}`); }
    });
  }

  findByAuthorisationRequestId(authorisationRequestId) {
    return this.readRecords().find((record) => record.payload && record.payload.authorisationRequest
      && record.payload.authorisationRequest.id === authorisationRequestId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-authorisation-decision-key') {
    assertSigningKey(signingKey);
    assertExecutionAuthorisationDecisionPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('execution authorisation decision signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByAuthorisationRequestId(payload.authorisationRequest.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed execution authorisation decision already exists for request: ${payload.authorisationRequest.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_authorisation_decision_${crypto.randomUUID()}`,
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
      try { assertExecutionAuthorisationDecisionPayload(record.payload); }
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
  EXECUTION_AUTHORISATION_DECISION_AUTHORITY,
  EXECUTION_AUTHORISATION_DECISION_STATUSES,
  ProductionExecutionAuthorisationDecisionStore,
  assertExecutionAuthorisationDecisionPayload,
};
