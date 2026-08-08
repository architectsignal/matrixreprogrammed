'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { assertEntropySourceSelectionRequestPayload } = require('./production-execution-entropy-source-selection-request-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  ENTROPY_SOURCE_SELECTION_DECISION_AUTHORITY,
  ENTROPY_SOURCE_SELECTION_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
  REVIEW_FIELDS,
} = require('./production-execution-entropy-source-selection-decision-store');

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
  for (const field of REVIEW_FIELDS) {
    if (typeof value[field] !== 'boolean') throw new TypeError(`completedReviews ${field} must be boolean`);
    result[field] = value[field];
  }
  return result;
}
function emptyPreflight() {
  return { required: false, verifiedAt: null, snapshotHash: null, allMatchSourceSelectionRequest: false, candidates: [] };
}
function emptyScopeReview() {
  return { required: false, sourceSelectionRequestScopeHash: null, recomputedScopeHash: null, exactScopeMatch: false, operationCount: 0, candidateCount: 0, operations: [] };
}
function findRecord(store, id, label) {
  const record = store.readRecords().find((item) => item.id === id);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}
function verifyIntegrityChecks(checks) {
  if (!Array.isArray(checks) || checks.length < 1) throw new TypeError('upstreamIntegrityChecks must be a non-empty array');
  for (const item of checks) {
    if (!item || typeof item !== 'object' || !item.store || typeof item.label !== 'string') {
      throw new TypeError('upstreamIntegrityChecks entries require label and store');
    }
    assertSigningKey(item.signingKey);
    const result = item.store.verify(item.signingKey);
    if (!result.valid) throw new Error(`${item.label} ledger verification failed: ${result.reason}`);
  }
}
function safeSelectionState() {
  return {
    selectionRequested: true,
    permittedSourceClasses: ['operating_system_csprng'],
    requestedSourceClass: null,
    entropySourceSelected: false,
    entropySource: null,
    providerSelected: false,
    providerName: null,
    networkSourceAllowed: false,
    externalProviderAllowed: false,
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
  };
}

function decideProductionExecutionEntropySourceSelection(options = {}) {
  const {
    entropySourceSelectionRequestId,
    entropySourceSelectionRequestStore,
    entropySourceSelectionDecisionStore,
    auditLog,
    repositoryRoot,
    upstreamIntegrityChecks,
  } = options;
  if (typeof entropySourceSelectionRequestId !== 'string' || !entropySourceSelectionRequestId.trim()) {
    throw new TypeError('entropy source selection decision requires entropySourceSelectionRequestId');
  }
  if (!entropySourceSelectionRequestStore || !entropySourceSelectionDecisionStore || !auditLog) {
    throw new TypeError('entropy source selection decision requires request store, decision store and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');
  assertSigningKey(options.entropySourceSelectionRequestSigningKey);
  assertSigningKey(options.entropySourceSelectionDecisionSigningKey);
  verifyIntegrityChecks(upstreamIntegrityChecks);
  const requestVerification = entropySourceSelectionRequestStore.verify(options.entropySourceSelectionRequestSigningKey);
  if (!requestVerification.valid) throw new Error(`Entropy source selection request ledger verification failed: ${requestVerification.reason}`);
  const decisionVerification = entropySourceSelectionDecisionStore.verify(options.entropySourceSelectionDecisionSigningKey);
  if (!decisionVerification.valid) throw new Error(`Entropy source selection decision ledger verification failed: ${decisionVerification.reason}`);

  const decision = options.decision;
  if (!['approve', 'reject'].includes(decision)) throw new TypeError('decision must be approve or reject');
  const reviewerName = assertText(options.reviewerName, 'reviewerName', 3, 120);
  const reviewerRole = assertText(options.reviewerRole, 'reviewerRole', 3, 120);
  const reviewerNote = assertText(options.reviewerNote, 'reviewerNote', 10, 2000);
  const completedReviews = normaliseReviews(options.completedReviews);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const now = asDate(clock());
  const nowMs = now.getTime();

  const request = findRecord(
    entropySourceSelectionRequestStore,
    entropySourceSelectionRequestId.trim(),
    'Entropy source selection request',
  );
  assertEntropySourceSelectionRequestPayload(request.payload);
  const existing = entropySourceSelectionDecisionStore.findBySourceSelectionRequestId(request.id);
  if (existing) {
    const sameReviewer = existing.payload.reviewer.name === reviewerName
      && existing.payload.reviewer.role === reviewerRole
      && existing.payload.reviewer.note === reviewerNote;
    const sameReviews = stableStringify(existing.payload.completedReviews) === stableStringify(completedReviews);
    if (existing.payload.decision !== decision || !sameReviewer || !sameReviews) {
      throw new Error(`A different signed entropy source selection decision already exists for request: ${request.id}`);
    }
    return {
      entropySourceSelectionDecisionId: existing.id,
      entropySourceSelectionDecisionRecordHash: existing.recordHash,
      entropySourceSelectionRequestId: request.id,
      decision,
      entropySourceSelected: false,
      providerSelected: false,
      entropyGenerated: false,
      entropyOutputProduced: false,
      readyForExecution: false,
      executionAuthorityGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const validFromMs = Date.parse(request.payload.validity.validFrom);
  const expiresAtMs = Date.parse(request.payload.validity.expiresAt);
  const entropyRequestExpiresAtMs = Date.parse(request.payload.validity.entropyRequestExpiresAt);
  const activeAtDecision = nowMs >= validFromMs && nowMs < expiresAtMs;
  const withinEntropyRequestWindow = nowMs < entropyRequestExpiresAtMs && expiresAtMs <= entropyRequestExpiresAtMs;
  const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
  if (decision === 'approve') {
    if (!activeAtDecision || !withinEntropyRequestWindow || remainingSeconds < MIN_REMAINING_SECONDS) {
      throw new Error(`Approval requires an active entropy source selection request with at least ${MIN_REMAINING_SECONDS} second remaining`);
    }
    for (const [field, complete] of Object.entries(completedReviews)) {
      if (!complete) throw new Error(`Approval requires completed ${field}`);
    }
  }

  let finalPreflight = emptyPreflight();
  let scopeReview = emptyScopeReview();
  if (decision === 'approve') {
    const requestCandidates = request.payload.lastMomentPreflight.candidates.slice()
      .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
    const candidates = requestCandidates.map((candidate) => {
      const current = inspectCandidate(repositoryRoot, candidate.proposedRepositoryPath, [], 20 * 1024 * 1024);
      if (!current.exists || current.currentSha256 !== candidate.currentSha256 || current.currentBytes !== candidate.currentBytes) {
        throw new Error(`Final entropy-source-selection preflight does not match request: ${candidate.proposedRepositoryPath}`);
      }
      return {
        proposedRepositoryPath: candidate.proposedRepositoryPath,
        currentSha256: current.currentSha256,
        currentBytes: current.currentBytes,
        sourceSelectionRequestSha256: candidate.currentSha256,
        sourceSelectionRequestBytes: candidate.currentBytes,
        matchSourceSelectionRequest: true,
        writeAllowed: false,
      };
    });
    finalPreflight = {
      required: true,
      verifiedAt: now.toISOString(),
      snapshotHash: sha256(stableStringify(candidates)),
      allMatchSourceSelectionRequest: true,
      candidates,
    };
    const candidateMap = new Map(candidates.map((candidate) => [candidate.proposedRepositoryPath, candidate]));
    const operations = request.payload.scope.operations.map((operation) => ({
      sequence: operation.sequence,
      targetId: operation.targetId,
      operation: operation.operation,
      candidatePaths: [...operation.candidatePaths],
      candidateHashes: operation.candidatePaths.map((candidatePath) => {
        const candidate = candidateMap.get(candidatePath);
        if (!candidate) throw new Error(`Entropy source selection decision scope references an unauthorised candidate: ${candidatePath}`);
        return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
      }),
      executionAllowed: false,
      productionWriteAllowed: false,
    }));
    const targetIds = [...request.payload.scope.targetIds];
    const recomputedScopeHash = sha256(stableStringify({ targetIds, operations }));
    if (recomputedScopeHash !== request.payload.scope.recomputedScopeHash) {
      throw new Error('Entropy source selection decision scope does not exactly match the signed request');
    }
    scopeReview = {
      required: true,
      sourceSelectionRequestScopeHash: request.payload.scope.recomputedScopeHash,
      recomputedScopeHash,
      exactScopeMatch: true,
      operationCount: operations.length,
      candidateCount: candidates.length,
      operations,
    };
  }

  const payload = {
    schemaVersion: 1,
    decisionType: 'human_single_use_entropy_source_selection_request_decision',
    mode: 'entropy_source_selection_decision_record_only',
    authority: ENTROPY_SOURCE_SELECTION_DECISION_AUTHORITY,
    decision,
    status: decision === 'approve'
      ? ENTROPY_SOURCE_SELECTION_DECISION_STATUSES.APPROVED
      : ENTROPY_SOURCE_SELECTION_DECISION_STATUSES.REJECTED,
    sourceSelectionRequest: {
      id: request.id,
      recordHash: request.recordHash,
      payloadHash: request.payloadHash,
      entropyDecisionId: request.payload.entropyDecision.id,
      entropyRequestId: request.payload.entropyDecision.entropyRequestId,
      applicationId: request.payload.entropyDecision.applicationId,
      applicationFingerprint: request.payload.entropyDecision.applicationFingerprint,
      scopeHash: request.payload.scope.recomputedScopeHash,
      preflightSnapshotHash: request.payload.lastMomentPreflight.snapshotHash,
    },
    reviewer: { name: reviewerName, role: reviewerRole, note: reviewerNote },
    completedReviews,
    validityReview: {
      decisionAt: now.toISOString(),
      requestValidFrom: request.payload.validity.validFrom,
      requestExpiresAt: request.payload.validity.expiresAt,
      entropyRequestExpiresAt: request.payload.validity.entropyRequestExpiresAt,
      remainingSeconds,
      activeAtDecision,
      withinEntropyRequestWindow,
    },
    finalPreflight,
    scopeReview,
    selectionState: safeSelectionState(),
    targetIds: [...request.payload.scope.targetIds],
    productionFilePath: null,
    productionDestinationResolved: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    tokenIssued: false,
    executionTokenAvailable: false,
    nextAction: decision === 'approve'
      ? 'separate_entropy_source_binding_request_no_source_or_entropy_output'
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

  const appended = entropySourceSelectionDecisionStore.appendSigned(
    payload,
    options.entropySourceSelectionDecisionSigningKey,
    options.entropySourceSelectionDecisionSigningKeyId || 'production-execution-entropy-source-selection-decision-key',
  );
  auditLog.append('production_execution_entropy_source_selection_decision_signed', {
    entropySourceSelectionRequestId: request.id,
    entropySourceSelectionRequestRecordHash: request.recordHash,
    entropySourceSelectionDecisionId: appended.record.id,
    entropySourceSelectionDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    entropySourceSelected: false,
    providerSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
    tokenMaterialGenerated: false,
    tokenMaterialIssued: false,
    bearerSecretGenerated: false,
    bearerSecretIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, reviewerName);

  return {
    entropySourceSelectionDecisionId: appended.record.id,
    entropySourceSelectionDecisionRecordHash: appended.record.recordHash,
    entropySourceSelectionRequestId: request.id,
    decision,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    entropySourceSelected: false,
    providerSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
    tokenMaterialGenerated: false,
    tokenMaterialIssued: false,
    bearerSecretGenerated: false,
    bearerSecretIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    idempotent: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = { decideProductionExecutionEntropySourceSelection };
