'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { assertChangeRequestPayload } = require('./production-change-request-store');
const { assertDecisionPayload } = require('./production-change-decision-store');
const { assertExecutionPlanPayload } = require('./production-execution-plan-store');
const { assertExecutionPlanDecisionPayload } = require('./production-execution-plan-decision-store');
const { assertExecutionAuthorisationRequestPayload } = require('./production-execution-authorisation-request-store');
const { assertExecutionAuthorisationDecisionPayload } = require('./production-execution-authorisation-decision-store');
const { assertExecutionTokenRequestPayload } = require('./production-execution-token-request-store');
const { assertExecutionTokenDecisionPayload } = require('./production-execution-token-decision-store');
const { assertExecutionTokenIssuanceRequestPayload } = require('./production-execution-token-issuance-request-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  EXECUTION_TOKEN_ISSUANCE_DECISION_AUTHORITY,
  EXECUTION_TOKEN_ISSUANCE_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
} = require('./production-execution-token-issuance-decision-store');

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError(`${field} contains control characters`);
  if (text.length < min || text.length > max) throw new TypeError(`${field} must contain ${min}-${max} characters`);
  return text;
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('clock must produce a valid date');
  return date;
}

function normaliseReviews(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('completedReviews must be an object');
  const result = {};
  for (const field of [
    'issuanceRequestWindowReview', 'finalPreflightReview', 'exactScopeReview',
    'backupEvidenceReview', 'restoreEvidenceReview', 'productionOwnerReview',
  ]) {
    if (typeof value[field] !== 'boolean') throw new TypeError(`completedReviews.${field} must be boolean`);
    result[field] = value[field];
  }
  return result;
}

function emptyPreflight() {
  return { required: false, verifiedAt: null, snapshotHash: null, allMatchIssuanceRequest: false, candidates: [] };
}

function emptyScopeReview() {
  return {
    required: false,
    issuanceRequestScopeHash: null,
    recomputedScopeHash: null,
    exactScopeMatch: false,
    operationCount: 0,
    candidateCount: 0,
    operations: [],
  };
}

function findRecord(store, id, label) {
  const record = store.readRecords().find((item) => item.id === id);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}

function decideProductionExecutionTokenIssuance(options = {}) {
  const {
    executionTokenIssuanceRequestId,
    changeRequestStore,
    changeDecisionStore,
    planStore,
    planDecisionStore,
    authorisationRequestStore,
    authorisationDecisionStore,
    tokenRequestStore,
    tokenDecisionStore,
    tokenIssuanceRequestStore,
    tokenIssuanceDecisionStore,
    auditLog,
    repositoryRoot,
  } = options;

  if (typeof executionTokenIssuanceRequestId !== 'string' || !executionTokenIssuanceRequestId.trim()) {
    throw new TypeError('execution token issuance decision requires executionTokenIssuanceRequestId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !tokenRequestStore
    || !tokenDecisionStore || !tokenIssuanceRequestStore || !tokenIssuanceDecisionStore || !auditLog) {
    throw new TypeError('execution token issuance decision requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey', 'planDecisionSigningKey',
    'authorisationRequestSigningKey', 'authorisationDecisionSigningKey', 'tokenRequestSigningKey',
    'tokenDecisionSigningKey', 'tokenIssuanceRequestSigningKey', 'tokenIssuanceDecisionSigningKey',
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
    ['Execution token request', tokenRequestStore.verify(options.tokenRequestSigningKey)],
    ['Execution token decision', tokenDecisionStore.verify(options.tokenDecisionSigningKey)],
    ['Execution token issuance request', tokenIssuanceRequestStore.verify(options.tokenIssuanceRequestSigningKey)],
    ['Execution token issuance decision', tokenIssuanceDecisionStore.verify(options.tokenIssuanceDecisionSigningKey)],
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const issuanceRequest = findRecord(
    tokenIssuanceRequestStore,
    executionTokenIssuanceRequestId.trim(),
    'Execution token issuance request',
  );
  assertExecutionTokenIssuanceRequestPayload(issuanceRequest.payload);

  const existing = tokenIssuanceDecisionStore.findByIssuanceRequestId(issuanceRequest.id);
  if (existing) {
    const sameReviewer = existing.payload.reviewer.name === reviewerName
      && existing.payload.reviewer.role === reviewerRole && existing.payload.reviewer.note === reviewerNote;
    const sameReviews = stableStringify(existing.payload.completedReviews) === stableStringify(completedReviews);
    if (existing.payload.decision !== decision || !sameReviewer || !sameReviews) {
      throw new Error(`A different signed execution token issuance decision already exists for request: ${issuanceRequest.id}`);
    }
    return {
      executionTokenIssuanceDecisionId: existing.id,
      executionTokenIssuanceDecisionRecordHash: existing.recordHash,
      executionTokenIssuanceRequestId: issuanceRequest.id,
      decision,
      tokenIssued: false,
      tokenMaterialIssued: false,
      bearerSecretIssued: false,
      readyForExecution: false,
      executionAuthorityGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const tokenDecision = findRecord(tokenDecisionStore, issuanceRequest.payload.tokenDecision.id, 'Execution token decision');
  assertExecutionTokenDecisionPayload(tokenDecision.payload);
  if (tokenDecision.recordHash !== issuanceRequest.payload.tokenDecision.recordHash
    || tokenDecision.payloadHash !== issuanceRequest.payload.tokenDecision.payloadHash
    || tokenDecision.payload.decision !== 'approve'
    || tokenDecision.payload.status !== 'approved_execution_token_request_record_only'
    || tokenDecision.payload.readyForExecution !== false
    || tokenDecision.payload.executionAuthorityGranted !== false
    || tokenDecision.payload.authorisationGranted !== false
    || tokenDecision.payload.tokenIssued !== false
    || tokenDecision.payload.executionTokenAvailable !== false) {
    throw new Error('Execution token issuance decision requires an approved, non-executing Phase 1.13 decision');
  }

  const tokenRequest = findRecord(tokenRequestStore, issuanceRequest.payload.tokenDecision.tokenRequestId, 'Execution token request');
  assertExecutionTokenRequestPayload(tokenRequest.payload);
  if (tokenRequest.id !== tokenDecision.payload.tokenRequest.id
    || tokenRequest.recordHash !== tokenDecision.payload.tokenRequest.recordHash
    || tokenRequest.payloadHash !== tokenDecision.payload.tokenRequest.payloadHash) {
    throw new Error('Execution token issuance decision token-request binding is invalid');
  }

  const authorisationDecision = findRecord(
    authorisationDecisionStore,
    issuanceRequest.payload.tokenDecision.authorisationDecisionId,
    'Execution authorisation decision',
  );
  assertExecutionAuthorisationDecisionPayload(authorisationDecision.payload);
  if (authorisationDecision.payload.decision !== 'approve'
    || authorisationDecision.payload.executionAuthorityGranted !== false
    || authorisationDecision.payload.authorisationGranted !== false) {
    throw new Error('Execution token issuance decision authorisation decision is invalid');
  }

  const authorisationRequest = findRecord(
    authorisationRequestStore,
    issuanceRequest.payload.tokenDecision.authorisationRequestId,
    'Execution authorisation request',
  );
  assertExecutionAuthorisationRequestPayload(authorisationRequest.payload);

  const planDecision = findRecord(
    planDecisionStore,
    issuanceRequest.payload.tokenDecision.executionPlanDecisionId,
    'Execution plan decision',
  );
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.payload.decision !== 'approve' || planDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution token issuance decision plan decision is invalid');
  }

  const plan = findRecord(planStore, issuanceRequest.payload.tokenDecision.executionPlanId, 'Execution plan');
  assertExecutionPlanPayload(plan.payload);
  if (sha256(stableStringify(plan.payload.targetMappings)) !== issuanceRequest.payload.tokenDecision.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps)) !== issuanceRequest.payload.tokenDecision.executionStepsHash) {
    throw new Error('Execution token issuance decision plan snapshots are invalid');
  }

  const changeDecision = findRecord(
    changeDecisionStore,
    issuanceRequest.payload.tokenDecision.sourceDecisionId,
    'Production change decision',
  );
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve' || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution token issuance decision source decision is invalid');
  }

  const changeRequest = findRecord(
    changeRequestStore,
    issuanceRequest.payload.tokenDecision.changeRequestId,
    'Production change request',
  );
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== issuanceRequest.payload.tokenDecision.applicationId
    || changeRequest.payload.application.fingerprint !== issuanceRequest.payload.tokenDecision.applicationFingerprint) {
    throw new Error('Execution token issuance decision application binding is invalid');
  }

  const validFromMs = Date.parse(issuanceRequest.payload.validity.validFrom);
  const expiresAtMs = Date.parse(issuanceRequest.payload.validity.expiresAt);
  const tokenRequestExpiresAtMs = Date.parse(issuanceRequest.payload.validity.tokenRequestExpiresAt);
  const upstreamExpiresAtMs = Date.parse(issuanceRequest.payload.validity.upstreamExpiresAt);
  const nowMs = now.getTime();
  const activeAtDecision = nowMs >= validFromMs && nowMs < expiresAtMs;
  const withinTokenRequestWindow = nowMs < tokenRequestExpiresAtMs && expiresAtMs <= tokenRequestExpiresAtMs;
  const withinUpstreamWindow = nowMs < upstreamExpiresAtMs && expiresAtMs <= upstreamExpiresAtMs;
  const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));

  if (decision === 'approve') {
    if (!activeAtDecision || !withinTokenRequestWindow || !withinUpstreamWindow
      || remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`Approval requires an active issuance request with at least ${MIN_REMAINING_SECONDS} seconds remaining`);
    }
    for (const [field, complete] of Object.entries(completedReviews)) {
      if (complete !== true) throw new Error(`Approval requires completed ${field}`);
    }
  }

  let finalPreflight = emptyPreflight();
  let scopeReview = emptyScopeReview();
  if (decision === 'approve') {
    const requestCandidates = issuanceRequest.payload.lastMomentPreflight.candidates.slice()
      .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
    const preflightCandidates = requestCandidates.map((candidate) => {
      const current = inspectCandidate(
        repositoryRoot,
        candidate.proposedRepositoryPath,
        [],
        plan.payload.repositorySnapshot.maxFileBytes,
      );
      if (!current.exists || current.currentSha256 !== candidate.currentSha256
        || current.currentBytes !== candidate.currentBytes) {
        throw new Error(`Final issuance-decision preflight hash does not match the signed request: ${candidate.proposedRepositoryPath}`);
      }
      return {
        proposedRepositoryPath: candidate.proposedRepositoryPath,
        currentSha256: current.currentSha256,
        currentBytes: current.currentBytes,
        issuanceRequestSha256: candidate.currentSha256,
        issuanceRequestBytes: candidate.currentBytes,
        matchIssuanceRequest: true,
        writeAllowed: false,
      };
    });
    finalPreflight = {
      required: true,
      verifiedAt: now.toISOString(),
      snapshotHash: sha256(stableStringify(preflightCandidates)),
      allMatchIssuanceRequest: true,
      candidates: preflightCandidates,
    };

    const preflightByPath = new Map(preflightCandidates.map((candidate) => [candidate.proposedRepositoryPath, candidate]));
    const expectedOperations = plan.payload.executionPlan.steps.map((step, index) => ({
      sequence: index + 1,
      targetId: step.targetId,
      operation: step.action,
      candidatePaths: [...step.candidatePaths],
      candidateHashes: step.candidatePaths.map((candidatePath) => {
        const candidate = preflightByPath.get(candidatePath);
        if (!candidate) throw new Error(`Execution token issuance decision scope references an unauthorised candidate: ${candidatePath}`);
        return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
      }),
      executionAllowed: false,
      productionWriteAllowed: false,
    }));
    const expectedTargetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId);
    const recomputedScopeHash = sha256(stableStringify({ targetIds: expectedTargetIds, operations: expectedOperations }));
    if (stableStringify(issuanceRequest.payload.scope.targetIds) !== stableStringify(expectedTargetIds)
      || stableStringify(issuanceRequest.payload.scope.operations) !== stableStringify(expectedOperations)
      || issuanceRequest.payload.scope.recomputedScopeHash !== recomputedScopeHash
      || issuanceRequest.payload.scope.tokenRequestScopeHash !== recomputedScopeHash
      || issuanceRequest.payload.scope.tokenDecisionScopeHash !== recomputedScopeHash) {
      throw new Error('Execution token issuance decision scope does not exactly match the signed plan and request');
    }
    scopeReview = {
      required: true,
      issuanceRequestScopeHash: issuanceRequest.payload.scope.recomputedScopeHash,
      recomputedScopeHash,
      exactScopeMatch: true,
      operationCount: expectedOperations.length,
      candidateCount: preflightCandidates.length,
      operations: expectedOperations,
    };
  }

  const targetIds = [...issuanceRequest.payload.scope.targetIds];
  const payload = {
    schemaVersion: 1,
    decisionType: 'human_single_use_execution_token_issuance_request_decision',
    mode: 'token_issuance_decision_record_only',
    authority: EXECUTION_TOKEN_ISSUANCE_DECISION_AUTHORITY,
    status: decision === 'approve'
      ? EXECUTION_TOKEN_ISSUANCE_DECISION_STATUSES.APPROVED
      : EXECUTION_TOKEN_ISSUANCE_DECISION_STATUSES.REJECTED,
    decision,
    issuanceRequest: {
      id: issuanceRequest.id,
      recordHash: issuanceRequest.recordHash,
      payloadHash: issuanceRequest.payloadHash,
      tokenDecisionId: tokenDecision.id,
      tokenRequestId: tokenRequest.id,
      authorisationDecisionId: authorisationDecision.id,
      authorisationRequestId: authorisationRequest.id,
      executionPlanDecisionId: planDecision.id,
      executionPlanId: plan.id,
      sourceDecisionId: changeDecision.id,
      changeRequestId: changeRequest.id,
      applicationId: changeRequest.payload.application.id,
      applicationFingerprint: changeRequest.payload.application.fingerprint,
      requestScopeHash: issuanceRequest.payload.tokenDecision.requestScopeHash,
      decisionScopeHash: issuanceRequest.payload.tokenDecision.decisionScopeHash,
      issuanceScopeHash: issuanceRequest.payload.scope.recomputedScopeHash,
      requestFinalSnapshotHash: issuanceRequest.payload.tokenDecision.requestFinalSnapshotHash,
      decisionPreflightSnapshotHash: issuanceRequest.payload.tokenDecision.decisionPreflightSnapshotHash,
      issuancePreflightSnapshotHash: issuanceRequest.payload.lastMomentPreflight.snapshotHash,
      candidateSnapshotHash: issuanceRequest.payload.tokenDecision.candidateSnapshotHash,
      executionStepsHash: issuanceRequest.payload.tokenDecision.executionStepsHash,
      backupManifestHash: issuanceRequest.payload.tokenDecision.backupManifestHash,
      restoreManifestHash: issuanceRequest.payload.tokenDecision.restoreManifestHash,
    },
    reviewer: { name: reviewerName, role: reviewerRole, note: reviewerNote },
    completedReviews,
    validityReview: {
      decisionAt: now.toISOString(),
      requestValidFrom: issuanceRequest.payload.validity.validFrom,
      requestExpiresAt: issuanceRequest.payload.validity.expiresAt,
      tokenRequestExpiresAt: issuanceRequest.payload.validity.tokenRequestExpiresAt,
      upstreamExpiresAt: issuanceRequest.payload.validity.upstreamExpiresAt,
      activeAtDecision,
      withinTokenRequestWindow,
      withinUpstreamWindow,
      remainingSeconds,
    },
    finalPreflight,
    scopeReview,
    issuanceState: {
      issuanceRequested: true,
      tokenMaterialIssued: false,
      tokenDigest: null,
      tokenId: null,
      bearerSecretIssued: false,
      credentialIssued: false,
      consumed: false,
      useCount: 0,
      maxUses: 1,
      tokenIssued: false,
      executionTokenAvailable: false,
    },
    targetIds,
    productionFilePath: null,
    productionDestinationResolved: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    tokenIssued: false,
    executionTokenAvailable: false,
    nextAction: decision === 'approve'
      ? 'separate_token_material_generation_request_and_execution_firebreak'
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

  const appended = tokenIssuanceDecisionStore.appendSigned(
    payload,
    options.tokenIssuanceDecisionSigningKey,
    options.tokenIssuanceDecisionSigningKeyId || 'production-execution-token-issuance-decision-key',
  );
  auditLog.append('production_execution_token_issuance_human_decision_signed', {
    executionTokenIssuanceRequestId: issuanceRequest.id,
    executionTokenIssuanceRequestRecordHash: issuanceRequest.recordHash,
    executionTokenIssuanceDecisionId: appended.record.id,
    executionTokenIssuanceDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    targetCount: targetIds.length,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    tokenIssued: false,
    tokenMaterialIssued: false,
    bearerSecretIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, reviewerName);

  return {
    executionTokenIssuanceDecisionId: appended.record.id,
    executionTokenIssuanceDecisionRecordHash: appended.record.recordHash,
    executionTokenIssuanceRequestId: issuanceRequest.id,
    decision,
    targetCount: targetIds.length,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    tokenIssued: false,
    tokenMaterialIssued: false,
    bearerSecretIssued: false,
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

module.exports = { decideProductionExecutionTokenIssuance };
