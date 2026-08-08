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
const { assertTokenMaterialGenerationDecisionPayload } = require('./production-execution-token-material-generation-decision-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  ENTROPY_GENERATION_REQUEST_AUTHORITY,
  ENTROPY_GENERATION_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
} = require('./production-execution-entropy-generation-request-store');

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
function normaliseDuration(value) {
  const duration = value === undefined || value === null ? 9 : Number(value);
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new TypeError(`durationSeconds must be an integer between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`);
  }
  return duration;
}
function findRecord(store, id, label) {
  const record = store.readRecords().find((item) => item.id === id);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}

function requestProductionExecutionEntropyGeneration(options = {}) {
  const {
    tokenMaterialGenerationDecisionId,
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
    entropyGenerationRequestStore,
    auditLog,
    repositoryRoot,
  } = options;

  if (typeof tokenMaterialGenerationDecisionId !== 'string' || !tokenMaterialGenerationDecisionId.trim()) {
    throw new TypeError('entropy generation request requires tokenMaterialGenerationDecisionId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !tokenRequestStore
    || !tokenDecisionStore || !tokenIssuanceRequestStore || !tokenIssuanceDecisionStore
    || !tokenMaterialGenerationRequestStore || !tokenMaterialGenerationDecisionStore
    || !entropyGenerationRequestStore || !auditLog) {
    throw new TypeError('entropy generation request requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey', 'planDecisionSigningKey',
    'authorisationRequestSigningKey', 'authorisationDecisionSigningKey', 'tokenRequestSigningKey',
    'tokenDecisionSigningKey', 'tokenIssuanceRequestSigningKey', 'tokenIssuanceDecisionSigningKey',
    'tokenMaterialGenerationRequestSigningKey', 'tokenMaterialGenerationDecisionSigningKey',
    'entropyGenerationRequestSigningKey',
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
    ['Token material generation decision', tokenMaterialGenerationDecisionStore.verify(options.tokenMaterialGenerationDecisionSigningKey)],
    ['Entropy generation request', entropyGenerationRequestStore.verify(options.entropyGenerationRequestSigningKey)],
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const generationDecision = findRecord(
    tokenMaterialGenerationDecisionStore,
    tokenMaterialGenerationDecisionId.trim(),
    'Token material generation decision',
  );
  assertTokenMaterialGenerationDecisionPayload(generationDecision.payload);
  if (generationDecision.payload.decision !== 'approve'
    || generationDecision.payload.status !== 'approved_token_material_generation_request_record_only'
    || generationDecision.payload.readyForExecution !== false
    || generationDecision.payload.executionAuthorityGranted !== false
    || generationDecision.payload.authorisationGranted !== false
    || generationDecision.payload.tokenIssued !== false
    || generationDecision.payload.executionTokenAvailable !== false
    || generationDecision.payload.generationState.entropyGenerated !== false
    || generationDecision.payload.generationState.tokenMaterialGenerated !== false
    || generationDecision.payload.generationState.tokenMaterialIssued !== false
    || generationDecision.payload.generationState.bearerSecretGenerated !== false
    || generationDecision.payload.generationState.bearerSecretIssued !== false
    || !generationDecision.payload.finalPreflight.required
    || !generationDecision.payload.finalPreflight.allMatchGenerationRequest
    || !generationDecision.payload.scopeReview.required
    || !generationDecision.payload.scopeReview.exactScopeMatch) {
    throw new Error('Entropy generation request requires an approved, exact, non-executing Phase 1.17 decision');
  }

  const generationRequest = findRecord(
    tokenMaterialGenerationRequestStore,
    generationDecision.payload.generationRequest.id,
    'Token material generation request',
  );
  assertTokenMaterialGenerationRequestPayload(generationRequest.payload);
  if (generationRequest.recordHash !== generationDecision.payload.generationRequest.recordHash
    || generationRequest.payloadHash !== generationDecision.payload.generationRequest.payloadHash
    || generationRequest.payload.scope.recomputedScopeHash
      !== generationDecision.payload.generationRequest.generationRequestScopeHash
    || generationRequest.payload.lastMomentPreflight.snapshotHash
      !== generationDecision.payload.generationRequest.generationRequestPreflightSnapshotHash) {
    throw new Error('Entropy generation request generation-request binding is invalid');
  }

  const issuanceDecision = findRecord(tokenIssuanceDecisionStore,
    generationDecision.payload.generationRequest.issuanceDecisionId, 'Execution token issuance decision');
  assertExecutionTokenIssuanceDecisionPayload(issuanceDecision.payload);
  if (issuanceDecision.payload.decision !== 'approve' || issuanceDecision.payload.executionAuthorityGranted !== false
    || issuanceDecision.payload.tokenIssued !== false || issuanceDecision.payload.executionTokenAvailable !== false) {
    throw new Error('Entropy generation request issuance decision is invalid');
  }
  const issuanceRequest = findRecord(tokenIssuanceRequestStore,
    generationDecision.payload.generationRequest.issuanceRequestId, 'Execution token issuance request');
  assertExecutionTokenIssuanceRequestPayload(issuanceRequest.payload);
  const tokenDecision = findRecord(tokenDecisionStore,
    generationDecision.payload.generationRequest.tokenDecisionId, 'Execution token decision');
  assertExecutionTokenDecisionPayload(tokenDecision.payload);
  if (tokenDecision.payload.decision !== 'approve' || tokenDecision.payload.executionAuthorityGranted !== false
    || tokenDecision.payload.tokenIssued !== false || tokenDecision.payload.executionTokenAvailable !== false) {
    throw new Error('Entropy generation request token decision is invalid');
  }
  const tokenRequest = findRecord(tokenRequestStore,
    generationDecision.payload.generationRequest.tokenRequestId, 'Execution token request');
  assertExecutionTokenRequestPayload(tokenRequest.payload);
  const authorisationDecision = findRecord(authorisationDecisionStore,
    generationDecision.payload.generationRequest.authorisationDecisionId, 'Execution authorisation decision');
  assertExecutionAuthorisationDecisionPayload(authorisationDecision.payload);
  if (authorisationDecision.payload.decision !== 'approve'
    || authorisationDecision.payload.executionAuthorityGranted !== false
    || authorisationDecision.payload.authorisationGranted !== false) {
    throw new Error('Entropy generation request authorisation decision is invalid');
  }
  const authorisationRequest = findRecord(authorisationRequestStore,
    generationDecision.payload.generationRequest.authorisationRequestId, 'Execution authorisation request');
  assertExecutionAuthorisationRequestPayload(authorisationRequest.payload);
  const planDecision = findRecord(planDecisionStore,
    generationDecision.payload.generationRequest.executionPlanDecisionId, 'Execution plan decision');
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.payload.decision !== 'approve' || planDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Entropy generation request plan decision is invalid');
  }
  const plan = findRecord(planStore,
    generationDecision.payload.generationRequest.executionPlanId, 'Execution plan');
  assertExecutionPlanPayload(plan.payload);
  if (sha256(stableStringify(plan.payload.targetMappings))
      !== generationDecision.payload.generationRequest.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps))
      !== generationDecision.payload.generationRequest.executionStepsHash) {
    throw new Error('Entropy generation request plan snapshots are invalid');
  }
  const changeDecision = findRecord(changeDecisionStore,
    generationDecision.payload.generationRequest.sourceDecisionId, 'Production change decision');
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve' || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Entropy generation request source decision is invalid');
  }
  const changeRequest = findRecord(changeRequestStore,
    generationDecision.payload.generationRequest.changeRequestId, 'Production change request');
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== generationDecision.payload.generationRequest.applicationId
    || changeRequest.payload.application.fingerprint
      !== generationDecision.payload.generationRequest.applicationFingerprint) {
    throw new Error('Entropy generation request application binding is invalid');
  }

  const generationRequestExpiresAtMs = Date.parse(generationRequest.payload.validity.expiresAt);
  const issuanceRequestExpiresAtMs = Date.parse(generationRequest.payload.validity.issuanceRequestExpiresAt);
  const tokenRequestExpiresAtMs = Date.parse(generationRequest.payload.validity.tokenRequestExpiresAt);
  const upstreamExpiresAtMs = Date.parse(generationRequest.payload.validity.upstreamExpiresAt);
  const limitingExpiresAtMs = Math.min(
    generationRequestExpiresAtMs,
    issuanceRequestExpiresAtMs,
    tokenRequestExpiresAtMs,
    upstreamExpiresAtMs,
  );
  const remainingSeconds = Math.max(0, Math.floor((limitingExpiresAtMs - nowMs) / 1000));
  if (nowMs >= limitingExpiresAtMs || remainingSeconds < MIN_REMAINING_SECONDS) {
    throw new Error(`Entropy generation request requires at least ${MIN_REMAINING_SECONDS} seconds in active signed windows`);
  }
  const requestedExpiresAtMs = nowMs + durationSeconds * 1000;
  if (requestedExpiresAtMs > limitingExpiresAtMs) {
    throw new Error('Entropy generation request duration exceeds remaining signed windows');
  }

  const existing = entropyGenerationRequestStore.findByGenerationDecisionId(generationDecision.id);
  if (existing) {
    const sameRequester = existing.payload.requester.name === requesterName
      && existing.payload.requester.role === requesterRole
      && existing.payload.requester.note === requesterNote;
    const sameDuration = existing.payload.validity.durationSeconds === durationSeconds;
    if (!sameRequester || !sameDuration) {
      throw new Error(`A different signed entropy generation request already exists for decision: ${generationDecision.id}`);
    }
    if (Date.parse(existing.payload.validity.expiresAt) <= nowMs) {
      throw new Error('The existing entropy generation request has expired; renewal is not supported in Phase 1.18');
    }
    return {
      entropyGenerationRequestId: existing.id,
      entropyGenerationRequestRecordHash: existing.recordHash,
      tokenMaterialGenerationDecisionId: generationDecision.id,
      expiresAt: existing.payload.validity.expiresAt,
      targetCount: existing.payload.scope.targetIds.length,
      candidateCount: existing.payload.lastMomentPreflight.candidates.length,
      operationCount: existing.payload.scope.operations.length,
      generationRequested: true,
      entropyGenerated: false,
      entropyOutputProduced: false,
      tokenMaterialGenerated: false,
      bearerSecretGenerated: false,
      readyForExecution: false,
      executionAuthorityGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const decisionCandidates = generationDecision.payload.finalPreflight.candidates.slice()
    .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
  const lastMomentCandidates = decisionCandidates.map((candidate) => {
    const current = inspectCandidate(repositoryRoot, candidate.proposedRepositoryPath, [], plan.payload.repositorySnapshot.maxFileBytes);
    if (!current.exists || current.currentSha256 !== candidate.currentSha256
      || current.currentBytes !== candidate.currentBytes) {
      throw new Error(`Last-moment entropy-generation hash does not match Phase 1.17: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      currentSha256: current.currentSha256,
      currentBytes: current.currentBytes,
      generationDecisionSha256: candidate.currentSha256,
      generationDecisionBytes: candidate.currentBytes,
      matchGenerationDecision: true,
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
      if (!candidate) throw new Error(`Entropy generation scope references an unauthorised candidate: ${candidatePath}`);
      return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
    }),
    executionAllowed: false,
    productionWriteAllowed: false,
  }));
  const targetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId);
  const recomputedScopeHash = sha256(stableStringify({ targetIds, operations }));
  if (stableStringify(generationDecision.payload.targetIds) !== stableStringify(targetIds)
    || stableStringify(generationDecision.payload.scopeReview.operations) !== stableStringify(operations)
    || generationRequest.payload.scope.recomputedScopeHash !== recomputedScopeHash
    || generationDecision.payload.scopeReview.generationRequestScopeHash !== recomputedScopeHash
    || generationDecision.payload.scopeReview.recomputedScopeHash !== recomputedScopeHash) {
    throw new Error('Entropy generation request scope does not exactly match the signed plan and decisions');
  }

  const requestedAt = now.toISOString();
  const expiresAt = new Date(requestedExpiresAtMs).toISOString();
  const payload = {
    schemaVersion: 1,
    requestType: 'single_use_entropy_generation_request',
    mode: 'entropy_generation_request_record_only',
    authority: ENTROPY_GENERATION_REQUEST_AUTHORITY,
    status: ENTROPY_GENERATION_REQUEST_STATUS,
    generationDecision: {
      id: generationDecision.id,
      recordHash: generationDecision.recordHash,
      payloadHash: generationDecision.payloadHash,
      generationRequestId: generationRequest.id,
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
      requestScopeHash: generationDecision.payload.generationRequest.requestScopeHash,
      decisionScopeHash: generationDecision.payload.generationRequest.decisionScopeHash,
      issuanceScopeHash: generationDecision.payload.generationRequest.issuanceScopeHash,
      generationScopeHash: generationDecision.payload.generationRequest.generationScopeHash,
      generationRequestScopeHash: generationDecision.payload.generationRequest.generationRequestScopeHash,
      generationDecisionScopeHash: generationDecision.payload.scopeReview.recomputedScopeHash,
      requestFinalSnapshotHash: generationDecision.payload.generationRequest.requestFinalSnapshotHash,
      decisionPreflightSnapshotHash: generationDecision.payload.generationRequest.decisionPreflightSnapshotHash,
      issuancePreflightSnapshotHash: generationDecision.payload.generationRequest.issuancePreflightSnapshotHash,
      issuanceDecisionPreflightSnapshotHash: generationDecision.payload.generationRequest.issuanceDecisionPreflightSnapshotHash,
      generationRequestPreflightSnapshotHash: generationDecision.payload.generationRequest.generationRequestPreflightSnapshotHash,
      generationDecisionPreflightSnapshotHash: generationDecision.payload.finalPreflight.snapshotHash,
      candidateSnapshotHash: generationDecision.payload.generationRequest.candidateSnapshotHash,
      executionStepsHash: generationDecision.payload.generationRequest.executionStepsHash,
      backupManifestHash: generationDecision.payload.generationRequest.backupManifestHash,
      restoreManifestHash: generationDecision.payload.generationRequest.restoreManifestHash,
    },
    requester: { name: requesterName, role: requesterRole, note: requesterNote },
    validity: {
      requestedAt,
      validFrom: requestedAt,
      expiresAt,
      generationRequestExpiresAt: generationRequest.payload.validity.expiresAt,
      issuanceRequestExpiresAt: generationRequest.payload.validity.issuanceRequestExpiresAt,
      tokenRequestExpiresAt: generationRequest.payload.validity.tokenRequestExpiresAt,
      upstreamExpiresAt: generationRequest.payload.validity.upstreamExpiresAt,
      durationSeconds,
      timeLimited: true,
      singleUseEntropyGenerationRequested: true,
      expiredAtCreation: false,
    },
    entropyState: {
      generationRequested: true,
      entropySourceSelected: false,
      entropySource: null,
      entropyBytesRequested: 0,
      entropyGenerated: false,
      entropyOutput: null,
      entropyDigest: null,
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
      allMatchGenerationDecision: true,
      candidates: lastMomentCandidates,
    },
    scope: {
      scopeType: 'generation_decision_bound_candidate_paths_and_operations_only',
      tokenRequestScopeHash: generationDecision.payload.generationRequest.requestScopeHash,
      tokenDecisionScopeHash: generationDecision.payload.generationRequest.decisionScopeHash,
      issuanceRequestScopeHash: generationDecision.payload.generationRequest.issuanceScopeHash,
      issuanceDecisionScopeHash: generationDecision.payload.generationRequest.generationScopeHash,
      generationRequestScopeHash: generationDecision.payload.generationRequest.generationRequestScopeHash,
      generationDecisionScopeHash: generationDecision.payload.scopeReview.recomputedScopeHash,
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
    nextAction: 'separate_human_entropy_generation_decision_no_entropy_output',
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

  const appended = entropyGenerationRequestStore.appendSigned(
    payload,
    options.entropyGenerationRequestSigningKey,
    options.entropyGenerationRequestSigningKeyId || 'production-execution-entropy-generation-request-key',
  );
  auditLog.append('production_execution_entropy_generation_request_signed', {
    tokenMaterialGenerationDecisionId: generationDecision.id,
    tokenMaterialGenerationDecisionRecordHash: generationDecision.recordHash,
    entropyGenerationRequestId: appended.record.id,
    entropyGenerationRequestRecordHash: appended.record.recordHash,
    requesterName,
    targetCount: targetIds.length,
    candidateCount: lastMomentCandidates.length,
    operationCount: operations.length,
    generationRequested: true,
    entropySourceSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
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
    entropyGenerationRequestId: appended.record.id,
    entropyGenerationRequestRecordHash: appended.record.recordHash,
    tokenMaterialGenerationDecisionId: generationDecision.id,
    expiresAt,
    targetCount: targetIds.length,
    candidateCount: lastMomentCandidates.length,
    operationCount: operations.length,
    generationRequested: true,
    entropySourceSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
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

module.exports = { requestProductionExecutionEntropyGeneration };
