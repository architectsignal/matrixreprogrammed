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
const { assertExecutionTokenIssuanceDecisionPayload } = require('./production-execution-token-issuance-decision-store');
const { assertTokenMaterialGenerationRequestPayload } = require('./production-execution-token-material-generation-request-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  TOKEN_MATERIAL_GENERATION_DECISION_AUTHORITY,
  TOKEN_MATERIAL_GENERATION_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
} = require('./production-execution-token-material-generation-decision-store');

const REVIEW_FIELDS = Object.freeze([
  'generationRequestWindowReview',
  'finalPreflightReview',
  'exactScopeReview',
  'entropyBoundaryReview',
  'backupEvidenceReview',
  'restoreEvidenceReview',
  'productionOwnerReview',
]);

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new TypeError(`${field} contains control characters`);
  }
  if (text.length < min || text.length > max) {
    throw new TypeError(`${field} must contain ${min}-${max} characters`);
  }
  return text;
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('clock must produce a valid date');
  return date;
}

function normaliseReviews(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('completedReviews must be an object');
  }
  const result = {};
  for (const field of REVIEW_FIELDS) {
    if (typeof value[field] !== 'boolean') {
      throw new TypeError(`completedReviews ${field} must be boolean`);
    }
    result[field] = value[field];
  }
  return result;
}

function findRecord(store, id, label) {
  const record = store.readRecords().find((item) => item.id === id);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}

function emptyPreflight() {
  return {
    required: false,
    verifiedAt: null,
    snapshotHash: null,
    allMatchGenerationRequest: false,
    candidates: [],
  };
}

function emptyScopeReview() {
  return {
    required: false,
    generationRequestScopeHash: null,
    recomputedScopeHash: null,
    exactScopeMatch: false,
    operationCount: 0,
    candidateCount: 0,
    operations: [],
  };
}

function decideProductionExecutionTokenMaterialGeneration(options = {}) {
  const {
    tokenMaterialGenerationRequestId,
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
    tokenMaterialGenerationRequestStore,
    tokenMaterialGenerationDecisionStore,
    auditLog,
    repositoryRoot,
  } = options;

  if (typeof tokenMaterialGenerationRequestId !== 'string'
    || !tokenMaterialGenerationRequestId.trim()) {
    throw new TypeError('token material generation decision requires tokenMaterialGenerationRequestId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !tokenRequestStore
    || !tokenDecisionStore || !tokenIssuanceRequestStore || !tokenIssuanceDecisionStore
    || !tokenMaterialGenerationRequestStore || !tokenMaterialGenerationDecisionStore || !auditLog) {
    throw new TypeError('token material generation decision requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) {
    throw new TypeError('repositoryRoot is required');
  }

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey',
    'planDecisionSigningKey', 'authorisationRequestSigningKey',
    'authorisationDecisionSigningKey', 'tokenRequestSigningKey', 'tokenDecisionSigningKey',
    'tokenIssuanceRequestSigningKey', 'tokenIssuanceDecisionSigningKey',
    'tokenMaterialGenerationRequestSigningKey', 'tokenMaterialGenerationDecisionSigningKey',
  ]) assertSigningKey(options[key]);

  const decision = options.decision;
  if (!['approve', 'reject'].includes(decision)) {
    throw new TypeError('decision must be approve or reject');
  }
  const reviewerName = assertText(options.reviewerName, 'reviewerName', 3, 120);
  const reviewerRole = assertText(options.reviewerRole, 'reviewerRole', 3, 120);
  const reviewerNote = assertText(options.reviewerNote, 'reviewerNote', 10, 2000);
  const completedReviews = normaliseReviews(options.completedReviews);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const now = asDate(clock());
  const nowMs = now.getTime();

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
    ['Token material generation request', tokenMaterialGenerationRequestStore.verify(options.tokenMaterialGenerationRequestSigningKey)],
    ['Token material generation decision', tokenMaterialGenerationDecisionStore.verify(options.tokenMaterialGenerationDecisionSigningKey)],
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const generationRequest = findRecord(
    tokenMaterialGenerationRequestStore,
    tokenMaterialGenerationRequestId.trim(),
    'Token material generation request',
  );
  assertTokenMaterialGenerationRequestPayload(generationRequest.payload);

  const existing = tokenMaterialGenerationDecisionStore.findByGenerationRequestId(generationRequest.id);
  if (existing) {
    const sameReviewer = existing.payload.reviewer.name === reviewerName
      && existing.payload.reviewer.role === reviewerRole
      && existing.payload.reviewer.note === reviewerNote;
    const sameReviews = stableStringify(existing.payload.completedReviews)
      === stableStringify(completedReviews);
    if (existing.payload.decision !== decision || !sameReviewer || !sameReviews) {
      throw new Error(`A different signed token material generation decision already exists for request: ${generationRequest.id}`);
    }
    return {
      tokenMaterialGenerationDecisionId: existing.id,
      tokenMaterialGenerationDecisionRecordHash: existing.recordHash,
      tokenMaterialGenerationRequestId: generationRequest.id,
      decision,
      entropyGenerated: false,
      tokenMaterialGenerated: false,
      tokenMaterialIssued: false,
      bearerSecretGenerated: false,
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

  const issuanceDecision = findRecord(
    tokenIssuanceDecisionStore,
    generationRequest.payload.issuanceDecision.id,
    'Execution token issuance decision',
  );
  assertExecutionTokenIssuanceDecisionPayload(issuanceDecision.payload);
  if (issuanceDecision.recordHash !== generationRequest.payload.issuanceDecision.recordHash
    || issuanceDecision.payloadHash !== generationRequest.payload.issuanceDecision.payloadHash
    || issuanceDecision.payload.decision !== 'approve'
    || issuanceDecision.payload.status !== 'approved_execution_token_issuance_request_record_only'
    || issuanceDecision.payload.readyForExecution !== false
    || issuanceDecision.payload.executionAuthorityGranted !== false
    || issuanceDecision.payload.authorisationGranted !== false
    || issuanceDecision.payload.tokenIssued !== false
    || issuanceDecision.payload.executionTokenAvailable !== false
    || issuanceDecision.payload.issuanceState.tokenMaterialIssued !== false
    || issuanceDecision.payload.issuanceState.bearerSecretIssued !== false) {
    throw new Error('Token material generation decision requires an approved, non-executing Phase 1.15 decision');
  }

  const issuanceRequest = findRecord(
    tokenIssuanceRequestStore,
    generationRequest.payload.issuanceDecision.issuanceRequestId,
    'Execution token issuance request',
  );
  assertExecutionTokenIssuanceRequestPayload(issuanceRequest.payload);
  if (issuanceRequest.id !== issuanceDecision.payload.issuanceRequest.id
    || issuanceRequest.recordHash !== issuanceDecision.payload.issuanceRequest.recordHash
    || issuanceRequest.payloadHash !== issuanceDecision.payload.issuanceRequest.payloadHash) {
    throw new Error('Token material generation decision issuance-request binding is invalid');
  }

  const tokenDecision = findRecord(
    tokenDecisionStore,
    generationRequest.payload.issuanceDecision.tokenDecisionId,
    'Execution token decision',
  );
  assertExecutionTokenDecisionPayload(tokenDecision.payload);
  if (tokenDecision.payload.decision !== 'approve'
    || tokenDecision.payload.executionAuthorityGranted !== false
    || tokenDecision.payload.tokenIssued !== false
    || tokenDecision.payload.executionTokenAvailable !== false) {
    throw new Error('Token material generation decision token decision is invalid');
  }

  const tokenRequest = findRecord(
    tokenRequestStore,
    generationRequest.payload.issuanceDecision.tokenRequestId,
    'Execution token request',
  );
  assertExecutionTokenRequestPayload(tokenRequest.payload);

  const authorisationDecision = findRecord(
    authorisationDecisionStore,
    generationRequest.payload.issuanceDecision.authorisationDecisionId,
    'Execution authorisation decision',
  );
  assertExecutionAuthorisationDecisionPayload(authorisationDecision.payload);
  if (authorisationDecision.payload.decision !== 'approve'
    || authorisationDecision.payload.executionAuthorityGranted !== false
    || authorisationDecision.payload.authorisationGranted !== false) {
    throw new Error('Token material generation decision authorisation decision is invalid');
  }

  const authorisationRequest = findRecord(
    authorisationRequestStore,
    generationRequest.payload.issuanceDecision.authorisationRequestId,
    'Execution authorisation request',
  );
  assertExecutionAuthorisationRequestPayload(authorisationRequest.payload);

  const planDecision = findRecord(
    planDecisionStore,
    generationRequest.payload.issuanceDecision.executionPlanDecisionId,
    'Execution plan decision',
  );
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.payload.decision !== 'approve'
    || planDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Token material generation decision plan decision is invalid');
  }

  const plan = findRecord(
    planStore,
    generationRequest.payload.issuanceDecision.executionPlanId,
    'Execution plan',
  );
  assertExecutionPlanPayload(plan.payload);
  if (sha256(stableStringify(plan.payload.targetMappings))
      !== generationRequest.payload.issuanceDecision.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps))
      !== generationRequest.payload.issuanceDecision.executionStepsHash) {
    throw new Error('Token material generation decision plan snapshots are invalid');
  }

  const changeDecision = findRecord(
    changeDecisionStore,
    generationRequest.payload.issuanceDecision.sourceDecisionId,
    'Production change decision',
  );
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve'
    || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Token material generation decision source decision is invalid');
  }

  const changeRequest = findRecord(
    changeRequestStore,
    generationRequest.payload.issuanceDecision.changeRequestId,
    'Production change request',
  );
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== generationRequest.payload.issuanceDecision.applicationId
    || changeRequest.payload.application.fingerprint
      !== generationRequest.payload.issuanceDecision.applicationFingerprint) {
    throw new Error('Token material generation decision application binding is invalid');
  }

  const validFromMs = Date.parse(generationRequest.payload.validity.validFrom);
  const expiresAtMs = Date.parse(generationRequest.payload.validity.expiresAt);
  const issuanceRequestExpiresAtMs = Date.parse(generationRequest.payload.validity.issuanceRequestExpiresAt);
  const tokenRequestExpiresAtMs = Date.parse(generationRequest.payload.validity.tokenRequestExpiresAt);
  const upstreamExpiresAtMs = Date.parse(generationRequest.payload.validity.upstreamExpiresAt);
  const activeAtDecision = nowMs >= validFromMs && nowMs < expiresAtMs;
  const withinIssuanceRequestWindow = nowMs < issuanceRequestExpiresAtMs
    && expiresAtMs <= issuanceRequestExpiresAtMs;
  const withinTokenRequestWindow = nowMs < tokenRequestExpiresAtMs
    && expiresAtMs <= tokenRequestExpiresAtMs;
  const withinUpstreamWindow = nowMs < upstreamExpiresAtMs
    && expiresAtMs <= upstreamExpiresAtMs;
  const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));

  if (decision === 'approve') {
    if (!activeAtDecision || !withinIssuanceRequestWindow || !withinTokenRequestWindow
      || !withinUpstreamWindow || remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`Approval requires an active generation request with at least ${MIN_REMAINING_SECONDS} seconds remaining`);
    }
    for (const [field, complete] of Object.entries(completedReviews)) {
      if (complete !== true) throw new Error(`Approval requires completed ${field}`);
    }
  }

  let finalPreflight = emptyPreflight();
  let scopeReview = emptyScopeReview();
  if (decision === 'approve') {
    const requestCandidates = generationRequest.payload.lastMomentPreflight.candidates.slice()
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
        throw new Error(`Final material-generation-decision preflight hash does not match the signed request: ${candidate.proposedRepositoryPath}`);
      }
      return {
        proposedRepositoryPath: candidate.proposedRepositoryPath,
        currentSha256: current.currentSha256,
        currentBytes: current.currentBytes,
        generationRequestSha256: candidate.currentSha256,
        generationRequestBytes: candidate.currentBytes,
        matchGenerationRequest: true,
        writeAllowed: false,
      };
    });
    finalPreflight = {
      required: true,
      verifiedAt: now.toISOString(),
      snapshotHash: sha256(stableStringify(preflightCandidates)),
      allMatchGenerationRequest: true,
      candidates: preflightCandidates,
    };

    const preflightByPath = new Map(preflightCandidates.map((candidate) => [
      candidate.proposedRepositoryPath,
      candidate,
    ]));
    const expectedOperations = plan.payload.executionPlan.steps.map((step, index) => ({
      sequence: index + 1,
      targetId: step.targetId,
      operation: step.action,
      candidatePaths: [...step.candidatePaths],
      candidateHashes: step.candidatePaths.map((candidatePath) => {
        const candidate = preflightByPath.get(candidatePath);
        if (!candidate) {
          throw new Error(`Token material generation decision scope references an unauthorised candidate: ${candidatePath}`);
        }
        return {
          proposedRepositoryPath: candidatePath,
          sha256: candidate.currentSha256,
          bytes: candidate.currentBytes,
        };
      }),
      executionAllowed: false,
      productionWriteAllowed: false,
    }));
    const expectedTargetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId);
    const recomputedScopeHash = sha256(stableStringify({
      targetIds: expectedTargetIds,
      operations: expectedOperations,
    }));
    if (stableStringify(generationRequest.payload.scope.targetIds)
        !== stableStringify(expectedTargetIds)
      || stableStringify(generationRequest.payload.scope.operations)
        !== stableStringify(expectedOperations)
      || generationRequest.payload.scope.recomputedScopeHash !== recomputedScopeHash
      || generationRequest.payload.scope.tokenRequestScopeHash !== recomputedScopeHash
      || generationRequest.payload.scope.tokenDecisionScopeHash !== recomputedScopeHash
      || generationRequest.payload.scope.issuanceRequestScopeHash !== recomputedScopeHash
      || generationRequest.payload.scope.issuanceDecisionScopeHash !== recomputedScopeHash) {
      throw new Error('Token material generation decision scope does not exactly match the signed plan and request');
    }
    scopeReview = {
      required: true,
      generationRequestScopeHash: generationRequest.payload.scope.recomputedScopeHash,
      recomputedScopeHash,
      exactScopeMatch: true,
      operationCount: expectedOperations.length,
      candidateCount: preflightCandidates.length,
      operations: expectedOperations,
    };
  }

  const targetIds = [...generationRequest.payload.scope.targetIds];
  const payload = {
    schemaVersion: 1,
    decisionType: 'human_single_use_token_material_generation_request_decision',
    mode: 'token_material_generation_decision_record_only',
    authority: TOKEN_MATERIAL_GENERATION_DECISION_AUTHORITY,
    status: decision === 'approve'
      ? TOKEN_MATERIAL_GENERATION_DECISION_STATUSES.APPROVED
      : TOKEN_MATERIAL_GENERATION_DECISION_STATUSES.REJECTED,
    decision,
    generationRequest: {
      id: generationRequest.id,
      recordHash: generationRequest.recordHash,
      payloadHash: generationRequest.payloadHash,
      issuanceDecisionId: issuanceDecision.id,
      issuanceRequestId: issuanceRequest.id,
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
      requestScopeHash: generationRequest.payload.issuanceDecision.requestScopeHash,
      decisionScopeHash: generationRequest.payload.issuanceDecision.decisionScopeHash,
      issuanceScopeHash: generationRequest.payload.issuanceDecision.issuanceScopeHash,
      generationScopeHash: generationRequest.payload.issuanceDecision.generationScopeHash,
      generationRequestScopeHash: generationRequest.payload.scope.recomputedScopeHash,
      requestFinalSnapshotHash: generationRequest.payload.issuanceDecision.requestFinalSnapshotHash,
      decisionPreflightSnapshotHash:
        generationRequest.payload.issuanceDecision.decisionPreflightSnapshotHash,
      issuancePreflightSnapshotHash:
        generationRequest.payload.issuanceDecision.issuancePreflightSnapshotHash,
      issuanceDecisionPreflightSnapshotHash:
        generationRequest.payload.issuanceDecision.issuanceDecisionPreflightSnapshotHash,
      generationRequestPreflightSnapshotHash:
        generationRequest.payload.lastMomentPreflight.snapshotHash,
      candidateSnapshotHash: generationRequest.payload.issuanceDecision.candidateSnapshotHash,
      executionStepsHash: generationRequest.payload.issuanceDecision.executionStepsHash,
      backupManifestHash: generationRequest.payload.issuanceDecision.backupManifestHash,
      restoreManifestHash: generationRequest.payload.issuanceDecision.restoreManifestHash,
    },
    reviewer: { name: reviewerName, role: reviewerRole, note: reviewerNote },
    completedReviews,
    validityReview: {
      decisionAt: now.toISOString(),
      requestValidFrom: generationRequest.payload.validity.validFrom,
      requestExpiresAt: generationRequest.payload.validity.expiresAt,
      issuanceRequestExpiresAt: generationRequest.payload.validity.issuanceRequestExpiresAt,
      tokenRequestExpiresAt: generationRequest.payload.validity.tokenRequestExpiresAt,
      upstreamExpiresAt: generationRequest.payload.validity.upstreamExpiresAt,
      activeAtDecision,
      withinIssuanceRequestWindow,
      withinTokenRequestWindow,
      withinUpstreamWindow,
      remainingSeconds,
    },
    finalPreflight,
    scopeReview,
    generationState: {
      generationRequested: true,
      entropyGenerated: false,
      tokenMaterialGenerated: false,
      tokenMaterialIssued: false,
      tokenDigest: null,
      tokenId: null,
      bearerSecretGenerated: false,
      bearerSecretIssued: false,
      credentialGenerated: false,
      credentialIssued: false,
      consumed: false,
      useCount: 0,
      maxUses: 1,
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
      ? 'separate_entropy_generation_request_no_secret_output_or_execution'
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

  const appended = tokenMaterialGenerationDecisionStore.appendSigned(
    payload,
    options.tokenMaterialGenerationDecisionSigningKey,
    options.tokenMaterialGenerationDecisionSigningKeyId
      || 'production-execution-token-material-generation-decision-key',
  );

  auditLog.append('production_execution_token_material_generation_human_decision_signed', {
    tokenMaterialGenerationRequestId: generationRequest.id,
    tokenMaterialGenerationRequestRecordHash: generationRequest.recordHash,
    tokenMaterialGenerationDecisionId: appended.record.id,
    tokenMaterialGenerationDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    targetCount: targetIds.length,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    entropyGenerated: false,
    tokenMaterialGenerated: false,
    tokenMaterialIssued: false,
    bearerSecretGenerated: false,
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
    tokenMaterialGenerationDecisionId: appended.record.id,
    tokenMaterialGenerationDecisionRecordHash: appended.record.recordHash,
    tokenMaterialGenerationRequestId: generationRequest.id,
    decision,
    targetCount: targetIds.length,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    entropyGenerated: false,
    tokenMaterialGenerated: false,
    tokenMaterialIssued: false,
    bearerSecretGenerated: false,
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

module.exports = { decideProductionExecutionTokenMaterialGeneration };
