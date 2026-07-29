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
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  TOKEN_MATERIAL_GENERATION_REQUEST_AUTHORITY,
  TOKEN_MATERIAL_GENERATION_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
} = require('./production-execution-token-material-generation-request-store');

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

function normaliseDuration(value) {
  const duration = value === undefined || value === null ? 15 : Number(value);
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new TypeError(`durationSeconds must be an integer between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`);
  }
  return duration;
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('clock must produce a valid date');
  return date;
}

function findRecord(store, id, label) {
  const record = store.readRecords().find((item) => item.id === id);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}

function requestProductionExecutionTokenMaterialGeneration(options = {}) {
  const {
    executionTokenIssuanceDecisionId,
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
    auditLog,
    repositoryRoot,
  } = options;

  if (typeof executionTokenIssuanceDecisionId !== 'string' || !executionTokenIssuanceDecisionId.trim()) {
    throw new TypeError('token material generation request requires executionTokenIssuanceDecisionId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !tokenRequestStore
    || !tokenDecisionStore || !tokenIssuanceRequestStore || !tokenIssuanceDecisionStore
    || !tokenMaterialGenerationRequestStore || !auditLog) {
    throw new TypeError('token material generation request requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) {
    throw new TypeError('repositoryRoot is required');
  }

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey', 'planDecisionSigningKey',
    'authorisationRequestSigningKey', 'authorisationDecisionSigningKey', 'tokenRequestSigningKey',
    'tokenDecisionSigningKey', 'tokenIssuanceRequestSigningKey', 'tokenIssuanceDecisionSigningKey',
    'tokenMaterialGenerationRequestSigningKey',
  ]) assertSigningKey(options[key]);

  const requesterName = assertText(options.requesterName, 'requesterName', 3, 120);
  const requesterRole = assertText(options.requesterRole, 'requesterRole', 3, 120);
  const requesterNote = assertText(options.requesterNote, 'requesterNote', 10, 2000);
  const durationSeconds = normaliseDuration(options.durationSeconds);
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
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const issuanceDecision = findRecord(
    tokenIssuanceDecisionStore,
    executionTokenIssuanceDecisionId.trim(),
    'Execution token issuance decision',
  );
  assertExecutionTokenIssuanceDecisionPayload(issuanceDecision.payload);
  if (issuanceDecision.payload.decision !== 'approve'
    || issuanceDecision.payload.status !== 'approved_execution_token_issuance_request_record_only'
    || issuanceDecision.payload.readyForExecution !== false
    || issuanceDecision.payload.executionAuthorityGranted !== false
    || issuanceDecision.payload.authorisationGranted !== false
    || issuanceDecision.payload.tokenIssued !== false
    || issuanceDecision.payload.executionTokenAvailable !== false
    || issuanceDecision.payload.issuanceState.tokenMaterialIssued !== false
    || issuanceDecision.payload.issuanceState.bearerSecretIssued !== false
    || !issuanceDecision.payload.finalPreflight.required
    || !issuanceDecision.payload.finalPreflight.allMatchIssuanceRequest
    || !issuanceDecision.payload.scopeReview.required
    || !issuanceDecision.payload.scopeReview.exactScopeMatch) {
    throw new Error('Token material generation request requires an approved, exact, non-executing Phase 1.15 decision');
  }

  const issuanceRequest = findRecord(
    tokenIssuanceRequestStore,
    issuanceDecision.payload.issuanceRequest.id,
    'Execution token issuance request',
  );
  assertExecutionTokenIssuanceRequestPayload(issuanceRequest.payload);
  if (issuanceRequest.recordHash !== issuanceDecision.payload.issuanceRequest.recordHash
    || issuanceRequest.payloadHash !== issuanceDecision.payload.issuanceRequest.payloadHash
    || issuanceRequest.payload.scope.recomputedScopeHash !== issuanceDecision.payload.issuanceRequest.issuanceScopeHash
    || issuanceRequest.payload.lastMomentPreflight.snapshotHash
      !== issuanceDecision.payload.issuanceRequest.issuancePreflightSnapshotHash) {
    throw new Error('Token material generation request issuance-request binding is invalid');
  }

  const tokenDecision = findRecord(tokenDecisionStore, issuanceDecision.payload.issuanceRequest.tokenDecisionId, 'Execution token decision');
  assertExecutionTokenDecisionPayload(tokenDecision.payload);
  if (tokenDecision.payload.decision !== 'approve' || tokenDecision.payload.executionAuthorityGranted !== false
    || tokenDecision.payload.tokenIssued !== false || tokenDecision.payload.executionTokenAvailable !== false) {
    throw new Error('Token material generation request token decision is invalid');
  }

  const tokenRequest = findRecord(tokenRequestStore, issuanceDecision.payload.issuanceRequest.tokenRequestId, 'Execution token request');
  assertExecutionTokenRequestPayload(tokenRequest.payload);

  const authorisationDecision = findRecord(
    authorisationDecisionStore,
    issuanceDecision.payload.issuanceRequest.authorisationDecisionId,
    'Execution authorisation decision',
  );
  assertExecutionAuthorisationDecisionPayload(authorisationDecision.payload);
  if (authorisationDecision.payload.decision !== 'approve'
    || authorisationDecision.payload.executionAuthorityGranted !== false
    || authorisationDecision.payload.authorisationGranted !== false) {
    throw new Error('Token material generation request authorisation decision is invalid');
  }

  const authorisationRequest = findRecord(
    authorisationRequestStore,
    issuanceDecision.payload.issuanceRequest.authorisationRequestId,
    'Execution authorisation request',
  );
  assertExecutionAuthorisationRequestPayload(authorisationRequest.payload);

  const planDecision = findRecord(
    planDecisionStore,
    issuanceDecision.payload.issuanceRequest.executionPlanDecisionId,
    'Execution plan decision',
  );
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.payload.decision !== 'approve' || planDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Token material generation request plan decision is invalid');
  }

  const plan = findRecord(planStore, issuanceDecision.payload.issuanceRequest.executionPlanId, 'Execution plan');
  assertExecutionPlanPayload(plan.payload);
  if (sha256(stableStringify(plan.payload.targetMappings))
      !== issuanceDecision.payload.issuanceRequest.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps))
      !== issuanceDecision.payload.issuanceRequest.executionStepsHash) {
    throw new Error('Token material generation request plan snapshots are invalid');
  }

  const changeDecision = findRecord(
    changeDecisionStore,
    issuanceDecision.payload.issuanceRequest.sourceDecisionId,
    'Production change decision',
  );
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve' || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Token material generation request source decision is invalid');
  }

  const changeRequest = findRecord(
    changeRequestStore,
    issuanceDecision.payload.issuanceRequest.changeRequestId,
    'Production change request',
  );
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== issuanceDecision.payload.issuanceRequest.applicationId
    || changeRequest.payload.application.fingerprint
      !== issuanceDecision.payload.issuanceRequest.applicationFingerprint) {
    throw new Error('Token material generation request application binding is invalid');
  }

  const issuanceRequestExpiresAtMs = Date.parse(issuanceRequest.payload.validity.expiresAt);
  const tokenRequestExpiresAtMs = Date.parse(issuanceRequest.payload.validity.tokenRequestExpiresAt);
  const upstreamExpiresAtMs = Date.parse(issuanceRequest.payload.validity.upstreamExpiresAt);
  const limitingExpiresAtMs = Math.min(issuanceRequestExpiresAtMs, tokenRequestExpiresAtMs, upstreamExpiresAtMs);
  const remainingSeconds = Math.max(0, Math.floor((limitingExpiresAtMs - nowMs) / 1000));
  if (nowMs >= limitingExpiresAtMs || remainingSeconds < MIN_REMAINING_SECONDS) {
    throw new Error(`Token material generation request requires at least ${MIN_REMAINING_SECONDS} seconds in active signed windows`);
  }

  const requestedExpiresAtMs = nowMs + durationSeconds * 1000;
  if (requestedExpiresAtMs > limitingExpiresAtMs) {
    throw new Error('Token material generation request duration exceeds remaining signed windows');
  }

  const existing = tokenMaterialGenerationRequestStore.findByIssuanceDecisionId(issuanceDecision.id);
  if (existing) {
    const sameRequester = existing.payload.requester.name === requesterName
      && existing.payload.requester.role === requesterRole
      && existing.payload.requester.note === requesterNote;
    const sameDuration = existing.payload.validity.durationSeconds === durationSeconds;
    if (!sameRequester || !sameDuration) {
      throw new Error(`A different signed token material generation request already exists for decision: ${issuanceDecision.id}`);
    }
    if (Date.parse(existing.payload.validity.expiresAt) <= nowMs) {
      throw new Error('The existing token material generation request has expired; renewal is not supported in Phase 1.16');
    }
    return {
      tokenMaterialGenerationRequestId: existing.id,
      tokenMaterialGenerationRequestRecordHash: existing.recordHash,
      executionTokenIssuanceDecisionId: issuanceDecision.id,
      expiresAt: existing.payload.validity.expiresAt,
      targetCount: existing.payload.scope.targetIds.length,
      candidateCount: existing.payload.lastMomentPreflight.candidates.length,
      operationCount: existing.payload.scope.operations.length,
      generationRequested: true,
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

  const decisionCandidates = issuanceDecision.payload.finalPreflight.candidates.slice()
    .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
  const lastMomentCandidates = decisionCandidates.map((candidate) => {
    const current = inspectCandidate(
      repositoryRoot,
      candidate.proposedRepositoryPath,
      [],
      plan.payload.repositorySnapshot.maxFileBytes,
    );
    if (!current.exists || current.currentSha256 !== candidate.currentSha256
      || current.currentBytes !== candidate.currentBytes) {
      throw new Error(`Last-moment token-material-generation hash does not match Phase 1.15: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      currentSha256: current.currentSha256,
      currentBytes: current.currentBytes,
      issuanceDecisionSha256: candidate.currentSha256,
      issuanceDecisionBytes: candidate.currentBytes,
      matchIssuanceDecision: true,
      writeAllowed: false,
    };
  });

  const candidateByPath = new Map(lastMomentCandidates.map((candidate) => [candidate.proposedRepositoryPath, candidate]));
  const operations = plan.payload.executionPlan.steps.map((step, index) => ({
    sequence: index + 1,
    targetId: step.targetId,
    operation: step.action,
    candidatePaths: [...step.candidatePaths],
    candidateHashes: step.candidatePaths.map((candidatePath) => {
      const candidate = candidateByPath.get(candidatePath);
      if (!candidate) throw new Error(`Token material generation scope references an unauthorised candidate: ${candidatePath}`);
      return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
    }),
    executionAllowed: false,
    productionWriteAllowed: false,
  }));
  const targetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId);
  const recomputedScopeHash = sha256(stableStringify({ targetIds, operations }));
  if (stableStringify(issuanceDecision.payload.targetIds) !== stableStringify(targetIds)
    || stableStringify(issuanceDecision.payload.scopeReview.operations) !== stableStringify(operations)
    || issuanceRequest.payload.scope.recomputedScopeHash !== recomputedScopeHash
    || issuanceDecision.payload.scopeReview.issuanceRequestScopeHash !== recomputedScopeHash
    || issuanceDecision.payload.scopeReview.recomputedScopeHash !== recomputedScopeHash) {
    throw new Error('Token material generation request scope does not exactly match the signed plan and decisions');
  }

  const requestedAt = now.toISOString();
  const expiresAt = new Date(requestedExpiresAtMs).toISOString();
  const payload = {
    schemaVersion: 1,
    requestType: 'single_use_token_material_generation_request',
    mode: 'token_material_generation_request_record_only',
    authority: TOKEN_MATERIAL_GENERATION_REQUEST_AUTHORITY,
    status: TOKEN_MATERIAL_GENERATION_REQUEST_STATUS,
    issuanceDecision: {
      id: issuanceDecision.id,
      recordHash: issuanceDecision.recordHash,
      payloadHash: issuanceDecision.payloadHash,
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
      requestScopeHash: issuanceDecision.payload.issuanceRequest.requestScopeHash,
      decisionScopeHash: issuanceDecision.payload.issuanceRequest.decisionScopeHash,
      issuanceScopeHash: issuanceDecision.payload.issuanceRequest.issuanceScopeHash,
      generationScopeHash: recomputedScopeHash,
      requestFinalSnapshotHash: issuanceDecision.payload.issuanceRequest.requestFinalSnapshotHash,
      decisionPreflightSnapshotHash: issuanceDecision.payload.issuanceRequest.decisionPreflightSnapshotHash,
      issuancePreflightSnapshotHash: issuanceDecision.payload.issuanceRequest.issuancePreflightSnapshotHash,
      issuanceDecisionPreflightSnapshotHash: issuanceDecision.payload.finalPreflight.snapshotHash,
      candidateSnapshotHash: issuanceDecision.payload.issuanceRequest.candidateSnapshotHash,
      executionStepsHash: issuanceDecision.payload.issuanceRequest.executionStepsHash,
      backupManifestHash: issuanceDecision.payload.issuanceRequest.backupManifestHash,
      restoreManifestHash: issuanceDecision.payload.issuanceRequest.restoreManifestHash,
    },
    requester: { name: requesterName, role: requesterRole, note: requesterNote },
    validity: {
      requestedAt,
      validFrom: requestedAt,
      expiresAt,
      issuanceRequestExpiresAt: issuanceRequest.payload.validity.expiresAt,
      tokenRequestExpiresAt: issuanceRequest.payload.validity.tokenRequestExpiresAt,
      upstreamExpiresAt: issuanceRequest.payload.validity.upstreamExpiresAt,
      durationSeconds,
      timeLimited: true,
      singleUseGenerationRequested: true,
      expiredAtCreation: false,
    },
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
    lastMomentPreflight: {
      verifiedAt: requestedAt,
      snapshotHash: sha256(stableStringify(lastMomentCandidates)),
      allMatchIssuanceDecision: true,
      candidates: lastMomentCandidates,
    },
    scope: {
      scopeType: 'issuance_decision_bound_candidate_paths_and_operations_only',
      tokenRequestScopeHash: issuanceDecision.payload.issuanceRequest.requestScopeHash,
      tokenDecisionScopeHash: issuanceDecision.payload.issuanceRequest.decisionScopeHash,
      issuanceRequestScopeHash: issuanceDecision.payload.issuanceRequest.issuanceScopeHash,
      issuanceDecisionScopeHash: issuanceDecision.payload.scopeReview.recomputedScopeHash,
      recomputedScopeHash,
      exactScopeMatch: true,
      targetIds,
      operationCount: operations.length,
      candidateCount: lastMomentCandidates.length,
      operations,
    },
    productionFilePath: null,
    productionDestinationResolved: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    tokenIssued: false,
    executionTokenAvailable: false,
    nextAction: 'separate_human_token_material_generation_decision_no_secret',
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

  const appended = tokenMaterialGenerationRequestStore.appendSigned(
    payload,
    options.tokenMaterialGenerationRequestSigningKey,
    options.tokenMaterialGenerationRequestSigningKeyId
      || 'production-execution-token-material-generation-request-key',
  );

  auditLog.append('production_execution_token_material_generation_request_signed', {
    executionTokenIssuanceDecisionId: issuanceDecision.id,
    executionTokenIssuanceDecisionRecordHash: issuanceDecision.recordHash,
    tokenMaterialGenerationRequestId: appended.record.id,
    tokenMaterialGenerationRequestRecordHash: appended.record.recordHash,
    requesterName,
    targetCount: targetIds.length,
    candidateCount: lastMomentCandidates.length,
    operationCount: operations.length,
    generationRequested: true,
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
  }, requesterName);

  return {
    tokenMaterialGenerationRequestId: appended.record.id,
    tokenMaterialGenerationRequestRecordHash: appended.record.recordHash,
    executionTokenIssuanceDecisionId: issuanceDecision.id,
    expiresAt,
    targetCount: targetIds.length,
    candidateCount: lastMomentCandidates.length,
    operationCount: operations.length,
    generationRequested: true,
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

module.exports = { requestProductionExecutionTokenMaterialGeneration };
