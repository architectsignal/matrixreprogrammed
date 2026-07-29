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
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  EXECUTION_TOKEN_ISSUANCE_REQUEST_AUTHORITY,
  EXECUTION_TOKEN_ISSUANCE_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
} = require('./production-execution-token-issuance-request-store');

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
  const duration = value === undefined || value === null ? 30 : Number(value);
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

function requestProductionExecutionTokenIssuance(options = {}) {
  const {
    executionTokenDecisionId,
    changeRequestStore,
    changeDecisionStore,
    planStore,
    planDecisionStore,
    authorisationRequestStore,
    authorisationDecisionStore,
    tokenRequestStore,
    tokenDecisionStore,
    tokenIssuanceRequestStore,
    auditLog,
    repositoryRoot,
  } = options;

  if (typeof executionTokenDecisionId !== 'string' || !executionTokenDecisionId.trim()) {
    throw new TypeError('execution token issuance request requires executionTokenDecisionId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !tokenRequestStore
    || !tokenDecisionStore || !tokenIssuanceRequestStore || !auditLog) {
    throw new TypeError('execution token issuance request requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey',
    'planDecisionSigningKey', 'authorisationRequestSigningKey',
    'authorisationDecisionSigningKey', 'tokenRequestSigningKey',
    'tokenDecisionSigningKey', 'tokenIssuanceRequestSigningKey',
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
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const tokenDecision = findRecord(tokenDecisionStore, executionTokenDecisionId.trim(), 'Execution token decision');
  assertExecutionTokenDecisionPayload(tokenDecision.payload);
  if (tokenDecision.payload.decision !== 'approve'
    || tokenDecision.payload.status !== 'approved_execution_token_request_record_only'
    || tokenDecision.payload.readyForExecution !== false
    || tokenDecision.payload.executionAuthorityGranted !== false
    || tokenDecision.payload.authorisationGranted !== false
    || tokenDecision.payload.tokenIssued !== false
    || tokenDecision.payload.executionTokenAvailable !== false
    || !tokenDecision.payload.finalPreflight.required
    || !tokenDecision.payload.finalPreflight.allMatchRequest
    || !tokenDecision.payload.scopeReview.required
    || !tokenDecision.payload.scopeReview.exactScopeMatch) {
    throw new Error('Execution token issuance request requires an approved, exact, non-executing Phase 1.13 decision');
  }

  const tokenRequest = findRecord(tokenRequestStore, tokenDecision.payload.tokenRequest.id, 'Execution token request');
  assertExecutionTokenRequestPayload(tokenRequest.payload);
  if (tokenRequest.recordHash !== tokenDecision.payload.tokenRequest.recordHash
    || tokenRequest.payloadHash !== tokenDecision.payload.tokenRequest.payloadHash
    || tokenRequest.payload.scope.scopeHash !== tokenDecision.payload.tokenRequest.scopeHash
    || tokenRequest.payload.finalSnapshot.snapshotHash !== tokenDecision.payload.tokenRequest.finalSnapshotHash) {
    throw new Error('Execution token issuance request token-request binding is invalid');
  }

  const authorisationDecision = findRecord(authorisationDecisionStore, tokenDecision.payload.tokenRequest.authorisationDecisionId, 'Execution authorisation decision');
  assertExecutionAuthorisationDecisionPayload(authorisationDecision.payload);
  if (authorisationDecision.payload.decision !== 'approve'
    || authorisationDecision.payload.executionAuthorityGranted !== false
    || authorisationDecision.payload.authorisationGranted !== false) {
    throw new Error('Execution token issuance request authorisation decision is invalid');
  }

  const authorisationRequest = findRecord(authorisationRequestStore, tokenDecision.payload.tokenRequest.authorisationRequestId, 'Execution authorisation request');
  assertExecutionAuthorisationRequestPayload(authorisationRequest.payload);

  const planDecision = findRecord(planDecisionStore, tokenDecision.payload.tokenRequest.executionPlanDecisionId, 'Execution plan decision');
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.payload.decision !== 'approve' || planDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution token issuance request plan decision is invalid');
  }

  const plan = findRecord(planStore, tokenDecision.payload.tokenRequest.executionPlanId, 'Execution plan');
  assertExecutionPlanPayload(plan.payload);
  if (sha256(stableStringify(plan.payload.targetMappings)) !== tokenDecision.payload.tokenRequest.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps)) !== tokenDecision.payload.tokenRequest.executionStepsHash) {
    throw new Error('Execution token issuance request plan snapshots are invalid');
  }

  const changeDecision = findRecord(changeDecisionStore, tokenDecision.payload.tokenRequest.sourceDecisionId, 'Production change decision');
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve' || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution token issuance request source decision is invalid');
  }

  const changeRequest = findRecord(changeRequestStore, tokenDecision.payload.tokenRequest.changeRequestId, 'Production change request');
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== tokenDecision.payload.tokenRequest.applicationId
    || changeRequest.payload.application.fingerprint !== tokenDecision.payload.tokenRequest.applicationFingerprint) {
    throw new Error('Execution token issuance request application binding is invalid');
  }

  const tokenRequestExpiresAtMs = Date.parse(tokenRequest.payload.validity.expiresAt);
  const upstreamExpiresAtMs = Date.parse(tokenRequest.payload.validity.upstreamExpiresAt);
  const remainingSeconds = Math.max(0, Math.floor((Math.min(tokenRequestExpiresAtMs, upstreamExpiresAtMs) - nowMs) / 1000));
  if (nowMs >= tokenRequestExpiresAtMs || nowMs >= upstreamExpiresAtMs || remainingSeconds < MIN_REMAINING_SECONDS) {
    throw new Error(`Execution token issuance request requires at least ${MIN_REMAINING_SECONDS} seconds in active signed windows`);
  }

  const requestedExpiresAtMs = nowMs + durationSeconds * 1000;
  if (requestedExpiresAtMs > tokenRequestExpiresAtMs || requestedExpiresAtMs > upstreamExpiresAtMs) {
    throw new Error('Execution token issuance request duration exceeds the remaining signed authorisation windows');
  }

  const existing = tokenIssuanceRequestStore.findByTokenDecisionId(tokenDecision.id);
  if (existing) {
    const sameRequester = existing.payload.requester.name === requesterName
      && existing.payload.requester.role === requesterRole
      && existing.payload.requester.note === requesterNote;
    const sameDuration = existing.payload.validity.durationSeconds === durationSeconds;
    if (!sameRequester || !sameDuration) {
      throw new Error(`A different signed execution token issuance request already exists for decision: ${tokenDecision.id}`);
    }
    if (Date.parse(existing.payload.validity.expiresAt) <= nowMs) {
      throw new Error('The existing execution token issuance request has expired; renewal is not supported in Phase 1.14');
    }
    return {
      executionTokenIssuanceRequestId: existing.id,
      executionTokenIssuanceRequestRecordHash: existing.recordHash,
      executionTokenDecisionId: tokenDecision.id,
      expiresAt: existing.payload.validity.expiresAt,
      candidateCount: existing.payload.lastMomentPreflight.candidates.length,
      operationCount: existing.payload.scope.operations.length,
      tokenIssued: false,
      tokenMaterialIssued: false,
      readyForExecution: false,
      executionAuthorityGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const decisionCandidates = tokenDecision.payload.finalPreflight.candidates.slice()
    .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
  const lastMomentCandidates = decisionCandidates.map((candidate) => {
    const current = inspectCandidate(repositoryRoot, candidate.proposedRepositoryPath, [], plan.payload.repositorySnapshot.maxFileBytes);
    if (!current.exists || current.currentSha256 !== candidate.currentSha256 || current.currentBytes !== candidate.currentBytes) {
      throw new Error(`Last-moment token-issuance hash does not match the Phase 1.13 decision: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      currentSha256: current.currentSha256,
      currentBytes: current.currentBytes,
      decisionSha256: candidate.currentSha256,
      decisionBytes: candidate.currentBytes,
      matchTokenDecision: true,
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
      if (!candidate) throw new Error(`Execution token issuance scope references an unauthorised candidate: ${candidatePath}`);
      return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
    }),
    executionAllowed: false,
    productionWriteAllowed: false,
  }));
  const targetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId);
  const recomputedScopeHash = sha256(stableStringify({ targetIds, operations }));

  if (stableStringify(tokenDecision.payload.targetIds) !== stableStringify(targetIds)
    || stableStringify(tokenDecision.payload.scopeReview.operations) !== stableStringify(operations)
    || tokenDecision.payload.tokenRequest.scopeHash !== recomputedScopeHash
    || tokenDecision.payload.scopeReview.requestScopeHash !== recomputedScopeHash
    || tokenDecision.payload.scopeReview.recomputedScopeHash !== recomputedScopeHash) {
    throw new Error('Execution token issuance request scope does not exactly match the signed decision and plan');
  }

  const requestedAt = now.toISOString();
  const expiresAt = new Date(requestedExpiresAtMs).toISOString();
  const payload = {
    schemaVersion: 1,
    requestType: 'single_use_execution_token_issuance_request',
    mode: 'token_issuance_request_record_only',
    authority: EXECUTION_TOKEN_ISSUANCE_REQUEST_AUTHORITY,
    status: EXECUTION_TOKEN_ISSUANCE_REQUEST_STATUS,
    tokenDecision: {
      id: tokenDecision.id,
      recordHash: tokenDecision.recordHash,
      payloadHash: tokenDecision.payloadHash,
      tokenRequestId: tokenRequest.id,
      authorisationDecisionId: authorisationDecision.id,
      authorisationRequestId: authorisationRequest.id,
      executionPlanDecisionId: planDecision.id,
      executionPlanId: plan.id,
      sourceDecisionId: changeDecision.id,
      changeRequestId: changeRequest.id,
      applicationId: changeRequest.payload.application.id,
      applicationFingerprint: changeRequest.payload.application.fingerprint,
      requestScopeHash: tokenRequest.payload.scope.scopeHash,
      requestFinalSnapshotHash: tokenRequest.payload.finalSnapshot.snapshotHash,
      decisionPreflightSnapshotHash: tokenDecision.payload.finalPreflight.snapshotHash,
      decisionScopeHash: tokenDecision.payload.scopeReview.recomputedScopeHash,
      candidateSnapshotHash: tokenDecision.payload.tokenRequest.candidateSnapshotHash,
      executionStepsHash: tokenDecision.payload.tokenRequest.executionStepsHash,
      backupManifestHash: tokenDecision.payload.tokenRequest.backupManifestHash,
      restoreManifestHash: tokenDecision.payload.tokenRequest.restoreManifestHash,
    },
    requester: { name: requesterName, role: requesterRole, note: requesterNote },
    validity: {
      requestedAt,
      validFrom: requestedAt,
      expiresAt,
      tokenRequestExpiresAt: tokenRequest.payload.validity.expiresAt,
      upstreamExpiresAt: tokenRequest.payload.validity.upstreamExpiresAt,
      durationSeconds,
      timeLimited: true,
      singleUseIssuanceRequested: true,
      expiredAtCreation: false,
    },
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
    },
    lastMomentPreflight: {
      verifiedAt: requestedAt,
      snapshotHash: sha256(stableStringify(lastMomentCandidates)),
      allMatchTokenDecision: true,
      candidates: lastMomentCandidates,
    },
    scope: {
      scopeType: 'decision_bound_candidate_paths_and_operations_only',
      tokenRequestScopeHash: tokenRequest.payload.scope.scopeHash,
      tokenDecisionScopeHash: tokenDecision.payload.scopeReview.recomputedScopeHash,
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
    nextAction: 'separate_human_token_issuance_decision_no_token_material',
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

  const appended = tokenIssuanceRequestStore.appendSigned(
    payload,
    options.tokenIssuanceRequestSigningKey,
    options.tokenIssuanceRequestSigningKeyId || 'production-execution-token-issuance-request-key',
  );

  auditLog.append('production_execution_token_issuance_request_signed', {
    executionTokenDecisionId: tokenDecision.id,
    executionTokenDecisionRecordHash: tokenDecision.recordHash,
    executionTokenIssuanceRequestId: appended.record.id,
    executionTokenIssuanceRequestRecordHash: appended.record.recordHash,
    requesterName,
    targetCount: targetIds.length,
    candidateCount: lastMomentCandidates.length,
    operationCount: operations.length,
    tokenIssued: false,
    tokenMaterialIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, requesterName);

  return {
    executionTokenIssuanceRequestId: appended.record.id,
    executionTokenIssuanceRequestRecordHash: appended.record.recordHash,
    executionTokenDecisionId: tokenDecision.id,
    expiresAt,
    targetCount: targetIds.length,
    candidateCount: lastMomentCandidates.length,
    operationCount: operations.length,
    tokenIssued: false,
    tokenMaterialIssued: false,
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

module.exports = { requestProductionExecutionTokenIssuance };
