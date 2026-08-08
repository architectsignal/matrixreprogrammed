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
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  EXECUTION_TOKEN_DECISION_AUTHORITY,
  EXECUTION_TOKEN_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
} = require('./production-execution-token-decision-store');

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
    'tokenRequestWindowReview', 'finalPreflightReview', 'scopeReview',
    'backupEvidenceReview', 'restoreEvidenceReview', 'productionOwnerReview',
  ]) {
    if (typeof value[field] !== 'boolean') throw new TypeError(`completedReviews.${field} must be boolean`);
    result[field] = value[field];
  }
  return result;
}

function emptyPreflight() {
  return { required: false, verifiedAt: null, snapshotHash: null, allMatchRequest: false, candidates: [] };
}

function emptyScopeReview() {
  return {
    required: false,
    requestScopeHash: null,
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

function decideProductionExecutionToken(options = {}) {
  const {
    executionTokenRequestId,
    changeRequestStore,
    changeDecisionStore,
    planStore,
    planDecisionStore,
    authorisationRequestStore,
    authorisationDecisionStore,
    tokenRequestStore,
    tokenDecisionStore,
    auditLog,
    repositoryRoot,
  } = options;
  if (typeof executionTokenRequestId !== 'string' || !executionTokenRequestId.trim()) {
    throw new TypeError('execution token decision requires executionTokenRequestId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !tokenRequestStore
    || !tokenDecisionStore || !auditLog) {
    throw new TypeError('execution token decision requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey', 'planDecisionSigningKey',
    'authorisationRequestSigningKey', 'authorisationDecisionSigningKey', 'tokenRequestSigningKey',
    'tokenDecisionSigningKey',
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
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const tokenRequest = findRecord(tokenRequestStore, executionTokenRequestId.trim(), 'Execution token request');
  assertExecutionTokenRequestPayload(tokenRequest.payload);

  const existing = tokenDecisionStore.findByTokenRequestId(tokenRequest.id);
  if (existing) {
    const sameReviewer = existing.payload.reviewer.name === reviewerName
      && existing.payload.reviewer.role === reviewerRole && existing.payload.reviewer.note === reviewerNote;
    const sameReviews = stableStringify(existing.payload.completedReviews) === stableStringify(completedReviews);
    if (existing.payload.decision !== decision || !sameReviewer || !sameReviews) {
      throw new Error(`A different signed execution token decision already exists for request: ${tokenRequest.id}`);
    }
    return {
      executionTokenDecisionId: existing.id,
      executionTokenDecisionRecordHash: existing.recordHash,
      executionTokenRequestId: tokenRequest.id,
      decision,
      tokenIssued: false,
      readyForExecution: false,
      executionAuthorityGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const authorisationDecision = findRecord(
    authorisationDecisionStore,
    tokenRequest.payload.authorisationDecision.id,
    'Execution authorisation decision',
  );
  assertExecutionAuthorisationDecisionPayload(authorisationDecision.payload);
  if (authorisationDecision.recordHash !== tokenRequest.payload.authorisationDecision.recordHash
    || authorisationDecision.payloadHash !== tokenRequest.payload.authorisationDecision.payloadHash
    || authorisationDecision.payload.decision !== 'approve'
    || authorisationDecision.payload.status !== 'approved_execution_authorisation_record_only'
    || authorisationDecision.payload.readyForExecution !== false
    || authorisationDecision.payload.executionAuthorityGranted !== false
    || authorisationDecision.payload.authorisationGranted !== false) {
    throw new Error('Execution token request does not match an approved non-executing Phase 1.11 decision');
  }

  const authorisationRequest = findRecord(
    authorisationRequestStore,
    tokenRequest.payload.authorisationDecision.authorisationRequestId,
    'Execution authorisation request',
  );
  assertExecutionAuthorisationRequestPayload(authorisationRequest.payload);
  if (authorisationRequest.id !== authorisationDecision.payload.authorisationRequest.id
    || authorisationRequest.recordHash !== authorisationDecision.payload.authorisationRequest.recordHash
    || authorisationRequest.payloadHash !== authorisationDecision.payload.authorisationRequest.payloadHash) {
    throw new Error('Execution token decision authorisation-request binding is invalid');
  }

  const planDecision = findRecord(
    planDecisionStore,
    tokenRequest.payload.authorisationDecision.executionPlanDecisionId,
    'Execution plan decision',
  );
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.payload.decision !== 'approve' || planDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution token decision requires an approved non-executing plan decision');
  }

  const plan = findRecord(planStore, tokenRequest.payload.authorisationDecision.executionPlanId, 'Execution plan');
  assertExecutionPlanPayload(plan.payload);
  if (sha256(stableStringify(plan.payload.targetMappings)) !== tokenRequest.payload.authorisationDecision.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps)) !== tokenRequest.payload.authorisationDecision.executionStepsHash) {
    throw new Error('Execution token decision plan snapshots do not match the signed request');
  }

  const changeDecision = findRecord(
    changeDecisionStore,
    tokenRequest.payload.authorisationDecision.sourceDecisionId,
    'Production change decision',
  );
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve' || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution token decision source decision is invalid');
  }

  const changeRequest = findRecord(
    changeRequestStore,
    tokenRequest.payload.authorisationDecision.changeRequestId,
    'Production change request',
  );
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== tokenRequest.payload.authorisationDecision.applicationId
    || changeRequest.payload.application.fingerprint !== tokenRequest.payload.authorisationDecision.applicationFingerprint) {
    throw new Error('Execution token decision application binding is invalid');
  }

  const validFromMs = Date.parse(tokenRequest.payload.validity.validFrom);
  const expiresAtMs = Date.parse(tokenRequest.payload.validity.expiresAt);
  const upstreamExpiresAtMs = Date.parse(tokenRequest.payload.validity.upstreamExpiresAt);
  const nowMs = now.getTime();
  const activeAtDecision = nowMs >= validFromMs && nowMs < expiresAtMs;
  const withinUpstreamWindow = nowMs < upstreamExpiresAtMs && expiresAtMs <= upstreamExpiresAtMs;
  const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));

  if (decision === 'approve') {
    if (!activeAtDecision || !withinUpstreamWindow || remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`Approval requires an active token request with at least ${MIN_REMAINING_SECONDS} seconds remaining`);
    }
    for (const [field, complete] of Object.entries(completedReviews)) {
      if (complete !== true) throw new Error(`Approval requires completed ${field}`);
    }
  }

  let finalPreflight = emptyPreflight();
  let scopeReview = emptyScopeReview();
  if (decision === 'approve') {
    const requestCandidates = tokenRequest.payload.finalSnapshot.candidates.slice()
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
        throw new Error(`Final token-decision preflight hash does not match the signed request: ${candidate.proposedRepositoryPath}`);
      }
      return {
        proposedRepositoryPath: candidate.proposedRepositoryPath,
        currentSha256: current.currentSha256,
        currentBytes: current.currentBytes,
        requestSha256: candidate.currentSha256,
        requestBytes: candidate.currentBytes,
        matchRequest: true,
        writeAllowed: false,
      };
    });
    finalPreflight = {
      required: true,
      verifiedAt: now.toISOString(),
      snapshotHash: sha256(stableStringify(preflightCandidates)),
      allMatchRequest: true,
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
        if (!candidate) throw new Error(`Execution token decision scope references an unauthorised candidate: ${candidatePath}`);
        return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
      }),
      executionAllowed: false,
      productionWriteAllowed: false,
    }));
    const expectedTargetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId);
    const recomputedScopeHash = sha256(stableStringify({
      targetIds: expectedTargetIds,
      operations: expectedOperations,
    }));
    if (stableStringify(tokenRequest.payload.scope.targetIds) !== stableStringify(expectedTargetIds)
      || stableStringify(tokenRequest.payload.scope.operations) !== stableStringify(expectedOperations)
      || tokenRequest.payload.scope.scopeHash !== recomputedScopeHash) {
      throw new Error('Execution token decision final scope does not exactly match the signed execution plan');
    }
    scopeReview = {
      required: true,
      requestScopeHash: tokenRequest.payload.scope.scopeHash,
      recomputedScopeHash,
      exactScopeMatch: true,
      operationCount: expectedOperations.length,
      candidateCount: preflightCandidates.length,
      operations: expectedOperations,
    };
  }

  const targetIds = [...tokenRequest.payload.scope.targetIds];
  const payload = {
    schemaVersion: 1,
    decisionType: 'human_single_use_execution_token_request_decision',
    mode: 'token_decision_record_only',
    authority: EXECUTION_TOKEN_DECISION_AUTHORITY,
    status: decision === 'approve'
      ? EXECUTION_TOKEN_DECISION_STATUSES.APPROVED
      : EXECUTION_TOKEN_DECISION_STATUSES.REJECTED,
    decision,
    tokenRequest: {
      id: tokenRequest.id,
      recordHash: tokenRequest.recordHash,
      payloadHash: tokenRequest.payloadHash,
      authorisationDecisionId: authorisationDecision.id,
      authorisationRequestId: authorisationRequest.id,
      executionPlanDecisionId: planDecision.id,
      executionPlanId: plan.id,
      sourceDecisionId: changeDecision.id,
      changeRequestId: changeRequest.id,
      applicationId: changeRequest.payload.application.id,
      applicationFingerprint: changeRequest.payload.application.fingerprint,
      scopeHash: tokenRequest.payload.scope.scopeHash,
      finalSnapshotHash: tokenRequest.payload.finalSnapshot.snapshotHash,
      candidateSnapshotHash: tokenRequest.payload.authorisationDecision.candidateSnapshotHash,
      executionStepsHash: tokenRequest.payload.authorisationDecision.executionStepsHash,
      backupManifestHash: tokenRequest.payload.authorisationDecision.backupManifestHash,
      restoreManifestHash: tokenRequest.payload.authorisationDecision.restoreManifestHash,
    },
    reviewer: { name: reviewerName, role: reviewerRole, note: reviewerNote },
    completedReviews,
    validityReview: {
      decisionAt: now.toISOString(),
      requestValidFrom: tokenRequest.payload.validity.validFrom,
      requestExpiresAt: tokenRequest.payload.validity.expiresAt,
      upstreamExpiresAt: tokenRequest.payload.validity.upstreamExpiresAt,
      activeAtDecision,
      withinUpstreamWindow,
      remainingSeconds,
    },
    finalPreflight,
    scopeReview,
    tokenState: {
      tokenMaterialIssued: false,
      tokenDigest: null,
      tokenId: null,
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
      ? 'separate_execution_token_issuance_review_and_last_moment_hash_check'
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

  const appended = tokenDecisionStore.appendSigned(
    payload,
    options.tokenDecisionSigningKey,
    options.tokenDecisionSigningKeyId || 'production-execution-token-decision-key',
  );
  auditLog.append('production_execution_token_human_decision_signed', {
    executionTokenRequestId: tokenRequest.id,
    executionTokenRequestRecordHash: tokenRequest.recordHash,
    executionTokenDecisionId: appended.record.id,
    executionTokenDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    targetCount: targetIds.length,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    tokenIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, reviewerName);

  return {
    executionTokenDecisionId: appended.record.id,
    executionTokenDecisionRecordHash: appended.record.recordHash,
    executionTokenRequestId: tokenRequest.id,
    decision,
    targetCount: targetIds.length,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    tokenIssued: false,
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

module.exports = { decideProductionExecutionToken };
