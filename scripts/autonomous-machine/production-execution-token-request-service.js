'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { assertChangeRequestPayload } = require('./production-change-request-store');
const { assertDecisionPayload } = require('./production-change-decision-store');
const { assertExecutionPlanPayload } = require('./production-execution-plan-store');
const { assertExecutionPlanDecisionPayload } = require('./production-execution-plan-decision-store');
const { assertExecutionAuthorisationRequestPayload } = require('./production-execution-authorisation-request-store');
const { assertExecutionAuthorisationDecisionPayload } = require('./production-execution-authorisation-decision-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  EXECUTION_TOKEN_REQUEST_AUTHORITY,
  EXECUTION_TOKEN_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
} = require('./production-execution-token-request-store');

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
  const duration = value === undefined ? 120 : value;
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new TypeError(`durationSeconds must be an integer between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`);
  }
  return duration;
}

function requestProductionExecutionToken(options = {}) {
  const {
    executionAuthorisationDecisionId,
    changeRequestStore,
    changeDecisionStore,
    planStore,
    planDecisionStore,
    authorisationRequestStore,
    authorisationDecisionStore,
    tokenRequestStore,
    auditLog,
    repositoryRoot,
  } = options;
  if (typeof executionAuthorisationDecisionId !== 'string' || !executionAuthorisationDecisionId.trim()) {
    throw new TypeError('execution token request requires executionAuthorisationDecisionId');
  }
  if (!changeRequestStore || !changeDecisionStore || !planStore || !planDecisionStore
    || !authorisationRequestStore || !authorisationDecisionStore || !tokenRequestStore || !auditLog) {
    throw new TypeError('execution token request requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');

  for (const key of [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey', 'planDecisionSigningKey',
    'authorisationRequestSigningKey', 'authorisationDecisionSigningKey', 'tokenRequestSigningKey',
  ]) assertSigningKey(options[key]);

  const requesterName = assertText(options.requesterName, 'requesterName', 3, 120);
  const requesterRole = assertText(options.requesterRole, 'requesterRole', 3, 120);
  const requesterNote = assertText(options.requesterNote, 'requesterNote', 10, 2000);
  const durationSeconds = normaliseDuration(options.durationSeconds);
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
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const authorisationDecision = authorisationDecisionStore.readRecords()
    .find((record) => record.id === executionAuthorisationDecisionId.trim());
  if (!authorisationDecision) throw new Error(`Approved execution authorisation decision not found: ${executionAuthorisationDecisionId}`);
  assertExecutionAuthorisationDecisionPayload(authorisationDecision.payload);
  if (authorisationDecision.payload.decision !== 'approve'
    || authorisationDecision.payload.status !== 'approved_execution_authorisation_record_only'
    || authorisationDecision.payload.readyForExecution !== false
    || authorisationDecision.payload.executionAuthorityGranted !== false
    || authorisationDecision.payload.authorisationGranted !== false
    || !authorisationDecision.payload.freshRecheck.required
    || !authorisationDecision.payload.freshRecheck.allMatchRequest
    || !authorisationDecision.payload.backupVerification.required
    || !authorisationDecision.payload.backupVerification.allVerified
    || !authorisationDecision.payload.restoreRehearsal.required
    || !authorisationDecision.payload.restoreRehearsal.allVerified) {
    throw new Error('Execution token request requires an approved, verified, non-executing Phase 1.11 decision');
  }

  const authorisationRequest = authorisationRequestStore.readRecords()
    .find((record) => record.id === authorisationDecision.payload.authorisationRequest.id);
  if (!authorisationRequest) throw new Error(`Execution authorisation request not found: ${authorisationDecision.payload.authorisationRequest.id}`);
  assertExecutionAuthorisationRequestPayload(authorisationRequest.payload);
  if (authorisationRequest.recordHash !== authorisationDecision.payload.authorisationRequest.recordHash
    || authorisationRequest.payloadHash !== authorisationDecision.payload.authorisationRequest.payloadHash) {
    throw new Error('Execution token request authorisation-request hashes do not match the Phase 1.11 decision');
  }

  const planDecision = planDecisionStore.readRecords()
    .find((record) => record.id === authorisationDecision.payload.authorisationRequest.executionPlanDecisionId);
  if (!planDecision) throw new Error(`Execution plan decision not found: ${authorisationDecision.payload.authorisationRequest.executionPlanDecisionId}`);
  assertExecutionPlanDecisionPayload(planDecision.payload);
  const plan = planStore.readRecords().find((record) => record.id === authorisationDecision.payload.authorisationRequest.executionPlanId);
  if (!plan) throw new Error(`Execution plan not found: ${authorisationDecision.payload.authorisationRequest.executionPlanId}`);
  assertExecutionPlanPayload(plan.payload);
  if (sha256(stableStringify(plan.payload.targetMappings)) !== authorisationDecision.payload.authorisationRequest.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps)) !== authorisationDecision.payload.authorisationRequest.executionStepsHash) {
    throw new Error('Execution token request plan snapshots do not match the Phase 1.11 decision');
  }

  const changeDecision = changeDecisionStore.readRecords()
    .find((record) => record.id === authorisationDecision.payload.authorisationRequest.sourceDecisionId);
  if (!changeDecision) throw new Error(`Production change decision not found: ${authorisationDecision.payload.authorisationRequest.sourceDecisionId}`);
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.payload.decision !== 'approve' || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution token request source decision is invalid');
  }
  const changeRequest = changeRequestStore.readRecords()
    .find((record) => record.id === authorisationDecision.payload.authorisationRequest.changeRequestId);
  if (!changeRequest) throw new Error(`Production change request not found: ${authorisationDecision.payload.authorisationRequest.changeRequestId}`);
  assertChangeRequestPayload(changeRequest.payload);
  if (changeRequest.payload.application.id !== authorisationDecision.payload.authorisationRequest.applicationId
    || changeRequest.payload.application.fingerprint !== authorisationDecision.payload.authorisationRequest.applicationFingerprint) {
    throw new Error('Execution token request application binding is invalid');
  }

  const upstreamExpiresAtMs = Date.parse(authorisationDecision.payload.validityReview.requestExpiresAt);
  const nowMs = now.getTime();
  if (nowMs >= upstreamExpiresAtMs) throw new Error('Execution token request requires an active upstream authorisation window');
  const requestedExpiresAtMs = nowMs + durationSeconds * 1000;
  if (requestedExpiresAtMs > upstreamExpiresAtMs) {
    throw new Error('Execution token request duration exceeds the remaining upstream authorisation window');
  }

  const existing = tokenRequestStore.findByAuthorisationDecisionId(authorisationDecision.id);
  if (existing) {
    const sameRequester = existing.payload.requester.name === requesterName
      && existing.payload.requester.role === requesterRole && existing.payload.requester.note === requesterNote;
    const sameDuration = existing.payload.validity.durationSeconds === durationSeconds;
    if (!sameRequester || !sameDuration) {
      throw new Error(`A different signed execution token request already exists for authorisation decision: ${authorisationDecision.id}`);
    }
    if (Date.parse(existing.payload.validity.expiresAt) <= nowMs) {
      throw new Error('The existing execution token request has expired; renewal is not supported in Phase 1.12');
    }
    return {
      executionTokenRequestId: existing.id,
      executionTokenRequestRecordHash: existing.recordHash,
      executionAuthorisationDecisionId: authorisationDecision.id,
      expiresAt: existing.payload.validity.expiresAt,
      candidateCount: existing.payload.finalSnapshot.candidates.length,
      operationCount: existing.payload.scope.operations.length,
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

  const authorisedCandidates = authorisationDecision.payload.freshRecheck.candidates.slice()
    .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
  const finalCandidates = authorisedCandidates.map((candidate) => {
    const fresh = inspectCandidate(repositoryRoot, candidate.proposedRepositoryPath, [], plan.payload.repositorySnapshot.maxFileBytes);
    if (!fresh.exists || fresh.currentSha256 !== candidate.currentSha256 || fresh.currentBytes !== candidate.currentBytes) {
      throw new Error(`Final execution-token hash does not match the Phase 1.11 decision: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      currentSha256: fresh.currentSha256,
      currentBytes: fresh.currentBytes,
      authorisationSha256: candidate.currentSha256,
      authorisationBytes: candidate.currentBytes,
      matchAuthorisationDecision: true,
      writeAllowed: false,
    };
  });
  const finalByPath = new Map(finalCandidates.map((candidate) => [candidate.proposedRepositoryPath, candidate]));
  const operations = plan.payload.executionPlan.steps.map((step, index) => {
    const candidateHashes = step.candidatePaths.map((candidatePath) => {
      const candidate = finalByPath.get(candidatePath);
      if (!candidate) throw new Error(`Execution token scope references an unauthorised candidate: ${candidatePath}`);
      return {
        proposedRepositoryPath: candidatePath,
        sha256: candidate.currentSha256,
        bytes: candidate.currentBytes,
      };
    });
    return {
      sequence: index + 1,
      targetId: step.targetId,
      operation: step.action,
      candidatePaths: [...step.candidatePaths],
      candidateHashes,
      executionAllowed: false,
      productionWriteAllowed: false,
    };
  });
  const coveredPaths = new Set(operations.flatMap((operation) => operation.candidatePaths));
  if (coveredPaths.size !== finalCandidates.length || finalCandidates.some((candidate) => !coveredPaths.has(candidate.proposedRepositoryPath))) {
    throw new Error('Execution token scope must cover every final candidate exactly through the signed plan operations');
  }

  const requestedAt = now.toISOString();
  const expiresAt = new Date(requestedExpiresAtMs).toISOString();
  const targetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId);
  const scope = {
    scopeType: 'candidate_paths_and_plan_operations_only',
    targetIds,
    operationCount: operations.length,
    candidateCount: finalCandidates.length,
    operations,
  };
  scope.scopeHash = sha256(stableStringify({ targetIds: scope.targetIds, operations: scope.operations }));

  const payload = {
    schemaVersion: 1,
    requestType: 'single_use_execution_token_request',
    mode: 'token_request_record_only',
    authority: EXECUTION_TOKEN_REQUEST_AUTHORITY,
    status: EXECUTION_TOKEN_REQUEST_STATUS,
    authorisationDecision: {
      id: authorisationDecision.id,
      recordHash: authorisationDecision.recordHash,
      payloadHash: authorisationDecision.payloadHash,
      authorisationRequestId: authorisationRequest.id,
      executionPlanDecisionId: planDecision.id,
      executionPlanId: plan.id,
      sourceDecisionId: changeDecision.id,
      changeRequestId: changeRequest.id,
      applicationId: changeRequest.payload.application.id,
      applicationFingerprint: changeRequest.payload.application.fingerprint,
      candidateSnapshotHash: authorisationDecision.payload.authorisationRequest.candidateSnapshotHash,
      executionStepsHash: authorisationDecision.payload.authorisationRequest.executionStepsHash,
      requestFreshSnapshotHash: authorisationDecision.payload.authorisationRequest.requestFreshSnapshotHash,
      decisionFreshSnapshotHash: authorisationDecision.payload.freshRecheck.snapshotHash,
      backupManifestHash: authorisationDecision.payload.backupVerification.manifestHash,
      restoreManifestHash: authorisationDecision.payload.restoreRehearsal.manifestHash,
    },
    requester: { name: requesterName, role: requesterRole, note: requesterNote },
    validity: {
      requestedAt,
      validFrom: requestedAt,
      expiresAt,
      upstreamExpiresAt: authorisationDecision.payload.validityReview.requestExpiresAt,
      durationSeconds,
      timeLimited: true,
      singleUseRequested: true,
      expiredAtCreation: false,
    },
    tokenState: {
      tokenMaterialIssued: false,
      tokenDigest: null,
      tokenId: null,
      consumed: false,
      useCount: 0,
      maxUses: 1,
    },
    finalSnapshot: {
      verifiedAt: requestedAt,
      snapshotHash: sha256(stableStringify(finalCandidates)),
      allMatchAuthorisationDecision: true,
      candidates: finalCandidates,
    },
    scope,
    productionFilePath: null,
    productionDestinationResolved: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    tokenIssued: false,
    executionTokenAvailable: false,
    nextAction: 'separate_human_execution_token_decision_and_final_preflight',
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

  const appended = tokenRequestStore.appendSigned(
    payload,
    options.tokenRequestSigningKey,
    options.tokenRequestSigningKeyId || 'production-execution-token-request-key',
  );
  auditLog.append('production_execution_token_request_signed', {
    executionAuthorisationDecisionId: authorisationDecision.id,
    executionAuthorisationDecisionRecordHash: authorisationDecision.recordHash,
    executionTokenRequestId: appended.record.id,
    executionTokenRequestRecordHash: appended.record.recordHash,
    requesterName,
    expiresAt,
    targetCount: targetIds.length,
    candidateCount: finalCandidates.length,
    operationCount: operations.length,
    scopeHash: scope.scopeHash,
    tokenIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, requesterName);

  return {
    executionTokenRequestId: appended.record.id,
    executionTokenRequestRecordHash: appended.record.recordHash,
    executionAuthorisationDecisionId: authorisationDecision.id,
    expiresAt,
    targetCount: targetIds.length,
    candidateCount: finalCandidates.length,
    operationCount: operations.length,
    scopeHash: scope.scopeHash,
    tokenIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    idempotent: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = { requestProductionExecutionToken, normaliseDuration };
