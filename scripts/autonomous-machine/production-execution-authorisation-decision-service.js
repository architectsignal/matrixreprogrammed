'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { assertChangeRequestPayload } = require('./production-change-request-store');
const { assertDecisionPayload } = require('./production-change-decision-store');
const { assertExecutionPlanPayload } = require('./production-execution-plan-store');
const { assertExecutionPlanDecisionPayload } = require('./production-execution-plan-decision-store');
const { assertExecutionAuthorisationRequestPayload } = require('./production-execution-authorisation-request-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  EXECUTION_AUTHORISATION_DECISION_AUTHORITY,
  EXECUTION_AUTHORISATION_DECISION_STATUSES,
} = require('./production-execution-authorisation-decision-store');
const {
  MIN_REMAINING_SECONDS,
  assertText,
  asDate,
  normaliseReviews,
  verifyExternalBackups,
  runDisposableRestoreRehearsal,
  emptyFreshRecheck,
  emptyBackupVerification,
  emptyRestoreRehearsal,
} = require('./production-execution-authorisation-decision-helpers');

function decideProductionExecutionAuthorisation(options = {}) {
  const {
    executionAuthorisationRequestId,
    changeRequestStore,
    changeDecisionStore,
    planStore,
    planDecisionStore,
    authorisationRequestStore,
    authorisationDecisionStore,
    auditLog,
    repositoryRoot,
  } = options;
  if (typeof executionAuthorisationRequestId !== 'string' || !executionAuthorisationRequestId.trim()) {
    throw new TypeError('execution authorisation decision requires executionAuthorisationRequestId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !auditLog) {
    throw new TypeError('execution authorisation decision requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey', 'planDecisionSigningKey',
    'authorisationRequestSigningKey', 'authorisationDecisionSigningKey',
  ]) assertSigningKey(options[key]);

  const decision = options.decision;
  if (!['approve', 'reject'].includes(decision)) throw new TypeError('decision must be approve or reject');
  const reviewerName = assertText(options.reviewerName, 'reviewerName', 3, 120);
  const reviewerRole = assertText(options.reviewerRole, 'reviewerRole', 3, 120);
  const reviewerNote = assertText(options.reviewerNote, 'reviewerNote', 10, 2000);
  const completedReviews = normaliseReviews(options.completedReviews);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const now = asDate(clock());

  const integrityChecks = [
    ['Production change request', changeRequestStore.verify(options.changeRequestSigningKey)],
    ['Production change decision', changeDecisionStore.verify(options.changeDecisionSigningKey)],
    ['Production execution plan', planStore.verify(options.planSigningKey)],
    ['Production execution plan decision', planDecisionStore.verify(options.planDecisionSigningKey)],
    ['Execution authorisation request', authorisationRequestStore.verify(options.authorisationRequestSigningKey)],
    ['Execution authorisation decision', authorisationDecisionStore.verify(options.authorisationDecisionSigningKey)],
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const request = authorisationRequestStore.readRecords().find((record) => record.id === executionAuthorisationRequestId.trim());
  if (!request) throw new Error(`Execution authorisation request not found: ${executionAuthorisationRequestId}`);
  assertExecutionAuthorisationRequestPayload(request.payload);

  const existing = authorisationDecisionStore.findByAuthorisationRequestId(request.id);
  if (existing) {
    const sameReviewer = existing.payload.reviewer.name === reviewerName
      && existing.payload.reviewer.role === reviewerRole && existing.payload.reviewer.note === reviewerNote;
    const sameReviews = stableStringify(existing.payload.completedReviews) === stableStringify(completedReviews);
    if (existing.payload.decision !== decision || !sameReviewer || !sameReviews) {
      throw new Error(`A different signed execution authorisation decision already exists for request: ${request.id}`);
    }
    return {
      executionAuthorisationDecisionId: existing.id,
      executionAuthorisationDecisionRecordHash: existing.recordHash,
      executionAuthorisationRequestId: request.id,
      decision,
      readyForExecution: false,
      executionAuthorityGranted: false,
      authorisationGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const planDecision = planDecisionStore.readRecords().find((record) => record.id === request.payload.executionPlanDecision.id);
  if (!planDecision) throw new Error(`Execution plan decision not found for request: ${request.payload.executionPlanDecision.id}`);
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.recordHash !== request.payload.executionPlanDecision.recordHash
    || planDecision.payloadHash !== request.payload.executionPlanDecision.payloadHash
    || planDecision.payload.decision !== 'approve' || planDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution authorisation request does not match an approved Phase 1.9 decision');
  }

  const plan = planStore.readRecords().find((record) => record.id === request.payload.executionPlanDecision.executionPlanId);
  if (!plan) throw new Error(`Execution plan not found for request: ${request.payload.executionPlanDecision.executionPlanId}`);
  assertExecutionPlanPayload(plan.payload);
  if (plan.recordHash !== request.payload.executionPlanDecision.executionPlanRecordHash
    || plan.payloadHash !== request.payload.executionPlanDecision.executionPlanPayloadHash
    || sha256(stableStringify(plan.payload.targetMappings)) !== request.payload.executionPlanDecision.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps)) !== request.payload.executionPlanDecision.executionStepsHash) {
    throw new Error('Execution authorisation request plan binding is invalid');
  }

  const changeDecision = changeDecisionStore.readRecords().find((record) => record.id === request.payload.executionPlanDecision.sourceDecisionId);
  if (!changeDecision) throw new Error(`Production change decision not found for request: ${request.payload.executionPlanDecision.sourceDecisionId}`);
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve' || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution authorisation request source decision is invalid');
  }

  const changeRequest = changeRequestStore.readRecords().find((record) => record.id === request.payload.executionPlanDecision.changeRequestId);
  if (!changeRequest) throw new Error(`Production change request not found for authorisation request: ${request.payload.executionPlanDecision.changeRequestId}`);
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== request.payload.executionPlanDecision.applicationId
    || changeRequest.payload.application.fingerprint !== request.payload.executionPlanDecision.applicationFingerprint) {
    throw new Error('Execution authorisation request application binding is invalid');
  }

  const requestValidFrom = Date.parse(request.payload.validity.validFrom);
  const requestExpiresAt = Date.parse(request.payload.validity.expiresAt);
  const requestSnapshotAt = Date.parse(request.payload.freshSnapshot.verifiedAt);
  const nowMs = now.getTime();
  const activeAtDecision = nowMs >= requestValidFrom && nowMs < requestExpiresAt;
  const remainingSeconds = Math.max(0, Math.floor((requestExpiresAt - nowMs) / 1000));
  const requestSnapshotAgeSeconds = Math.max(0, Math.floor((nowMs - requestSnapshotAt) / 1000));
  const requestSnapshotWithinMaxAge = nowMs >= requestSnapshotAt
    && requestSnapshotAgeSeconds <= request.payload.freshSnapshot.maxAgeSeconds;

  if (decision === 'approve') {
    if (!activeAtDecision || remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`Approval requires an active request with at least ${MIN_REMAINING_SECONDS} seconds remaining`);
    }
    if (!requestSnapshotWithinMaxAge) throw new Error('Approval requires the Phase 1.10 request snapshot to remain within its maximum age');
    for (const [field, complete] of Object.entries(completedReviews)) {
      if (complete !== true) throw new Error(`Approval requires completed ${field}`);
    }
  }

  let freshRecheck = emptyFreshRecheck();
  let backupVerification = emptyBackupVerification();
  let restoreRehearsal = emptyRestoreRehearsal();

  if (decision === 'approve') {
    const requestCandidates = request.payload.freshSnapshot.candidates.slice()
      .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
    const freshCandidates = requestCandidates.map((candidate) => {
      const fresh = inspectCandidate(
        repositoryRoot,
        candidate.proposedRepositoryPath,
        candidate.roles,
        plan.payload.repositorySnapshot.maxFileBytes,
      );
      if (!fresh.exists || fresh.currentSha256 !== candidate.currentSha256 || fresh.currentBytes !== candidate.currentBytes) {
        throw new Error(`Final fresh hash does not match the Phase 1.10 request: ${candidate.proposedRepositoryPath}`);
      }
      return {
        proposedRepositoryPath: candidate.proposedRepositoryPath,
        currentSha256: fresh.currentSha256,
        currentBytes: fresh.currentBytes,
        requestSha256: candidate.currentSha256,
        requestBytes: candidate.currentBytes,
        matchRequest: true,
        writeAllowed: false,
      };
    });
    freshRecheck = {
      required: true,
      verifiedAt: now.toISOString(),
      snapshotHash: sha256(stableStringify(freshCandidates)),
      allMatchRequest: true,
      candidates: freshCandidates,
    };

    const verifiedBackups = verifyExternalBackups(repositoryRoot, options.backupRoot, options.backupEntries, freshCandidates);
    const publicBackupEntries = verifiedBackups.entries.map(({ resolvedBackupPath, ...entry }) => entry);
    backupVerification = {
      required: true,
      rootLabel: 'external_backup_root',
      rootOutsideRepository: true,
      manifestHash: sha256(stableStringify(publicBackupEntries)),
      allVerified: publicBackupEntries.every((entry) => entry.verified),
      entries: publicBackupEntries,
    };
    restoreRehearsal = runDisposableRestoreRehearsal(
      repositoryRoot,
      options.restoreRehearsalRoot,
      verifiedBackups.entries,
    );
  }

  const targetIds = [...request.payload.targetIds].sort();
  const payload = {
    schemaVersion: 1,
    decisionType: 'human_execution_authorisation_request_decision',
    mode: 'authorisation_decision_record_only',
    authority: EXECUTION_AUTHORISATION_DECISION_AUTHORITY,
    status: decision === 'approve'
      ? EXECUTION_AUTHORISATION_DECISION_STATUSES.APPROVED
      : EXECUTION_AUTHORISATION_DECISION_STATUSES.REJECTED,
    decision,
    authorisationRequest: {
      id: request.id,
      recordHash: request.recordHash,
      payloadHash: request.payloadHash,
      executionPlanDecisionId: planDecision.id,
      executionPlanId: plan.id,
      sourceDecisionId: changeDecision.id,
      changeRequestId: changeRequest.id,
      applicationId: changeRequest.payload.application.id,
      applicationFingerprint: changeRequest.payload.application.fingerprint,
      candidateSnapshotHash: request.payload.executionPlanDecision.candidateSnapshotHash,
      executionStepsHash: request.payload.executionPlanDecision.executionStepsHash,
      requestFreshSnapshotHash: request.payload.freshSnapshot.snapshotHash,
      rollbackManifestHash: request.payload.rollbackPackage.manifestHash,
    },
    reviewer: { name: reviewerName, role: reviewerRole, note: reviewerNote },
    completedReviews,
    validityReview: {
      decisionAt: now.toISOString(),
      requestValidFrom: request.payload.validity.validFrom,
      requestExpiresAt: request.payload.validity.expiresAt,
      activeAtDecision,
      remainingSeconds,
      requestSnapshotAgeSeconds,
      requestSnapshotWithinMaxAge,
    },
    freshRecheck,
    backupVerification,
    restoreRehearsal,
    targetIds,
    productionFilePath: null,
    productionDestinationResolved: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    nextAction: decision === 'approve'
      ? 'separate_single_use_execution_token_review_and_final_hash_check'
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

  const appended = authorisationDecisionStore.appendSigned(
    payload,
    options.authorisationDecisionSigningKey,
    options.authorisationDecisionSigningKeyId || 'production-execution-authorisation-decision-key',
  );
  auditLog.append('production_execution_authorisation_human_decision_signed', {
    executionAuthorisationRequestId: request.id,
    executionAuthorisationRequestRecordHash: request.recordHash,
    executionAuthorisationDecisionId: appended.record.id,
    executionAuthorisationDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    targetCount: targetIds.length,
    backupCount: backupVerification.entries.length,
    restoreRehearsalFiles: restoreRehearsal.filesRestored,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, reviewerName);

  return {
    executionAuthorisationDecisionId: appended.record.id,
    executionAuthorisationDecisionRecordHash: appended.record.recordHash,
    executionAuthorisationRequestId: request.id,
    decision,
    targetCount: targetIds.length,
    backupCount: backupVerification.entries.length,
    restoreRehearsalFiles: restoreRehearsal.filesRestored,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    idempotent: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = { decideProductionExecutionAuthorisation };
