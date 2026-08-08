'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');

const EXECUTION_PLAN_DECISION_AUTHORITY = 'signed_human_execution_plan_decision_only_no_execution_authority';
const EXECUTION_PLAN_DECISION_STATUSES = Object.freeze({
  APPROVED: 'approved_mapping_and_plan_record_only',
  REJECTED: 'rejected_mapping_or_plan_no_authorisation',
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
  assertObject(safety, 'execution plan decision safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution plan decision safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution plan decision safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution plan decision safety requires productionTarget=null');
}

function assertExecutionPlanDecisionPayload(payload) {
  assertObject(payload, 'execution plan decision payload');
  if (payload.schemaVersion !== 1) throw new Error('execution plan decision schemaVersion must be 1');
  if (payload.decisionType !== 'human_production_execution_plan_decision') throw new Error('execution plan decision type is invalid');
  if (payload.mode !== 'execution_plan_decision_record_only') throw new Error('execution plan decision mode is invalid');
  if (payload.authority !== EXECUTION_PLAN_DECISION_AUTHORITY) throw new Error('execution plan decision authority is invalid');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('execution plan decision value is invalid');
  const expectedStatus = payload.decision === 'approve'
    ? EXECUTION_PLAN_DECISION_STATUSES.APPROVED
    : EXECUTION_PLAN_DECISION_STATUSES.REJECTED;
  if (payload.status !== expectedStatus) throw new Error('execution plan decision status does not match decision');

  assertObject(payload.executionPlan, 'execution plan decision executionPlan');
  for (const field of ['id', 'sourceDecisionId', 'changeRequestId', 'applicationId']) {
    if (typeof payload.executionPlan[field] !== 'string' || !payload.executionPlan[field]) {
      throw new TypeError(`execution plan decision executionPlan requires ${field}`);
    }
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint', 'candidateSnapshotHash', 'executionStepsHash']) {
    assertHash(payload.executionPlan[field], `execution plan decision executionPlan ${field}`);
  }

  assertObject(payload.reviewer, 'execution plan decision reviewer');
  for (const field of ['name', 'role']) {
    if (typeof payload.reviewer[field] !== 'string' || payload.reviewer[field].trim().length < 3) {
      throw new TypeError(`execution plan decision reviewer ${field} is invalid`);
    }
  }
  if (typeof payload.reviewer.note !== 'string' || payload.reviewer.note.trim().length < 10) {
    throw new TypeError('execution plan decision reviewer note is invalid');
  }

  assertObject(payload.completedReviews, 'execution plan decision completedReviews');
  for (const field of ['targetMappingReview', 'fileSnapshotReview', 'rollbackPlanReview', 'validationPlanReview', 'productionOwnerReview']) {
    if (typeof payload.completedReviews[field] !== 'boolean') {
      throw new TypeError(`execution plan decision completedReviews ${field} must be boolean`);
    }
  }

  assertObject(payload.mappingSummary, 'execution plan decision mappingSummary');
  for (const field of ['targetCount', 'candidateCount', 'existingCandidateCount', 'missingCandidateCount']) {
    if (!Number.isInteger(payload.mappingSummary[field]) || payload.mappingSummary[field] < 0) {
      throw new Error(`execution plan decision mappingSummary ${field} is invalid`);
    }
  }
  if (payload.mappingSummary.targetCount < 1 || payload.mappingSummary.candidateCount < 1) {
    throw new Error('execution plan decision requires mapped targets and candidates');
  }
  if (payload.mappingSummary.candidateCount
    !== payload.mappingSummary.existingCandidateCount + payload.mappingSummary.missingCandidateCount) {
    throw new Error('execution plan decision candidate counts are inconsistent');
  }
  if (payload.mappingSummary.allCandidatesPresent !== (payload.mappingSummary.missingCandidateCount === 0)) {
    throw new Error('execution plan decision allCandidatesPresent is inconsistent');
  }

  if (!Array.isArray(payload.targetIds) || payload.targetIds.length !== payload.mappingSummary.targetCount) {
    throw new Error('execution plan decision targetIds do not match targetCount');
  }
  const targetIds = new Set();
  payload.targetIds.forEach((targetId) => {
    if (typeof targetId !== 'string' || targetId.length < 3) throw new TypeError('execution plan decision targetId is invalid');
    if (targetIds.has(targetId)) throw new Error(`execution plan decision has duplicate target: ${targetId}`);
    targetIds.add(targetId);
  });

  if (payload.productionFilePath !== null || payload.productionDestinationResolved !== false
    || payload.mappingConfirmedForExecution !== false || payload.finalDestinationConfirmed !== false) {
    throw new Error('execution plan decision cannot confirm or resolve a production destination');
  }
  if (payload.readyForExecution !== false || payload.executionAuthorityGranted !== false) {
    throw new Error('execution plan decision cannot grant execution authority');
  }
  const expectedNextAction = payload.decision === 'approve'
    ? 'separate_manual_execution_authorisation_and_fresh_hash_review'
    : 'none';
  if (payload.nextAction !== expectedNextAction) throw new Error('execution plan decision nextAction is invalid');
  if (payload.decision === 'approve') {
    if (!payload.mappingSummary.allCandidatesPresent) throw new Error('approved execution plan decision requires all candidates present');
    for (const [field, complete] of Object.entries(payload.completedReviews)) {
      if (complete !== true) throw new Error(`approved execution plan decision requires completed ${field}`);
    }
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionPlanDecisionStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionPlanDecisionStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid execution plan decision at line ${index + 1}: ${error.message}`); }
    });
  }

  findByExecutionPlanId(executionPlanId) {
    return this.readRecords().find((record) => record.payload && record.payload.executionPlan
      && record.payload.executionPlan.id === executionPlanId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-plan-decision-key') {
    assertSigningKey(signingKey);
    assertExecutionPlanDecisionPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('execution plan decision signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByExecutionPlanId(payload.executionPlan.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed execution plan decision already exists for plan: ${payload.executionPlan.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_plan_decision_${crypto.randomUUID()}`,
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
      try { assertExecutionPlanDecisionPayload(record.payload); }
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
  EXECUTION_PLAN_DECISION_AUTHORITY,
  EXECUTION_PLAN_DECISION_STATUSES,
  ProductionExecutionPlanDecisionStore,
  assertExecutionPlanDecisionPayload,
};
