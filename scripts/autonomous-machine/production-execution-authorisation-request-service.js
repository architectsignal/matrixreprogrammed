'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { stableStringify, sha256 } = require('./route-registry');
const { assertChangeRequestPayload } = require('./production-change-request-store');
const { assertDecisionPayload } = require('./production-change-decision-store');
const { assertExecutionPlanPayload } = require('./production-execution-plan-store');
const { assertExecutionPlanDecisionPayload } = require('./production-execution-plan-decision-store');
const { inspectCandidate } = require('./production-execution-plan-builder');
const {
  EXECUTION_AUTHORISATION_REQUEST_AUTHORITY,
  EXECUTION_AUTHORISATION_REQUEST_STATUS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
} = require('./production-execution-authorisation-request-store');

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
  const duration = value === undefined ? 900 : value;
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new TypeError(`durationSeconds must be an integer between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`);
  }
  return duration;
}

function normaliseFreshHashMaxAge(value, durationSeconds) {
  const maxAge = value === undefined ? Math.min(300, durationSeconds) : value;
  if (!Number.isInteger(maxAge) || maxAge < 30 || maxAge > durationSeconds) {
    throw new TypeError('freshHashMaxAgeSeconds must be an integer between 30 and durationSeconds');
  }
  return maxAge;
}

function collectUniqueCandidates(planPayload) {
  const byPath = new Map();
  let candidateReferenceCount = 0;
  for (const mapping of planPayload.targetMappings) {
    for (const candidate of mapping.candidates) {
      candidateReferenceCount += 1;
      if (candidate.exists !== true || candidate.regularFile !== true || candidate.symlink !== false
        || typeof candidate.currentSha256 !== 'string' || !Number.isInteger(candidate.currentBytes)) {
        throw new Error(`Execution authorisation request requires an existing signed candidate: ${candidate.proposedRepositoryPath}`);
      }
      const current = byPath.get(candidate.proposedRepositoryPath);
      if (current) {
        if (current.originalSha256 !== candidate.currentSha256 || current.originalBytes !== candidate.currentBytes) {
          throw new Error(`Signed plan contains inconsistent snapshots for candidate: ${candidate.proposedRepositoryPath}`);
        }
        current.targetIds.add(mapping.targetId);
        candidate.roles.forEach((role) => current.roles.add(role));
      } else {
        byPath.set(candidate.proposedRepositoryPath, {
          proposedRepositoryPath: candidate.proposedRepositoryPath,
          originalSha256: candidate.currentSha256,
          originalBytes: candidate.currentBytes,
          targetIds: new Set([mapping.targetId]),
          roles: new Set(candidate.roles),
        });
      }
    }
  }
  return {
    candidateReferenceCount,
    candidates: [...byPath.values()].sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath)),
  };
}

function buildRollbackPackage(candidates, custodianName, custodianNote) {
  const entries = candidates.map((candidate) => ({
    proposedRepositoryPath: candidate.proposedRepositoryPath,
    targetIds: candidate.targetIds,
    preExecutionSha256: candidate.currentSha256,
    preExecutionBytes: candidate.currentBytes,
    backupArtifactPath: null,
    backupArtifactSha256: null,
    backupCreated: false,
    restoreAction: 'restore_exact_pre_execution_bytes_from_verified_external_backup',
    restoreVerification: 'sha256_must_match_pre_execution_snapshot',
    writeAllowed: false,
  }));
  const custodian = { name: custodianName, note: custodianNote };
  const steps = [
    'create_external_backup_for_each_candidate_before_any_write',
    'record_backup_artifact_sha256_and_storage_location',
    'perform_restore_rehearsal_in_disposable_workspace',
    'verify_restored_sha256_matches_pre_execution_snapshot',
    'obtain_separate_manual_execution_authorisation_decision',
  ];
  return {
    packageType: 'pre_execution_rollback_manifest_only',
    status: 'external_verified_backup_required_before_execution',
    custodian,
    uniqueCandidateCount: entries.length,
    backupsCreated: 0,
    externalVerifiedBackupRequired: true,
    restoreTestRequired: true,
    packageComplete: false,
    entries,
    steps,
    manifestHash: sha256(stableStringify({ custodian, entries, steps })),
  };
}

function requestProductionExecutionAuthorisation(options = {}) {
  const {
    executionPlanDecisionId,
    requestStore,
    changeDecisionStore,
    planStore,
    planDecisionStore,
    authorisationRequestStore,
    auditLog,
    repositoryRoot,
  } = options;
  if (typeof executionPlanDecisionId !== 'string' || !executionPlanDecisionId.trim()) {
    throw new TypeError('execution authorisation request requires executionPlanDecisionId');
  }
  if (!requestStore || !changeDecisionStore || !planStore || !planDecisionStore || !authorisationRequestStore || !auditLog) {
    throw new TypeError('execution authorisation request requires all signed stores and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('execution authorisation request requires repositoryRoot');
  assertSigningKey(options.requestSigningKey);
  assertSigningKey(options.changeDecisionSigningKey);
  assertSigningKey(options.planSigningKey);
  assertSigningKey(options.planDecisionSigningKey);
  assertSigningKey(options.authorisationRequestSigningKey);

  const requesterName = assertText(options.requesterName, 'requesterName', 3, 120);
  const requesterRole = assertText(options.requesterRole, 'requesterRole', 3, 120);
  const requesterNote = assertText(options.requesterNote, 'requesterNote', 10, 2000);
  const rollbackCustodianName = assertText(options.rollbackCustodianName, 'rollbackCustodianName', 3, 120);
  const rollbackCustodianNote = assertText(options.rollbackCustodianNote, 'rollbackCustodianNote', 10, 2000);
  const durationSeconds = normaliseDuration(options.durationSeconds);
  const freshHashMaxAgeSeconds = normaliseFreshHashMaxAge(options.freshHashMaxAgeSeconds, durationSeconds);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const now = asDate(clock());

  const integrityChecks = [
    ['Production change request', requestStore.verify(options.requestSigningKey)],
    ['Production change decision', changeDecisionStore.verify(options.changeDecisionSigningKey)],
    ['Production execution plan', planStore.verify(options.planSigningKey)],
    ['Production execution plan decision', planDecisionStore.verify(options.planDecisionSigningKey)],
    ['Execution authorisation request', authorisationRequestStore.verify(options.authorisationRequestSigningKey)],
  ];
  for (const [label, result] of integrityChecks) {
    if (!result.valid) throw new Error(`${label} ledger verification failed: ${result.reason}`);
  }

  const planDecision = planDecisionStore.readRecords().find((record) => record.id === executionPlanDecisionId.trim());
  if (!planDecision) throw new Error(`Approved execution plan decision not found: ${executionPlanDecisionId}`);
  assertExecutionPlanDecisionPayload(planDecision.payload);
  if (planDecision.payload.decision !== 'approve'
    || planDecision.payload.status !== 'approved_mapping_and_plan_record_only'
    || planDecision.payload.readyForExecution !== false
    || planDecision.payload.executionAuthorityGranted !== false
    || planDecision.payload.mappingSummary.allCandidatesPresent !== true
    || planDecision.payload.mappingSummary.missingCandidateCount !== 0) {
    throw new Error('Execution authorisation request requires an approved, complete, non-executing Phase 1.9 decision');
  }
  for (const [field, complete] of Object.entries(planDecision.payload.completedReviews)) {
    if (complete !== true) throw new Error(`Execution authorisation request requires completed ${field}`);
  }

  const plan = planStore.readRecords().find((record) => record.id === planDecision.payload.executionPlan.id);
  if (!plan) throw new Error(`Production execution plan not found for decision: ${planDecision.payload.executionPlan.id}`);
  assertExecutionPlanPayload(plan.payload);
  if (plan.recordHash !== planDecision.payload.executionPlan.recordHash
    || plan.payloadHash !== planDecision.payload.executionPlan.payloadHash) {
    throw new Error('Execution authorisation request plan hashes do not match the approved Phase 1.9 decision');
  }
  if (sha256(stableStringify(plan.payload.targetMappings)) !== planDecision.payload.executionPlan.candidateSnapshotHash
    || sha256(stableStringify(plan.payload.executionPlan.steps)) !== planDecision.payload.executionPlan.executionStepsHash) {
    throw new Error('Execution authorisation request plan snapshots do not match the approved Phase 1.9 decision');
  }

  const changeDecision = changeDecisionStore.readRecords().find((record) => record.id === plan.payload.decision.id);
  if (!changeDecision) throw new Error(`Production change decision not found for plan: ${plan.payload.decision.id}`);
  assertDecisionPayload(changeDecision.payload);
  if (changeDecision.recordHash !== plan.payload.decision.recordHash
    || changeDecision.payloadHash !== plan.payload.decision.payloadHash
    || changeDecision.payload.decision !== 'approve'
    || changeDecision.payload.executionAuthorityGranted !== false) {
    throw new Error('Execution authorisation request Phase 1.7 decision binding is invalid');
  }

  const request = requestStore.readRecords().find((record) => record.id === plan.payload.changeRequest.id);
  if (!request) throw new Error(`Production change request not found for plan: ${plan.payload.changeRequest.id}`);
  assertChangeRequestPayload(request.payload);
  if (request.recordHash !== plan.payload.changeRequest.recordHash
    || request.payloadHash !== plan.payload.changeRequest.payloadHash
    || request.payload.application.id !== planDecision.payload.executionPlan.applicationId
    || request.payload.application.fingerprint !== planDecision.payload.executionPlan.applicationFingerprint) {
    throw new Error('Execution authorisation request change-request binding is invalid');
  }

  const expectedTargetIds = plan.payload.targetMappings.map((mapping) => mapping.targetId).sort();
  const approvedTargetIds = [...planDecision.payload.targetIds].sort();
  if (stableStringify(expectedTargetIds) !== stableStringify(approvedTargetIds)) {
    throw new Error('Execution authorisation request target set does not match the approved Phase 1.9 decision');
  }

  const existing = authorisationRequestStore.findByExecutionPlanDecisionId(planDecision.id);
  if (existing) {
    const binding = existing.payload.executionPlanDecision;
    if (binding.recordHash !== planDecision.recordHash || binding.payloadHash !== planDecision.payloadHash
      || binding.executionPlanId !== plan.id || binding.executionPlanRecordHash !== plan.recordHash
      || binding.executionPlanPayloadHash !== plan.payloadHash || binding.sourceDecisionId !== changeDecision.id
      || binding.changeRequestId !== request.id || binding.applicationId !== request.payload.application.id
      || binding.applicationFingerprint !== request.payload.application.fingerprint
      || binding.candidateSnapshotHash !== planDecision.payload.executionPlan.candidateSnapshotHash
      || binding.executionStepsHash !== planDecision.payload.executionPlan.executionStepsHash) {
      throw new Error('Existing execution authorisation request no longer matches the signed approval chain');
    }
    const sameRequester = existing.payload.requester.name === requesterName
      && existing.payload.requester.role === requesterRole
      && existing.payload.requester.note === requesterNote;
    const sameRollback = existing.payload.rollbackPackage.custodian.name === rollbackCustodianName
      && existing.payload.rollbackPackage.custodian.note === rollbackCustodianNote;
    const sameWindow = existing.payload.validity.durationSeconds === durationSeconds
      && existing.payload.freshSnapshot.maxAgeSeconds === freshHashMaxAgeSeconds;
    if (!sameRequester || !sameRollback || !sameWindow) {
      throw new Error(`A different signed execution authorisation request already exists for plan decision: ${planDecision.id}`);
    }
    if (Date.parse(existing.payload.validity.expiresAt) <= now.getTime()) {
      throw new Error('The existing execution authorisation request has expired; renewal is not supported in Phase 1.10');
    }
    return {
      executionAuthorisationRequestId: existing.id,
      executionAuthorisationRequestRecordHash: existing.recordHash,
      executionPlanDecisionId: planDecision.id,
      expiresAt: existing.payload.validity.expiresAt,
      uniqueCandidateCount: existing.payload.freshSnapshot.uniqueCandidateCount,
      readyForExecution: false,
      executionAuthorityGranted: false,
      authorisationGranted: false,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    };
  }

  const collected = collectUniqueCandidates(plan.payload);
  const freshCandidates = collected.candidates.map((candidate) => {
    const fresh = inspectCandidate(
      repositoryRoot,
      candidate.proposedRepositoryPath,
      [...candidate.roles],
      plan.payload.repositorySnapshot.maxFileBytes,
    );
    if (!fresh.exists || fresh.currentSha256 !== candidate.originalSha256 || fresh.currentBytes !== candidate.originalBytes) {
      throw new Error(`Fresh candidate hash does not match the signed plan: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      targetIds: [...candidate.targetIds].sort(),
      roles: [...candidate.roles].sort(),
      exists: true,
      regularFile: true,
      symlink: false,
      currentSha256: fresh.currentSha256,
      currentBytes: fresh.currentBytes,
      originalSha256: candidate.originalSha256,
      originalBytes: candidate.originalBytes,
      freshMatchOriginal: true,
      writeAllowed: false,
    };
  });

  const requestedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();
  const rollbackPackage = buildRollbackPackage(freshCandidates, rollbackCustodianName, rollbackCustodianNote);
  const payload = {
    schemaVersion: 1,
    requestType: 'time_limited_manual_execution_authorisation_request',
    mode: 'authorisation_request_record_only',
    authority: EXECUTION_AUTHORISATION_REQUEST_AUTHORITY,
    status: EXECUTION_AUTHORISATION_REQUEST_STATUS,
    executionPlanDecision: {
      id: planDecision.id,
      recordHash: planDecision.recordHash,
      payloadHash: planDecision.payloadHash,
      executionPlanId: plan.id,
      executionPlanRecordHash: plan.recordHash,
      executionPlanPayloadHash: plan.payloadHash,
      sourceDecisionId: changeDecision.id,
      changeRequestId: request.id,
      applicationId: request.payload.application.id,
      applicationFingerprint: request.payload.application.fingerprint,
      candidateSnapshotHash: planDecision.payload.executionPlan.candidateSnapshotHash,
      executionStepsHash: planDecision.payload.executionPlan.executionStepsHash,
    },
    requester: { name: requesterName, role: requesterRole, note: requesterNote },
    validity: {
      requestedAt,
      validFrom: requestedAt,
      expiresAt,
      durationSeconds,
      timeLimited: true,
      singleUseRequested: true,
      expiredAtCreation: false,
    },
    freshSnapshot: {
      verifiedAt: requestedAt,
      maxAgeSeconds: freshHashMaxAgeSeconds,
      candidateReferenceCount: collected.candidateReferenceCount,
      uniqueCandidateCount: freshCandidates.length,
      snapshotHash: sha256(stableStringify(freshCandidates)),
      originalCandidateSnapshotHash: planDecision.payload.executionPlan.candidateSnapshotHash,
      allMatchOriginal: true,
      candidates: freshCandidates,
    },
    rollbackPackage,
    targetIds: expectedTargetIds,
    productionFilePath: null,
    productionDestinationResolved: false,
    finalDestinationConfirmed: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    nextAction: 'separate_manual_execution_authorisation_decision_and_fresh_hash_check',
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

  const appended = authorisationRequestStore.appendSigned(
    payload,
    options.authorisationRequestSigningKey,
    options.authorisationRequestSigningKeyId || 'production-execution-authorisation-request-key',
  );
  auditLog.append('production_execution_authorisation_request_signed', {
    executionPlanDecisionId: planDecision.id,
    executionPlanDecisionRecordHash: planDecision.recordHash,
    executionPlanId: plan.id,
    executionAuthorisationRequestId: appended.record.id,
    executionAuthorisationRequestRecordHash: appended.record.recordHash,
    requesterName,
    targetCount: expectedTargetIds.length,
    candidateReferenceCount: collected.candidateReferenceCount,
    uniqueCandidateCount: freshCandidates.length,
    expiresAt,
    rollbackManifestHash: rollbackPackage.manifestHash,
    idempotent: appended.idempotent,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, requesterName);

  return {
    executionAuthorisationRequestId: appended.record.id,
    executionAuthorisationRequestRecordHash: appended.record.recordHash,
    executionPlanDecisionId: planDecision.id,
    expiresAt,
    targetCount: expectedTargetIds.length,
    candidateReferenceCount: collected.candidateReferenceCount,
    uniqueCandidateCount: freshCandidates.length,
    rollbackManifestHash: rollbackPackage.manifestHash,
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

module.exports = {
  buildRollbackPackage,
  collectUniqueCandidates,
  normaliseDuration,
  normaliseFreshHashMaxAge,
  requestProductionExecutionAuthorisation,
};
