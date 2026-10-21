'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { inspectCandidate } = require('./production-execution-plan-builder');
const { assertEntropySourceBindingRequestPayload } = require('./production-execution-entropy-source-binding-request-store');
const { assertEntropySourceBindingDecisionPayload } = require('./production-execution-entropy-source-binding-decision-store');
const {
  ENTROPY_PROVIDER_POLICY_REQUEST_STATUS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_REMAINING_SECONDS,
  REQUIRED_CHARACTERISTICS,
} = require('./production-execution-entropy-provider-policy-request-store');

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
function duration(value) {
  const parsed = Number(value == null ? 3 : value);
  if (!Number.isInteger(parsed) || parsed < MIN_DURATION_SECONDS || parsed > MAX_DURATION_SECONDS) {
    throw new TypeError(`durationSeconds must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`);
  }
  return parsed;
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
function providerPolicy() {
  return {
    policyRequested: true,
    sourceClassBound: true,
    boundSourceClass: 'operating_system_csprng',
    providerPolicyDefined: true,
    permittedProviderClass: 'local_operating_system_managed_csprng_interface',
    requiredCharacteristics: { ...REQUIRED_CHARACTERISTICS },
    providerSelectionRequired: true,
    providerSelected: false,
    providerName: null,
    implementationSelectionRequired: true,
    implementationSelected: false,
    implementationName: null,
    librarySelected: false,
    libraryName: null,
    apiSelected: false,
    apiName: null,
    deviceSelected: false,
    deviceName: null,
    syscallSelected: false,
    syscallName: null,
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

function requestProductionExecutionEntropyProviderPolicy(options = {}) {
  const {
    entropySourceBindingDecisionId,
    entropySourceBindingRequestStore,
    entropySourceBindingDecisionStore,
    entropyProviderPolicyRequestStore,
    auditLog,
    repositoryRoot,
    upstreamIntegrityChecks,
  } = options;
  if (typeof entropySourceBindingDecisionId !== 'string' || !entropySourceBindingDecisionId.trim()) {
    throw new TypeError('entropy provider policy request requires entropySourceBindingDecisionId');
  }
  if (!entropySourceBindingRequestStore || !entropySourceBindingDecisionStore
    || !entropyProviderPolicyRequestStore || !auditLog) {
    throw new TypeError('entropy provider policy request requires binding request, binding decision, policy request stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('repositoryRoot is required');
  assertSigningKey(options.entropySourceBindingRequestSigningKey);
  assertSigningKey(options.entropySourceBindingDecisionSigningKey);
  assertSigningKey(options.entropyProviderPolicyRequestSigningKey);
  verifyIntegrityChecks(upstreamIntegrityChecks);

  const bindingRequestVerification = entropySourceBindingRequestStore.verify(options.entropySourceBindingRequestSigningKey);
  if (!bindingRequestVerification.valid) throw new Error(`Entropy source binding request ledger verification failed: ${bindingRequestVerification.reason}`);
  const bindingDecisionVerification = entropySourceBindingDecisionStore.verify(options.entropySourceBindingDecisionSigningKey);
  if (!bindingDecisionVerification.valid) throw new Error(`Entropy source binding decision ledger verification failed: ${bindingDecisionVerification.reason}`);
  const policyVerification = entropyProviderPolicyRequestStore.verify(options.entropyProviderPolicyRequestSigningKey);
  if (!policyVerification.valid) throw new Error(`Entropy provider policy request ledger verification failed: ${policyVerification.reason}`);

  const requesterName = assertText(options.requesterName, 'requesterName', 3, 120);
  const requesterRole = assertText(options.requesterRole, 'requesterRole', 3, 120);
  const requesterNote = assertText(options.requesterNote, 'requesterNote', 10, 2000);
  const durationSeconds = duration(options.durationSeconds);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const now = asDate(clock());
  const nowMs = now.getTime();

  const decision = findRecord(
    entropySourceBindingDecisionStore,
    entropySourceBindingDecisionId.trim(),
    'Entropy source binding decision',
  );
  assertEntropySourceBindingDecisionPayload(decision.payload);
  if (decision.payload.decision !== 'approve'
    || decision.payload.status !== 'approved_entropy_source_binding_request_record_only'
    || decision.payload.readyForExecution !== false
    || decision.payload.executionAuthorityGranted !== false
    || decision.payload.authorisationGranted !== false
    || !decision.payload.finalPreflight.required
    || !decision.payload.finalPreflight.allMatchSourceBindingRequest
    || !decision.payload.scopeReview.required
    || !decision.payload.scopeReview.exactScopeMatch
    || decision.payload.bindingState.sourceClassBound !== true
    || decision.payload.bindingState.boundSourceClass !== 'operating_system_csprng'
    || decision.payload.bindingState.providerSelected !== false
    || decision.payload.bindingState.implementationSelected !== false
    || decision.payload.bindingState.entropyGenerated !== false) {
    throw new Error('Entropy provider policy request requires an approved, exact, class-only source binding decision');
  }

  const bindingRequest = findRecord(
    entropySourceBindingRequestStore,
    decision.payload.sourceBindingRequest.id,
    'Entropy source binding request',
  );
  assertEntropySourceBindingRequestPayload(bindingRequest.payload);
  if (bindingRequest.recordHash !== decision.payload.sourceBindingRequest.recordHash
    || bindingRequest.payloadHash !== decision.payload.sourceBindingRequest.payloadHash) {
    throw new Error('Entropy source binding request does not match the signed decision');
  }

  const existing = entropyProviderPolicyRequestStore.findBySourceBindingDecisionId(decision.id);
  if (existing) {
    const sameRequester = existing.payload.requester.name === requesterName
      && existing.payload.requester.role === requesterRole
      && existing.payload.requester.note === requesterNote;
    const sameDuration = existing.payload.validity.durationSeconds === durationSeconds;
    if (Date.parse(existing.payload.validity.expiresAt) <= nowMs) {
      throw new Error(`Expired entropy provider policy request cannot be renewed for decision: ${decision.id}`);
    }
    if (!sameRequester || !sameDuration) {
      throw new Error(`A different signed entropy provider policy request already exists for decision: ${decision.id}`);
    }
    return {
      entropyProviderPolicyRequestId: existing.id,
      entropyProviderPolicyRequestRecordHash: existing.recordHash,
      entropySourceBindingDecisionId: decision.id,
      permittedProviderClass: existing.payload.providerPolicy.permittedProviderClass,
      providerSelected: false,
      implementationSelected: false,
      entropyGenerated: false,
      entropyOutputProduced: false,
      candidateCount: existing.payload.lastMomentPreflight.candidates.length,
      operationCount: existing.payload.scope.operations.length,
      readyForExecution: false,
      executionAuthorityGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const bindingExpiresAtMs = Date.parse(bindingRequest.payload.validity.expiresAt);
  const selectionExpiresAtMs = Date.parse(bindingRequest.payload.validity.sourceSelectionRequestExpiresAt);
  const entropyExpiresAtMs = Date.parse(bindingRequest.payload.validity.entropyRequestExpiresAt);
  const decisionBindingExpiresAtMs = Date.parse(decision.payload.validityReview.requestExpiresAt);
  const active = nowMs < bindingExpiresAtMs && nowMs < selectionExpiresAtMs && nowMs < entropyExpiresAtMs
    && nowMs < decisionBindingExpiresAtMs;
  const minimumUpstreamExpiry = Math.min(bindingExpiresAtMs, selectionExpiresAtMs, entropyExpiresAtMs, decisionBindingExpiresAtMs);
  const remainingSeconds = Math.max(0, Math.floor((minimumUpstreamExpiry - nowMs) / 1000));
  if (!active || remainingSeconds < MIN_REMAINING_SECONDS) {
    throw new Error(`Entropy provider policy request requires active signed windows with at least ${MIN_REMAINING_SECONDS} second remaining`);
  }
  const expiresAtMs = nowMs + durationSeconds * 1000;
  if (expiresAtMs > minimumUpstreamExpiry) {
    throw new Error('Entropy provider policy request duration exceeds the approved upstream windows');
  }

  const decisionCandidates = decision.payload.finalPreflight.candidates.slice()
    .sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));
  const candidates = decisionCandidates.map((candidate) => {
    const current = inspectCandidate(repositoryRoot, candidate.proposedRepositoryPath, [], 20 * 1024 * 1024);
    if (!current.exists || current.currentSha256 !== candidate.currentSha256 || current.currentBytes !== candidate.currentBytes) {
      throw new Error(`Final entropy-provider-policy preflight does not match source binding decision: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      currentSha256: current.currentSha256,
      currentBytes: current.currentBytes,
      sourceBindingDecisionSha256: candidate.currentSha256,
      sourceBindingDecisionBytes: candidate.currentBytes,
      matchSourceBindingDecision: true,
      writeAllowed: false,
    };
  });
  const candidateMap = new Map(candidates.map((candidate) => [candidate.proposedRepositoryPath, candidate]));
  const operations = decision.payload.scopeReview.operations.map((operation) => ({
    sequence: operation.sequence,
    targetId: operation.targetId,
    operation: operation.operation,
    candidatePaths: [...operation.candidatePaths],
    candidateHashes: operation.candidatePaths.map((candidatePath) => {
      const candidate = candidateMap.get(candidatePath);
      if (!candidate) throw new Error(`Entropy provider policy scope references an unauthorised candidate: ${candidatePath}`);
      return { proposedRepositoryPath: candidatePath, sha256: candidate.currentSha256, bytes: candidate.currentBytes };
    }),
    executionAllowed: false,
    productionWriteAllowed: false,
  }));
  const targetIds = [...decision.payload.targetIds];
  const recomputedScopeHash = sha256(stableStringify({ targetIds, operations }));
  if (recomputedScopeHash !== decision.payload.scopeReview.recomputedScopeHash
    || recomputedScopeHash !== bindingRequest.payload.scope.recomputedScopeHash) {
    throw new Error('Entropy provider policy request scope does not exactly match the signed binding chain');
  }

  const payload = {
    schemaVersion: 1,
    requestType: 'single_use_entropy_provider_policy_request',
    mode: 'entropy_provider_policy_request_record_only',
    authority: 'single_use_entropy_provider_policy_request_only_no_provider_implementation_entropy_or_execution_authority',
    status: ENTROPY_PROVIDER_POLICY_REQUEST_STATUS,
    sourceBindingDecision: {
      id: decision.id,
      recordHash: decision.recordHash,
      payloadHash: decision.payloadHash,
      sourceBindingRequestId: bindingRequest.id,
      sourceSelectionDecisionId: decision.payload.sourceBindingRequest.sourceSelectionDecisionId,
      sourceSelectionRequestId: decision.payload.sourceBindingRequest.sourceSelectionRequestId,
      entropyDecisionId: decision.payload.sourceBindingRequest.entropyDecisionId,
      entropyRequestId: decision.payload.sourceBindingRequest.entropyRequestId,
      applicationId: decision.payload.sourceBindingRequest.applicationId,
      applicationFingerprint: decision.payload.sourceBindingRequest.applicationFingerprint,
      scopeHash: decision.payload.scopeReview.recomputedScopeHash,
      preflightSnapshotHash: decision.payload.finalPreflight.snapshotHash,
    },
    requester: { name: requesterName, role: requesterRole, note: requesterNote },
    validity: {
      requestedAt: now.toISOString(),
      validFrom: now.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      durationSeconds,
      sourceBindingRequestExpiresAt: bindingRequest.payload.validity.expiresAt,
      sourceSelectionRequestExpiresAt: bindingRequest.payload.validity.sourceSelectionRequestExpiresAt,
      entropyRequestExpiresAt: bindingRequest.payload.validity.entropyRequestExpiresAt,
      timeLimited: true,
      singleUsePolicyRequested: true,
      expiredAtCreation: false,
    },
    providerPolicy: providerPolicy(),
    lastMomentPreflight: {
      verifiedAt: now.toISOString(),
      snapshotHash: sha256(stableStringify(candidates)),
      allMatchSourceBindingDecision: true,
      candidates,
    },
    scope: {
      scopeType: 'source_binding_decision_bound_candidate_paths_and_operations_only',
      sourceBindingRequestScopeHash: bindingRequest.payload.scope.recomputedScopeHash,
      sourceBindingDecisionScopeHash: decision.payload.scopeReview.recomputedScopeHash,
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
    nextAction: 'separate_human_entropy_provider_policy_decision_no_provider_implementation_or_entropy_output',
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

  const appended = entropyProviderPolicyRequestStore.appendSigned(
    payload,
    options.entropyProviderPolicyRequestSigningKey,
    options.entropyProviderPolicyRequestSigningKeyId || 'production-execution-entropy-provider-policy-request-key',
  );
  auditLog.append('production_execution_entropy_provider_policy_request_signed', {
    entropySourceBindingDecisionId: decision.id,
    entropyProviderPolicyRequestId: appended.record.id,
    entropyProviderPolicyRequestRecordHash: appended.record.recordHash,
    permittedProviderClass: payload.providerPolicy.permittedProviderClass,
    providerSelected: false,
    implementationSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
    candidateCount: candidates.length,
    operationCount: operations.length,
    readyForExecution: false,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, requesterName);

  return {
    entropyProviderPolicyRequestId: appended.record.id,
    entropyProviderPolicyRequestRecordHash: appended.record.recordHash,
    entropySourceBindingDecisionId: decision.id,
    permittedProviderClass: payload.providerPolicy.permittedProviderClass,
    providerSelected: false,
    implementationSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
    candidateCount: candidates.length,
    operationCount: operations.length,
    expiresAt: payload.validity.expiresAt,
    readyForExecution: false,
    executionAuthorityGranted: false,
    idempotent: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = {
  requestProductionExecutionEntropyProviderPolicy,
  providerPolicy,
};
