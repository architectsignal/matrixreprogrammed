'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { assertSafeRoute } = require('./route-registry');
const {
  EXECUTION_PLAN_AUTHORITY,
  EXECUTION_PLAN_STATUS,
  assertCandidatePath,
} = require('./production-execution-plan-store');

const MAX_FILE_BYTES_DEFAULT = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.html', '.json', '.md', '.txt']);
const PROTECTED_SEGMENTS = new Set(['.git', '.autonomous-machine', 'node_modules']);

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError(`${field} contains control characters`);
  if (text.length < min || text.length > max) throw new TypeError(`${field} must contain ${min}-${max} characters`);
  return text;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveCandidatePath(repositoryRoot, candidatePath) {
  const safePath = assertCandidatePath(candidatePath, 'proposed repository path');
  const segments = safePath.split('/');
  if (segments.some((segment) => PROTECTED_SEGMENTS.has(segment))) {
    throw new Error(`Proposed repository path targets a protected segment: ${safePath}`);
  }
  const extension = path.posix.extname(safePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Proposed repository path extension is not allowed: ${safePath}`);
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, safePath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Proposed repository path escapes repository root: ${safePath}`);
  }
  return { safePath, root, resolved };
}

function lstatIfPresent(filePath) {
  try { return fs.lstatSync(filePath); }
  catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertNoSymlinkComponents(root, resolved) {
  const relative = path.relative(root, resolved);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const stat = lstatIfPresent(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`Proposed repository path contains a symlink: ${relative}`);
  }
}

function inspectCandidate(repositoryRoot, candidatePath, roles, maxFileBytes) {
  const { safePath, root, resolved } = resolveCandidatePath(repositoryRoot, candidatePath);
  assertNoSymlinkComponents(root, resolved);
  const stat = lstatIfPresent(resolved);
  if (!stat) {
    return {
      roles: [...new Set(roles)].sort(),
      proposedRepositoryPath: safePath,
      exists: false,
      regularFile: false,
      symlink: false,
      currentSha256: null,
      currentBytes: null,
      mappingStatus: 'candidate_missing_manual_resolution_required',
      mappingConfirmedForExecution: false,
      writeAllowed: false,
    };
  }
  if (stat.isSymbolicLink()) throw new Error(`Proposed repository path is a symlink: ${safePath}`);
  if (!stat.isFile()) throw new Error(`Proposed repository path is not a regular file: ${safePath}`);
  if (stat.size > maxFileBytes) throw new Error(`Proposed repository file exceeds read-only snapshot limit: ${safePath}`);
  return {
    roles: [...new Set(roles)].sort(),
    proposedRepositoryPath: safePath,
    exists: true,
    regularFile: true,
    symlink: false,
    currentSha256: hashFile(resolved),
    currentBytes: stat.size,
    mappingStatus: 'candidate_existing_read_only',
    mappingConfirmedForExecution: false,
    writeAllowed: false,
  };
}

function routePath(route, field) {
  const safe = assertSafeRoute(route, field);
  if (safe.includes('%')) throw new Error(`${field} cannot contain encoded path characters`);
  return safe.split(/[?#]/, 1)[0];
}

function mapChange(repositoryRoot, change, maxFileBytes) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) throw new TypeError('execution plan change must be an object');
  for (const field of ['targetId', 'targetType', 'title', 'route', 'evidenceRoute']) {
    if (typeof change[field] !== 'string' || !change[field].trim()) throw new TypeError(`execution plan change requires ${field}`);
  }
  if (change.productionFilePath !== null || change.productionDestinationResolved !== false) {
    throw new Error('Execution plan source request resolved a production destination');
  }
  if (change.requestedOperation !== 'manual_review_and_integrate_evidence') throw new Error('Execution plan source operation is invalid');
  const proposed = new Map();
  const add = (role, route) => {
    if (route === null || route === undefined) return;
    const candidatePath = routePath(route, `${change.targetId}.${role}`);
    const current = proposed.get(candidatePath) || [];
    current.push(role);
    proposed.set(candidatePath, current);
  };
  add('primary_route', change.route);
  add('evidence_route', change.evidenceRoute);
  add('machine_route', change.machineRoute);
  const candidates = [...proposed.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([candidatePath, roles]) => inspectCandidate(repositoryRoot, candidatePath, roles, maxFileBytes));
  return {
    targetId: change.targetId,
    targetType: change.targetType,
    title: change.title,
    sourceRoutes: {
      primaryRoute: change.route,
      evidenceRoute: change.evidenceRoute,
      machineRoute: change.machineRoute || null,
    },
    candidates,
    productionDestinationResolved: false,
    mappingConfirmedForExecution: false,
  };
}

function buildProductionExecutionPlan(options = {}) {
  const {
    decisionId,
    requestStore,
    decisionStore,
    planStore,
    auditLog,
    repositoryRoot,
  } = options;
  if (typeof decisionId !== 'string' || !decisionId.trim()) throw new TypeError('production execution plan requires decisionId');
  if (!requestStore || !decisionStore || !planStore || !auditLog) {
    throw new TypeError('production execution plan requires requestStore, decisionStore, planStore and auditLog');
  }
  if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) throw new TypeError('production execution plan requires repositoryRoot');
  assertSigningKey(options.requestSigningKey);
  assertSigningKey(options.decisionSigningKey);
  assertSigningKey(options.planSigningKey);
  const plannerName = assertText(options.plannerName, 'plannerName', 3, 120);
  const plannerNote = assertText(options.plannerNote, 'plannerNote', 10, 2000);
  const maxFileBytes = options.maxFileBytes === undefined ? MAX_FILE_BYTES_DEFAULT : options.maxFileBytes;
  if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 50 * 1024 * 1024) {
    throw new TypeError('maxFileBytes must be an integer between 1 and 52428800');
  }

  const requestIntegrity = requestStore.verify(options.requestSigningKey);
  if (!requestIntegrity.valid) throw new Error(`Production change request ledger verification failed: ${requestIntegrity.reason}`);
  const decisionIntegrity = decisionStore.verify(options.decisionSigningKey);
  if (!decisionIntegrity.valid) throw new Error(`Production change decision ledger verification failed: ${decisionIntegrity.reason}`);
  const planIntegrity = planStore.verify(options.planSigningKey);
  if (!planIntegrity.valid) throw new Error(`Production execution plan ledger verification failed: ${planIntegrity.reason}`);

  const decision = decisionStore.readRecords().find((record) => record.id === decisionId.trim());
  if (!decision) throw new Error(`Approved production change decision not found: ${decisionId}`);
  const decisionPayload = decision.payload;
  if (!decisionPayload || decisionPayload.decision !== 'approve'
    || decisionPayload.status !== 'approved_authorisation_record_only') {
    throw new Error('Production execution plan requires an approved Phase 1.7 decision');
  }
  if (decisionPayload.authority !== 'signed_human_decision_only_no_execution_authority'
    || decisionPayload.executionAuthorityGranted !== false
    || decisionPayload.nextAction !== 'separate_manual_production_execution_review') {
    throw new Error('Approved decision authority boundary is invalid');
  }
  if (decisionPayload.productionFilePath !== null || decisionPayload.productionDestinationResolved !== false) {
    throw new Error('Approved decision already resolves a production destination');
  }
  if (!decisionPayload.safety || decisionPayload.safety.executionAllowed !== false
    || decisionPayload.safety.productionWriteAllowed !== false) {
    throw new Error('Approved decision safety boundary changed');
  }

  const request = requestStore.readRecords().find((record) => record.id === decisionPayload.changeRequest.id);
  if (!request) throw new Error(`Production change request not found for decision: ${decisionPayload.changeRequest.id}`);
  if (request.recordHash !== decisionPayload.changeRequest.recordHash
    || request.payloadHash !== decisionPayload.changeRequest.payloadHash) {
    throw new Error('Production execution plan request hashes do not match the approved decision');
  }
  if (request.payload.application.id !== decisionPayload.changeRequest.applicationId
    || request.payload.application.fingerprint !== decisionPayload.changeRequest.applicationFingerprint) {
    throw new Error('Production execution plan application binding does not match the approved decision');
  }
  const requestTargets = request.payload.changes.map((change) => change.targetId).sort();
  const decisionTargets = [...decisionPayload.targetIds].sort();
  if (JSON.stringify(requestTargets) !== JSON.stringify(decisionTargets)) {
    throw new Error('Production execution plan target set does not match the approved decision');
  }

  const targetMappings = request.payload.changes
    .slice()
    .sort((left, right) => left.targetId.localeCompare(right.targetId))
    .map((change) => mapChange(repositoryRoot, change, maxFileBytes));
  const existingCandidateCount = targetMappings.reduce((sum, mapping) => (
    sum + mapping.candidates.filter((candidate) => candidate.exists).length
  ), 0);
  const missingCandidateCount = targetMappings.reduce((sum, mapping) => (
    sum + mapping.candidates.filter((candidate) => !candidate.exists).length
  ), 0);
  const executionSteps = targetMappings.map((mapping, index) => ({
    sequence: index + 1,
    targetId: mapping.targetId,
    action: 'manual_review_and_integrate_evidence',
    candidatePaths: mapping.candidates.map((candidate) => candidate.proposedRepositoryPath),
    preconditions: [
      'manually_confirm_final_production_destination',
      'verify_current_file_hashes_have_not_changed',
      'create_backup_or_recovery_point',
      'review_evidence_boundary_and_source_provenance',
      'obtain_separate_execution_authorisation',
    ],
    validationChecks: [
      'schema_and_syntax_validation',
      'claim_and_evidence_boundary_review',
      'link_and_route_validation',
      'targeted_tests',
      'human_diff_review',
    ],
    executionAllowed: false,
    productionWriteAllowed: false,
  }));

  const payload = {
    schemaVersion: 1,
    planType: 'production_target_mapping_execution_plan_preview',
    mode: 'mapping_and_execution_plan_preview_only',
    authority: EXECUTION_PLAN_AUTHORITY,
    status: EXECUTION_PLAN_STATUS,
    decision: {
      id: decision.id,
      recordHash: decision.recordHash,
      payloadHash: decision.payloadHash,
      changeRequestId: request.id,
      applicationId: request.payload.application.id,
      applicationFingerprint: request.payload.application.fingerprint,
    },
    changeRequest: {
      id: request.id,
      recordHash: request.recordHash,
      payloadHash: request.payloadHash,
      applicationId: request.payload.application.id,
      applicationFingerprint: request.payload.application.fingerprint,
    },
    planner: {
      name: plannerName,
      note: plannerNote,
    },
    repositorySnapshot: {
      rootLabel: 'repository_root',
      accessMode: 'read_only',
      maxFileBytes,
      gitCommandsExecuted: false,
      writesPerformed: 0,
      existingCandidateCount,
      missingCandidateCount,
    },
    targetMappings,
    executionPlan: {
      steps: executionSteps,
      separateExecutionAuthorisationRequired: true,
      finalDestinationConfirmationRequired: true,
      currentHashRevalidationRequired: true,
      rollbackPlanRequired: true,
      humanDiffReviewRequired: true,
      readyForExecution: false,
    },
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

  const appended = planStore.appendSigned(
    payload,
    options.planSigningKey,
    options.planSigningKeyId || 'production-execution-plan-key',
  );
  auditLog.append('production_target_mapping_execution_plan_preview_signed', {
    decisionId: decision.id,
    decisionRecordHash: decision.recordHash,
    changeRequestId: request.id,
    executionPlanId: appended.record.id,
    executionPlanRecordHash: appended.record.recordHash,
    targetCount: targetMappings.length,
    existingCandidateCount,
    missingCandidateCount,
    idempotent: appended.idempotent,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, plannerName);
  return {
    executionPlanId: appended.record.id,
    executionPlanRecordHash: appended.record.recordHash,
    decisionId: decision.id,
    targetCount: targetMappings.length,
    existingCandidateCount,
    missingCandidateCount,
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
  ALLOWED_EXTENSIONS,
  MAX_FILE_BYTES_DEFAULT,
  buildProductionExecutionPlan,
  inspectCandidate,
  mapChange,
  resolveCandidatePath,
};
