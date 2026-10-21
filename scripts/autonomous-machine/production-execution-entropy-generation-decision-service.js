'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { assertEntropyGenerationRequestPayload } = require('./production-execution-entropy-generation-request-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  ENTROPY_GENERATION_DECISION_AUTHORITY,
  ENTROPY_GENERATION_DECISION_STATUSES,
  MIN_REMAINING_SECONDS,
  REVIEW_FIELDS,
} = require('./production-execution-entropy-generation-decision-store');

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
  return { required: false, verifiedAt: null, snapshotHash: null, allMatchEntropyRequest: false, candidates: [] };
}
function emptyScopeReview() {
  return { required: false, entropyRequestScopeHash: null, recomputedScopeHash: null, exactScopeMatch: false, operationCount: 0, candidateCount: 0, operations: [] };
}
function findRecord(store, id, label) {
  const record = store.readRecords().find((item) => item.id === id);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}
function verifyIntegrityChecks(checks) {
  if (!Array.isArray(checks) || checks.length < 1) throw new TypeError('upstreamIntegrityChecks must be a non-empty array');
  for (const item of checks) {
    if (!item || typeof item !== 'object' || !item.store || typeof item.label !== 'string') throw new TypeError('upstreamIntegrityChecks entries require label and store');
    assertSigningKey(item.signingKey);
    const result = item.store.verify(item.signingKey);
    if (!result.valid) throw new Error(`${item.label} ledger verification failed: ${result.reason}`);
  }
}
function decideProductionExecutionEntropyGeneration(options = {}) {
  const { entropyGenerationRequestId, entropyGenerationRequestStore, entropyGenerationDecisionStore, auditLog, repositoryRoot, upstreamIntegrityChecks } = options;
  if (typeof entropyGenerationRequestId !== 'string' || !entropyGenerationRequestId.trim()) throw new TypeError('entropy generation decision requires entropyGenerationRequestId');
  if (!entropyGenerationRequestStore || !entropyGenerationDecisionStore || !auditLog) throw new TypeError('entropy generation decision requires request store, decision store and auditLog');
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');
  assertSigningKey(options.entropyGenerationRequestSigningKey);
  assertSigningKey(options.entropyGenerationDecisionSigningKey);
  verifyIntegrityChecks(upstreamIntegrityChecks);
  const requestVerification = entropyGenerationRequestStore.verify(options.entropyGenerationRequestSigningKey);
  if (!requestVerification.valid) throw new Error(`Entropy generation request ledger verification failed: ${requestVerification.reason}`);
  const decisionVerification = entropyGenerationDecisionStore.verify(options.entropyGenerationDecisionSigningKey);
  if (!decisionVerification.valid) throw new Error(`Entropy generation decision ledger verification failed: ${decisionVerification.reason}`);

  const decision = options.decision;
  if (!['approve', 'reject'].includes(decision)) throw new TypeError('decision must be approve or reject');
  const reviewerName = assertText(options.reviewerName, 'reviewerName', 3, 120);
  const reviewerRole = assertText(options.reviewerRole, 'reviewerRole', 3, 120);
  const reviewerNote = assertText(options.reviewerNote, 'reviewerNote', 10, 2000);
  const completedReviews = normaliseReviews(options.completedReviews);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const now = asDate(clock());
  const nowMs = now.getTime();

  const entropyRequest = findRecord(entropyGenerationRequestStore, entropyGenerationRequestId.trim(), 'Entropy generation request');
  assertEntropyGenerationRequestPayload(entropyRequest.payload);
  const existing = entropyGenerationDecisionStore.findByEntropyRequestId(entropyRequest.id);
  if (existing) {
    const sameReviewer = existing.payload.reviewer.name === reviewerName && existing.payload.reviewer.role === reviewerRole && existing.payload.reviewer.note === reviewerNote;
    const sameReviews = stableStringify(existing.payload.completedReviews) === stableStringify(completedReviews);
    if (existing.payload.decision !== decision || !sameReviewer || !sameReviews) throw new Error(`A different signed entropy generation decision already exists for request: ${entropyRequest.id}`);
    return {
      entropyGenerationDecisionId: existing.id,
      entropyGenerationDecisionRecordHash: existing.recordHash,
      entropyGenerationRequestId: entropyRequest.id,
      decision,
      entropySourceSelected: false,
      entropyGenerated: false,
      entropyOutputProduced: false,
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

  const validFromMs = Date.parse(entropyRequest.payload.validity.validFrom);
  const expiresAtMs = Date.parse(entropyRequest.payload.validity.expiresAt);
  const activeAtDecision = nowMs >= validFromMs && nowMs < expiresAtMs;
  const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
  if (decision === 'approve') {
    if (!activeAtDecision || remainingSeconds < MIN_REMAINING_SECONDS) throw new Error(`Approval requires an active entropy generation request with at least ${MIN_REMAINING_SECONDS} seconds remaining`);
    for (const [field, complete] of Object.entries(completedReviews)) {
      if (!complete) throw new Error(`Approval requires completed ${field}`);
    }
  }

  let finalPreflight = emptyPreflight();
  let scopeReview = emptyScopeReview();
  if (decision === 'approve') {
    const requestCandidates = entropyRequest.payload.lastMomentPreflight.candidates.slice().sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
    const candidates = requestCandidates.map((candidate) => {
      const current = inspectCandidate(repositoryRoot, candidate.proposedRepositoryPath, [], 20 * 1024 * 1024);
      if (!current.exists || current.currentSha256 !== candidate.currentSha256 || current.currentBytes !== candidate.currentBytes) {
        throw new Error(`Final entropy-decision preflight does not match request: ${candidate.proposedRepositoryPath}`);
      }
      return {
        proposedRepositoryPath: candidate.proposedRepositoryPath,
        currentSha256: current.currentSha256,
        currentBytes: current.currentBytes,
        entropyRequestSha256: candidate.currentSha256,
        entropyRequestBytes: candidate.currentBytes,
        matchEntropyRequest: true,
        writeAllowed: false,
      };
    });
    finalPreflight = { required: true, verifiedAt: now.toISOString(), snapshotHash: sha256(stableStringify(candidates)), allMatchEntropyRequest: true, candidates };
    const operations = entropyRequest.payload.scope.operations.map((operation) => ({
      sequence: operation.sequence,
      targetId: operation.targetId,
      operation: operation.operation,
      candidatePaths: [...operation.candidatePaths],
      candidateHashes: operation.candidatePaths.map((candidatePath) => {
        const candidate = candidates.find((item) => item.proposedRepositoryPath === candidatePath);
        if (!candidate) throw new Error(`Entropy decision scope references an unauthorised candidate: ${candidatePath}`);
        return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
      }),
      executionAllowed: false,
      productionWriteAllowed: false,
    }));
    const targetIds = [...entropyRequest.payload.scope.targetIds];
    const recomputedScopeHash = sha256(stableStringify({ targetIds, operations }));
    if (recomputedScopeHash !== entropyRequest.payload.scope.recomputedScopeHash) throw new Error('Entropy generation decision scope does not exactly match the signed request');
    scopeReview = { required: true, entropyRequestScopeHash: entropyRequest.payload.scope.recomputedScopeHash, recomputedScopeHash, exactScopeMatch: true, operationCount: operations.length, candidateCount: candidates.length, operations };
  }

  const payload = {
    schemaVersion: 1,
    decisionType: 'human_single_use_entropy_generation_request_decision',
    mode: 'entropy_generation_decision_record_only',
    authority: ENTROPY_GENERATION_DECISION_AUTHORITY,
    decision,
    status: decision === 'approve' ? ENTROPY_GENERATION_DECISION_STATUSES.APPROVED : ENTROPY_GENERATION_DECISION_STATUSES.REJECTED,
    entropyRequest: {
      id: entropyRequest.id,
      recordHash: entropyRequest.recordHash,
      payloadHash: entropyRequest.payloadHash,
      generationDecisionId: entropyRequest.payload.generationDecision.id,
      applicationId: entropyRequest.payload.generationDecision.applicationId,
      applicationFingerprint: entropyRequest.payload.generationDecision.applicationFingerprint,
      scopeHash: entropyRequest.payload.scope.recomputedScopeHash,
      preflightSnapshotHash: entropyRequest.payload.lastMomentPreflight.snapshotHash,
    },
    reviewer: { name: reviewerName, role: reviewerRole, note: reviewerNote },
    completedReviews,
    validityReview: { decisionAt: now.toISOString(), requestValidFrom: entropyRequest.payload.validity.validFrom, requestExpiresAt: entropyRequest.payload.validity.expiresAt, remainingSeconds, activeAtDecision },
    finalPreflight,
    scopeReview,
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
    targetIds: [...entropyRequest.payload.scope.targetIds],
    productionFilePath: null,
    productionDestinationResolved: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    tokenIssued: false,
    executionTokenAvailable: false,
    nextAction: decision === 'approve' ? 'separate_entropy_source_selection_request_no_entropy_output_or_execution' : 'none',
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

  const appended = entropyGenerationDecisionStore.appendSigned(payload, options.entropyGenerationDecisionSigningKey, options.entropyGenerationDecisionSigningKeyId || 'production-execution-entropy-generation-decision-key');
  auditLog.append('production_execution_entropy_generation_decision_signed', {
    entropyGenerationRequestId: entropyRequest.id,
    entropyGenerationRequestRecordHash: entropyRequest.recordHash,
    entropyGenerationDecisionId: appended.record.id,
    entropyGenerationDecisionRecordHash: appended.record.recordHash,
    decision,
    reviewerName,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    entropySourceSelected: false,
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
    entropyGenerationDecisionId: appended.record.id,
    entropyGenerationDecisionRecordHash: appended.record.recordHash,
    entropyGenerationRequestId: entropyRequest.id,
    decision,
    candidateCount: finalPreflight.candidates.length,
    operationCount: scopeReview.operations.length,
    entropySourceSelected: false,
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

module.exports = { decideProductionExecutionEntropyGeneration };