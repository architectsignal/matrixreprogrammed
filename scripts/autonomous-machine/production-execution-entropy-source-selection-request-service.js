'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { assertEntropyGenerationRequestPayload } = require('./production-execution-entropy-generation-request-store');
const { assertEntropyGenerationDecisionPayload } = require('./production-execution-entropy-generation-decision-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  ENTROPY_SOURCE_SELECTION_REQUEST_AUTHORITY,
  ENTROPY_SOURCE_SELECTION_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
} = require('./production-execution-entropy-source-selection-request-store');

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
function findRecord(store, id, label) {
  const record = store.readRecords().find((item) => item.id === id);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}
function verifyLedger(label, store, signingKey) {
  const result = store.verify(signingKey);
  if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
}
function assertRawOperationScope(operations, targetIds) {
  if (!Array.isArray(operations) || operations.length < 1
    || !Array.isArray(targetIds) || targetIds.length < 1
    || new Set(targetIds).size !== targetIds.length) {
    throw new Error('Entropy source selection scope does not exactly match the signed decision and request');
  }
  const operationTargets = new Set();
  operations.forEach((operation, index) => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)
      || operation.sequence !== index + 1
      || typeof operation.targetId !== 'string' || !operation.targetId
      || operation.operation !== 'manual_review_and_integrate_evidence'
      || !Array.isArray(operation.candidatePaths) || operation.candidatePaths.length < 1
      || new Set(operation.candidatePaths).size !== operation.candidatePaths.length
      || !Array.isArray(operation.candidateHashes)
      || operation.candidateHashes.length !== operation.candidatePaths.length
      || operation.executionAllowed !== false
      || operation.productionWriteAllowed !== false) {
      throw new Error('Entropy source selection scope does not exactly match the signed decision and request');
    }
    operationTargets.add(operation.targetId);
    operation.candidatePaths.forEach((candidatePath, candidateIndex) => {
      const candidateHash = operation.candidateHashes[candidateIndex];
      if (typeof candidatePath !== 'string' || !candidatePath
        || !candidateHash || candidateHash.proposedRepositoryPath !== candidatePath
        || typeof candidateHash.sha256 !== 'string'
        || !/^[0-9a-f]{64}$/i.test(candidateHash.sha256)
        || !Number.isInteger(candidateHash.bytes) || candidateHash.bytes < 0) {
        throw new Error('Entropy source selection scope does not exactly match the signed decision and request');
      }
    });
  });
  if (operationTargets.size !== targetIds.length
    || targetIds.some((targetId) => !operationTargets.has(targetId))) {
    throw new Error('Entropy source selection scope does not exactly match the signed decision and request');
  }
}

function requestProductionExecutionEntropySourceSelection(options = {}) {
  const {
    entropyGenerationDecisionId,
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
    entropyGenerationDecisionStore,
    entropySourceSelectionRequestStore,
    auditLog,
    repositoryRoot,
  } = options;

  if (typeof entropyGenerationDecisionId !== 'string' || !entropyGenerationDecisionId.trim()) {
    throw new TypeError('entropy source selection request requires entropyGenerationDecisionId');
  }
  const requiredStores = [
    changeRequestStore, changeDecisionStore, planStore, planDecisionStore,
    authorisationRequestStore, authorisationDecisionStore, tokenRequestStore, tokenDecisionStore,
    tokenIssuanceRequestStore, tokenIssuanceDecisionStore,
    tokenMaterialGenerationRequestStore, tokenMaterialGenerationDecisionStore,
    entropyGenerationRequestStore, entropyGenerationDecisionStore, entropySourceSelectionRequestStore,
  ];
  if (requiredStores.some((store) => !store) || !auditLog) {
    throw new TypeError('entropy source selection request requires all stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');

  const keyFields = [
    'changeRequestSigningKey', 'changeDecisionSigningKey', 'planSigningKey', 'planDecisionSigningKey',
    'authorisationRequestSigningKey', 'authorisationDecisionSigningKey',
    'tokenRequestSigningKey', 'tokenDecisionSigningKey',
    'tokenIssuanceRequestSigningKey', 'tokenIssuanceDecisionSigningKey',
    'tokenMaterialGenerationRequestSigningKey', 'tokenMaterialGenerationDecisionSigningKey',
    'entropyGenerationRequestSigningKey', 'entropyGenerationDecisionSigningKey',
    'entropySourceSelectionRequestSigningKey',
  ];
  keyFields.forEach((field) => assertSigningKey(options[field]));

  const requesterName = assertText(options.requesterName, 'requesterName', 3, 120);
  const requesterRole = assertText(options.requesterRole, 'requesterRole', 3, 120);
  const requesterNote = assertText(options.requesterNote, 'requesterNote', 10, 2000);
  const durationSeconds = options.durationSeconds === undefined || options.durationSeconds === null
    ? 6 : Number(options.durationSeconds);
  if (!Number.isInteger(durationSeconds)
    || durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
    throw new TypeError(`durationSeconds must be an integer between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`);
  }
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const now = asDate(clock());
  const nowMs = now.getTime();

  [
    ['Production change request', changeRequestStore, options.changeRequestSigningKey],
    ['Production change decision', changeDecisionStore, options.changeDecisionSigningKey],
    ['Production execution plan', planStore, options.planSigningKey],
    ['Production execution plan decision', planDecisionStore, options.planDecisionSigningKey],
    ['Execution authorisation request', authorisationRequestStore, options.authorisationRequestSigningKey],
    ['Execution authorisation decision', authorisationDecisionStore, options.authorisationDecisionSigningKey],
    ['Execution token request', tokenRequestStore, options.tokenRequestSigningKey],
    ['Execution token decision', tokenDecisionStore, options.tokenDecisionSigningKey],
    ['Execution token issuance request', tokenIssuanceRequestStore, options.tokenIssuanceRequestSigningKey],
    ['Execution token issuance decision', tokenIssuanceDecisionStore, options.tokenIssuanceDecisionSigningKey],
    ['Token material generation request', tokenMaterialGenerationRequestStore, options.tokenMaterialGenerationRequestSigningKey],
    ['Token material generation decision', tokenMaterialGenerationDecisionStore, options.tokenMaterialGenerationDecisionSigningKey],
    ['Entropy generation request', entropyGenerationRequestStore, options.entropyGenerationRequestSigningKey],
    ['Entropy generation decision', entropyGenerationDecisionStore, options.entropyGenerationDecisionSigningKey],
    ['Entropy source selection request', entropySourceSelectionRequestStore, options.entropySourceSelectionRequestSigningKey],
  ].forEach(([label, store, key]) => verifyLedger(label, store, key));

  const entropyDecision = findRecord(
    entropyGenerationDecisionStore,
    entropyGenerationDecisionId.trim(),
    'Entropy generation decision',
  );
  assertEntropyGenerationDecisionPayload(entropyDecision.payload);
  if (entropyDecision.payload.decision !== 'approve'
    || entropyDecision.payload.status !== 'approved_entropy_generation_request_record_only'
    || entropyDecision.payload.readyForExecution !== false
    || entropyDecision.payload.executionAuthorityGranted !== false
    || entropyDecision.payload.authorisationGranted !== false
    || entropyDecision.payload.entropyState.entropySourceSelected !== false
    || entropyDecision.payload.entropyState.entropyGenerated !== false
    || entropyDecision.payload.entropyState.entropyOutput !== null
    || entropyDecision.payload.entropyState.entropyDigest !== null) {
    throw new Error('Entropy source selection request requires an approved, non-executing Phase 1.19 decision with no entropy output');
  }

  const existing = entropySourceSelectionRequestStore.findByEntropyDecisionId(entropyDecision.id);
  if (existing) {
    const sameRequester = existing.payload.requester.name === requesterName
      && existing.payload.requester.role === requesterRole
      && existing.payload.requester.note === requesterNote;
    const sameDuration = existing.payload.validity.durationSeconds === durationSeconds;
    if (!sameRequester || !sameDuration) {
      throw new Error(`A different signed entropy source selection request already exists for decision: ${entropyDecision.id}`);
    }
    if (nowMs >= Date.parse(existing.payload.validity.expiresAt)) {
      throw new Error('Expired entropy source selection request cannot be silently renewed');
    }
    return {
      entropySourceSelectionRequestId: existing.id,
      entropySourceSelectionRequestRecordHash: existing.recordHash,
      entropyGenerationDecisionId: entropyDecision.id,
      sourceSelectionRequested: true,
      entropySourceSelected: false,
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

  const entropyRequest = findRecord(
    entropyGenerationRequestStore,
    entropyDecision.payload.entropyRequest.id,
    'Entropy generation request',
  );
  assertEntropyGenerationRequestPayload(entropyRequest.payload);
  if (entropyRequest.recordHash !== entropyDecision.payload.entropyRequest.recordHash
    || entropyRequest.payloadHash !== entropyDecision.payload.entropyRequest.payloadHash
    || entropyRequest.payload.entropyState.entropySourceSelected !== false
    || entropyRequest.payload.entropyState.entropyGenerated !== false
    || entropyRequest.payload.entropyState.entropyOutput !== null) {
    throw new Error('Entropy source selection request entropy-request binding is invalid');
  }

  const entropyRequestExpiresAtMs = Date.parse(entropyRequest.payload.validity.expiresAt);
  const remainingSeconds = Math.floor((entropyRequestExpiresAtMs - nowMs) / 1000);
  if (nowMs < Date.parse(entropyRequest.payload.validity.validFrom)
    || nowMs >= entropyRequestExpiresAtMs || remainingSeconds < MIN_REMAINING_SECONDS) {
    throw new Error(`Entropy source selection request requires at least ${MIN_REMAINING_SECONDS} seconds in the active entropy request window`);
  }
  if (durationSeconds > remainingSeconds) {
    throw new Error('Entropy source selection request duration exceeds remaining signed window');
  }
  if (!entropyDecision.payload.finalPreflight.required
    || !entropyDecision.payload.finalPreflight.allMatchEntropyRequest
    || !entropyDecision.payload.scopeReview.required
    || !entropyDecision.payload.scopeReview.exactScopeMatch) {
    throw new Error('Entropy source selection request requires complete Phase 1.19 preflight and scope review');
  }

  const targetIds = [...entropyDecision.payload.targetIds];
  assertRawOperationScope(entropyDecision.payload.scopeReview.operations, targetIds);

  const candidates = entropyDecision.payload.finalPreflight.candidates.map((candidate) => {
    const current = inspectCandidate(repositoryRoot, candidate.proposedRepositoryPath);
    if (!current.exists
      || current.currentSha256 !== candidate.currentSha256
      || current.currentBytes !== candidate.currentBytes) {
      throw new Error(`Last-moment entropy source selection preflight failed: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      currentSha256: current.currentSha256,
      currentBytes: current.currentBytes,
      entropyDecisionSha256: candidate.currentSha256,
      entropyDecisionBytes: candidate.currentBytes,
      matchEntropyDecision: true,
      writeAllowed: false,
    };
  });
  const candidateMap = new Map(candidates.map((candidate) => [candidate.proposedRepositoryPath, candidate]));
  const operations = entropyDecision.payload.scopeReview.operations.map((operation, index) => ({
    sequence: index + 1,
    targetId: operation.targetId,
    operation: operation.operation,
    candidatePaths: [...operation.candidatePaths],
    candidateHashes: operation.candidatePaths.map((candidatePath) => {
      const candidate = candidateMap.get(candidatePath);
      if (!candidate) throw new Error('Entropy source selection scope does not exactly match the signed decision and request');
      return {
        proposedRepositoryPath: candidatePath,
        sha256: candidate.currentSha256,
        bytes: candidate.currentBytes,
      };
    }),
    executionAllowed: false,
    productionWriteAllowed: false,
  }));
  const recomputedScopeHash = sha256(stableStringify({ targetIds, operations }));
  if (recomputedScopeHash !== entropyDecision.payload.scopeReview.recomputedScopeHash
    || recomputedScopeHash !== entropyDecision.payload.scopeReview.entropyRequestScopeHash
    || recomputedScopeHash !== entropyRequest.payload.scope.recomputedScopeHash) {
    throw new Error('Entropy source selection scope does not exactly match the signed decision and request');
  }

  const requestedAt = now.toISOString();
  const expiresAt = new Date(nowMs + durationSeconds * 1000).toISOString();
  const payload = {
    schemaVersion: 1,
    requestType: 'single_use_entropy_source_selection_request',
    mode: 'entropy_source_selection_request_record_only',
    authority: ENTROPY_SOURCE_SELECTION_REQUEST_AUTHORITY,
    status: ENTROPY_SOURCE_SELECTION_REQUEST_STATUS,
    entropyDecision: {
      id: entropyDecision.id,
      entropyRequestId: entropyRequest.id,
      recordHash: entropyDecision.recordHash,
      payloadHash: entropyDecision.payloadHash,
      applicationId: entropyDecision.payload.entropyRequest.applicationId,
      applicationFingerprint: entropyDecision.payload.entropyRequest.applicationFingerprint,
      scopeHash: recomputedScopeHash,
      preflightSnapshotHash: entropyDecision.payload.finalPreflight.snapshotHash,
    },
    requester: { name: requesterName, role: requesterRole, note: requesterNote },
    validity: {
      requestedAt,
      validFrom: requestedAt,
      expiresAt,
      entropyRequestExpiresAt: entropyRequest.payload.validity.expiresAt,
      durationSeconds,
      timeLimited: true,
      singleUseSourceSelectionRequested: true,
      expiredAtCreation: false,
    },
    selectionState: {
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
    },
    lastMomentPreflight: {
      verifiedAt: requestedAt,
      snapshotHash: sha256(stableStringify(candidates)),
      allMatchEntropyDecision: true,
      candidates,
    },
    scope: {
      scopeType: 'entropy_decision_bound_candidate_paths_and_operations_only',
      entropyRequestScopeHash: recomputedScopeHash,
      entropyDecisionScopeHash: recomputedScopeHash,
      recomputedScopeHash,
      exactScopeMatch: true,
      targetIds,
      operationCount: operations.length,
      candidateCount: candidates.length,
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
    nextAction: 'separate_human_entropy_source_selection_decision_no_source_or_entropy_output',
    safety: {
      productionTarget: null,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
      productionWriteAllowed: false,
      executionAllowed: false,
      commitAllowed: false,
      deploymentAllowed: false,
      publicationAllowed: false,
    },
  };

  const appended = entropySourceSelectionRequestStore.appendSigned(
    payload,
    options.entropySourceSelectionRequestSigningKey,
    options.entropySourceSelectionRequestSigningKeyId
      || 'production-execution-entropy-source-selection-request-key',
  );
  auditLog.append('entropy_source_selection_request_created', {
    entropySourceSelectionRequestId: appended.record.id,
    entropyGenerationDecisionId: entropyDecision.id,
    sourceSelectionRequested: true,
    entropySourceSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
    tokenMaterialGenerated: false,
    tokenMaterialIssued: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, requesterName);

  return {
    entropySourceSelectionRequestId: appended.record.id,
    entropySourceSelectionRequestRecordHash: appended.record.recordHash,
    entropyGenerationDecisionId: entropyDecision.id,
    expiresAt,
    candidateCount: candidates.length,
    operationCount: operations.length,
    sourceSelectionRequested: true,
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

module.exports = { requestProductionExecutionEntropySourceSelection };
