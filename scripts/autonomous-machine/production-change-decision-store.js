'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const CHANGE_DECISION_AUTHORITY = 'signed_human_decision_only_no_execution_authority';
const CHANGE_DECISION_STATUSES = Object.freeze({
  APPROVED: 'approved_authorisation_record_only',
  REJECTED: 'rejected_no_authorisation',
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

function assertZeroSafety(safety) {
  assertObject(safety, 'change decision safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`change decision safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed', 'executionAllowed']) {
    if (safety[field] !== false) throw new Error(`change decision safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('change decision safety requires productionTarget=null');
}

function assertDecisionPayload(payload) {
  assertObject(payload, 'production change decision payload');
  if (payload.schemaVersion !== 1) throw new Error('production change decision schemaVersion must be 1');
  if (payload.decisionType !== 'human_production_change_request_decision') throw new Error('production change decision type is invalid');
  if (payload.mode !== 'decision_record_only') throw new Error('production change decision mode is invalid');
  if (payload.authority !== CHANGE_DECISION_AUTHORITY) throw new Error('production change decision authority is invalid');
  if (!Object.values(CHANGE_DECISION_STATUSES).includes(payload.status)) throw new Error('production change decision status is invalid');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('production change decision value is invalid');
  const expectedStatus = payload.decision === 'approve' ? CHANGE_DECISION_STATUSES.APPROVED : CHANGE_DECISION_STATUSES.REJECTED;
  if (payload.status !== expectedStatus) throw new Error('production change decision status does not match decision');

  assertObject(payload.changeRequest, 'change decision changeRequest');
  for (const field of ['id', 'applicationId']) {
    if (typeof payload.changeRequest[field] !== 'string' || !payload.changeRequest[field]) {
      throw new TypeError(`change decision changeRequest requires ${field}`);
    }
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint']) {
    assertHash(payload.changeRequest[field], `change decision changeRequest ${field}`);
  }

  assertObject(payload.reviewer, 'change decision reviewer');
  if (typeof payload.reviewer.name !== 'string' || payload.reviewer.name.trim().length < 3) {
    throw new TypeError('change decision reviewer name is invalid');
  }
  if (typeof payload.reviewer.role !== 'string' || payload.reviewer.role.trim().length < 3) {
    throw new TypeError('change decision reviewer role is invalid');
  }
  if (typeof payload.reviewer.note !== 'string' || payload.reviewer.note.trim().length < 10) {
    throw new TypeError('change decision reviewer note is invalid');
  }

  assertObject(payload.completedApprovals, 'change decision completedApprovals');
  for (const field of ['evidenceReview', 'editorialReview', 'legalReview', 'productionOwnerApproval']) {
    if (typeof payload.completedApprovals[field] !== 'boolean') {
      throw new TypeError(`change decision completedApprovals ${field} must be boolean`);
    }
  }
  if (!Array.isArray(payload.targetIds) || payload.targetIds.length === 0) {
    throw new Error('production change decision requires targetIds');
  }
  const targetIds = new Set();
  payload.targetIds.forEach((targetId) => {
    if (typeof targetId !== 'string' || targetId.length < 3) throw new TypeError('change decision targetId is invalid');
    if (targetIds.has(targetId)) throw new Error(`production change decision has duplicate target: ${targetId}`);
    targetIds.add(targetId);
  });
  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false) {
    throw new Error('production change decision cannot resolve a production file destination');
  }
  if (payload.executionAuthorityGranted !== false) throw new Error('production change decision cannot grant execution authority');
  if (payload.nextAction !== (payload.decision === 'approve' ? 'separate_manual_production_execution_review' : 'none')) {
    throw new Error('production change decision nextAction is invalid');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionChangeDecisionStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionChangeDecisionStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid production change decision at line ${index + 1}: ${error.message}`); }
    });
  }

  findByChangeRequestId(changeRequestId) {
    return this.readRecords().find((record) => record.payload && record.payload.changeRequest
      && record.payload.changeRequest.id === changeRequestId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-change-decision-key') {
    assertSigningKey(signingKey);
    assertDecisionPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('production change decision signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByChangeRequestId(payload.changeRequest.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed production change decision already exists for request: ${payload.changeRequest.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `change_decision_${crypto.randomUUID()}`,
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
      try { assertDecisionPayload(record.payload); }
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
  CHANGE_DECISION_AUTHORITY,
  CHANGE_DECISION_STATUSES,
  ProductionChangeDecisionStore,
  assertDecisionPayload,
};
