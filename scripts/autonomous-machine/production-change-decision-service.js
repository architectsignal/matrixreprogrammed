'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { assertChangeRequestPayload } = require('./production-change-request-store');
const {
  CHANGE_DECISION_AUTHORITY,
  CHANGE_DECISION_STATUSES,
} = require('./production-change-decision-store');

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError(`${field} contains control characters`);
  if (text.length < min || text.length > max) throw new TypeError(`${field} must contain ${min}-${max} characters`);
  return text;
}

function normaliseApprovals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('completedApprovals must be an object');
  const result = {};
  for (const field of ['evidenceReview', 'editorialReview', 'legalReview', 'productionOwnerApproval']) {
    if (typeof value[field] !== 'boolean') throw new TypeError(`completedApprovals.${field} must be boolean`);
    result[field] = value[field];
  }
  return result;
}

function decideProductionChangeRequest(options = {}) {
  const { changeRequestId, requestStore, decisionStore, auditLog } = options;
  if (typeof changeRequestId !== 'string' || !changeRequestId.trim()) throw new TypeError('production change decision requires changeRequestId');
  if (!requestStore || !decisionStore || !auditLog) throw new TypeError('production change decision requires requestStore, decisionStore and auditLog');
  assertSigningKey(options.requestSigningKey);
  assertSigningKey(options.decisionSigningKey);
  const decision = options.decision;
  if (!['approve', 'reject'].includes(decision)) throw new TypeError('decision must be approve or reject');
  const reviewerName = assertText(options.reviewerName, 'reviewerName', 3, 120);
  const reviewerRole = assertText(options.reviewerRole, 'reviewerRole', 3, 120);
  const reviewerNote = assertText(options.reviewerNote, 'reviewerNote', 10, 2000);
  const completedApprovals = normaliseApprovals(options.completedApprovals);

  const requestIntegrity = requestStore.verify(options.requestSigningKey);
  if (!requestIntegrity.valid) throw new Error(`Production change request ledger verification failed: ${requestIntegrity.reason}`);
  const decisionIntegrity = decisionStore.verify(options.decisionSigningKey);
  if (!decisionIntegrity.valid) throw new Error(`Production change decision ledger verification failed: ${decisionIntegrity.reason}`);
  const request = requestStore.readRecords().find((record) => record.id === changeRequestId.trim());
  if (!request) throw new Error(`Production change request not found: ${changeRequestId}`);
  assertChangeRequestPayload(request.payload);

  const required = request.payload.requiredApprovals;
  if (decision === 'approve') {
    for (const field of ['evidenceReview', 'editorialReview', 'productionOwnerApproval']) {
      if (required[field] === true && completedApprovals[field] !== true) {
        throw new Error(`Approval requires completed ${field}`);
      }
    }
    if (required.legalReview === true && completedApprovals.legalReview !== true) {
      throw new Error('Approval requires completed legalReview');
    }
  }

  const targetIds = request.payload.changes.map((change) => change.targetId).sort();
  const payload = {
    schemaVersion: 1,
    decisionType: 'human_production_change_request_decision',
    mode: 'decision_record_only',
    authority: CHANGE_DECISION_AUTHORITY,
    status: decision === 'approve' ? CHANGE_DECISION_STATUSES.APPROVED : CHANGE_DECISION_STATUSES.REJECTED,
    decision,
    changeRequest: {
      id: request.id,
      recordHash: request.recordHash,
      payloadHash: request.payloadHash,
      applicationId: request.payload.application.id,
      applicationFingerprint: request.payload.application.fingerprint,
    },
    reviewer: {
      name: reviewerName,
      role: reviewerRole,
      note: reviewerNote,
    },
    completedApprovals,
    targetIds,
    productionFilePath: null,
    productionDestinationResolved: false,
    executionAuthorityGranted: false,
    nextAction: decision === 'approve' ? 'separate_manual_production_execution_review' : 'none',
    safety: {
      productionTarget: null,
      productionWriteAllowed: false,
      executionAllowed: false,
      commitAllowed: false,
      deploymentAllowed: false,
      publicationAllowed: false,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    },
  };

  const appended = decisionStore.appendSigned(
    payload,
    options.decisionSigningKey,
    options.decisionSigningKeyId || 'production-change-decision-key',
  );
  auditLog.append('production_change_request_human_decision_signed', {
    changeRequestId: request.id,
    changeRequestRecordHash: request.recordHash,
    changeDecisionId: appended.record.id,
    changeDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    targetCount: targetIds.length,
    deduplicated: appended.idempotent,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, reviewerName);
  return {
    changeDecisionId: appended.record.id,
    changeDecisionRecordHash: appended.record.recordHash,
    changeRequestId: request.id,
    decision,
    targetCount: targetIds.length,
    executionAuthorityGranted: false,
    idempotent: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = { decideProductionChangeRequest, normaliseApprovals };
