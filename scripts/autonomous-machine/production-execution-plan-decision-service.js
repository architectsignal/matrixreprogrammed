'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { stableStringify, sha256 } = require('./route-registry');
const { assertChangeRequestPayload } = require('./production-change-request-store');
const { assertDecisionPayload } = require('./production-change-decision-store');
const { assertExecutionPlanPayload } = require('./production-execution-plan-store');
const {
  EXECUTION_PLAN_DECISION_AUTHORITY,
  EXECUTION_PLAN_DECISION_STATUSES,
} = require('./production-execution-plan-decision-store');

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError(`${field} contains control characters`);
  if (text.length < min || text.length > max) throw new TypeError(`${field} must contain ${min}-${max} characters`);
  return text;
}

function normaliseReviews(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('completedReviews must be an object');
  const result = {};
  for (const field of ['targetMappingReview', 'fileSnapshotReview', 'rollbackPlanReview', 'validationPlanReview', 'productionOwnerReview']) {
    if (typeof value[field] !== 'boolean') throw new TypeError(`completedReviews.${field} must be boolean`);
    result[field] = value[field];
  }
  return result;
}

function decideProductionExecutionPlan(options = {}) {
  const { executionPlanId, requestStore, changeDecisionStore, planStore, planDecisionStore, auditLog } = options;
  if (typeof executionPlanId !== 'string' || !executionPlanId.trim()) throw new TypeError('execution plan decision requires executionPlanId');
  if (!requestStore || !changeDecisionStore || !planStore || !planDecisionStore || !auditLog) {
    throw new TypeError('execution plan decision requires requestStore, changeDecisionStore, planStore, planDecisionStore and auditLog');
  }
  assertSigningKey(options.requestSigningKey);
  assertSigningKey(options.changeDecisionSigningKey);
  assertSigningKey(options.planSigningKey);
  assertSigningKey(options.planDecisionSigningKey);
  const decision = options.decision;
  if (!['approve', 'reject'].includes(decision)) throw new TypeError('decision must be approve or reject');
  const reviewerName = assertText(options.reviewerName, 'reviewerName', 3, 120);
  const reviewerRole = assertText(options.reviewerRole, 'reviewerRole', 3, 120);
  const reviewerNote = assertText(options.reviewerNote, 'reviewerNote', 10, 2000);
  const completedReviews = normaliseReviews(options.completedReviews);

  const requestIntegrity = requestStore.verify(options.requestSigningKey);
  if (!requestIntegrity.valid) throw new Error(`Production change request ledger verification failed: ${requestIntegrity.reason}`);
  const changeDecisionIntegrity = changeDecisionStore.verify(options.changeDecisionSigningKey);
  if (!changeDecisionIntegrity.valid) throw new Error(`Production change decision ledger verification failed: ${changeDecisionIntegrity.reason}`);
  const planIntegrity = planStore.verify(options.planSigningKey);
  if (!planIntegrity.valid) throw new Error(`Production execution plan ledger verification failed: ${planIntegrity.reason}`);
  const planDecisionIntegrity = planDecisionStore.verify(options.planDecisionSigningKey);
  if (!planDecisionIntegrity.valid) throw new Error(`Execution plan decision ledger verification failed: ${planDecisionIntegrity.reason}`);

  const plan = planStore.readRecords().find((record) => record.id === executionPlanId.trim());
  if (!plan) throw new Error(`Production execution plan not found: ${executionPlanId}`);
  assertExecutionPlanPayload(plan.payload);
  if (plan.payload.authority !== 'preview_only_no_execution_authority'
    || plan.payload.status !== 'pending_manual_execution_plan_review'
    || plan.payload.executionPlan.readyForExecution !== false) {
    throw new Error('Execution plan is not a review-only Phase 1.8 plan');
  }

  const changeDecision = changeDecisionStore.readRecords().find((record) => record.id === plan.payload.decision.id);
  if (!changeDecision) throw new Error(`Production change decision not found for plan: ${plan.payload.decision.id}`);
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.recordHash !== plan.payload.decision.recordHash
    || changeDecision.payloadHash !== plan.payload.decision.payloadHash) {
    throw new Error('Execution plan decision hashes do not match the signed Phase 1.7 decision');
  }
  if (changeDecision.payload.decision !== 'approve'
    || changeDecision.payload.status !== 'approved_authorisation_record_only'
    || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution plan review requires an approved non-executing Phase 1.7 decision');
  }

  const request = requestStore.readRecords().find((record) => record.id === plan.payload.changeRequest.id);
  if (!request) throw new Error(`Production change request not found for plan: ${plan.payload.changeRequest.id}`);
  assertChangeRequestPayload(request.payload);
  if (request.recordHash !== plan.payload.changeRequest.recordHash
    || request.payloadHash !== plan.payload.changeRequest.payloadHash) {
    throw new Error('Execution plan request hashes do not match the signed plan');
  }
  if (changeDecision.payload.changeRequest.id !== request.id
    || changeDecision.payload.changeRequest.applicationId !== request.payload.application.id
    || changeDecision.payload.changeRequest.applicationFingerprint !== request.payload.application.fingerprint) {
    throw new Error('Execution plan Phase 1.7 decision binding does not match the signed request');
  }
  if (request.payload.application.id !== plan.payload.changeRequest.applicationId
    || request.payload.application.fingerprint !== plan.payload.changeRequest.applicationFingerprint) {
    throw new Error('Execution plan application binding does not match the signed request');
  }

  const targetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId).sort();
  const requestTargetIds = request.payload.changes.map((change) => change.targetId).sort();
  if (stableStringify(targetIds) !== stableStringify(requestTargetIds)) {
    throw new Error('Execution plan targets do not match the signed request');
  }
  const candidates = plan.payload.targetMappings.flatMap((mapping) => mapping.candidates);
  const candidateCount = candidates.length;
  const existingCandidateCount = candidates.filter((candidate) => candidate.exists).length;
  const missingCandidateCount = candidates.filter((candidate) => !candidate.exists).length;
  if (existingCandidateCount !== plan.payload.repositorySnapshot.existingCandidateCount
    || missingCandidateCount !== plan.payload.repositorySnapshot.missingCandidateCount) {
    throw new Error('Execution plan candidate counts changed after signing');
  }
  const candidateSnapshotHash = sha256(stableStringify(plan.payload.targetMappings));
  const executionStepsHash = sha256(stableStringify(plan.payload.executionPlan.steps));

  if (decision === 'approve') {
    if (missingCandidateCount !== 0) throw new Error('Approval requires every candidate path to exist for manual review');
    for (const [field, complete] of Object.entries(completedReviews)) {
      if (complete !== true) throw new Error(`Approval requires completed ${field}`);
    }
  }

  const payload = {
    schemaVersion: 1,
    decisionType: 'human_production_execution_plan_decision',
    mode: 'execution_plan_decision_record_only',
    authority: EXECUTION_PLAN_DECISION_AUTHORITY,
    status: decision === 'approve'
      ? EXECUTION_PLAN_DECISION_STATUSES.APPROVED
      : EXECUTION_PLAN_DECISION_STATUSES.REJECTED,
    decision,
    executionPlan: {
      id: plan.id,
      recordHash: plan.recordHash,
      payloadHash: plan.payloadHash,
      sourceDecisionId: changeDecision.id,
      changeRequestId: request.id,
      applicationId: request.payload.application.id,
      applicationFingerprint: request.payload.application.fingerprint,
      candidateSnapshotHash,
      executionStepsHash,
    },
    reviewer: {
      name: reviewerName,
      role: reviewerRole,
      note: reviewerNote,
    },
    completedReviews,
    mappingSummary: {
      targetCount: targetIds.length,
      candidateCount,
      existingCandidateCount,
      missingCandidateCount,
      allCandidatesPresent: missingCandidateCount === 0,
    },
    targetIds,
    productionFilePath: null,
    productionDestinationResolved: false,
    mappingConfirmedForExecution: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    nextAction: decision === 'approve'
      ? 'separate_manual_execution_authorisation_and_fresh_hash_review'
      : 'none',
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

  const appended = planDecisionStore.appendSigned(
    payload,
    options.planDecisionSigningKey,
    options.planDecisionSigningKeyId || 'production-execution-plan-decision-key',
  );
  auditLog.append('production_execution_plan_human_decision_signed', {
    executionPlanId: plan.id,
    executionPlanRecordHash: plan.recordHash,
    executionPlanDecisionId: appended.record.id,
    executionPlanDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    targetCount: targetIds.length,
    candidateCount,
    existingCandidateCount,
    missingCandidateCount,
    deduplicated: appended.idempotent,
    readyForExecution: false,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, reviewerName);

  return {
    executionPlanDecisionId: appended.record.id,
    executionPlanDecisionRecordHash: appended.record.recordHash,
    executionPlanId: plan.id,
    decision,
    targetCount: targetIds.length,
    candidateCount,
    existingCandidateCount,
    missingCandidateCount,
    readyForExecution: false,
    executionAuthorityGranted: false,
    idempotent: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = { decideProductionExecutionPlan, normaliseReviews };
