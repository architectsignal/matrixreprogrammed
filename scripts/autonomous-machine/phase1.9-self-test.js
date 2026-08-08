#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { sha256, stableStringify } = require('./route-registry');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { ProductionExecutionPlanStore } = require('./production-execution-plan-store');
const {
  ProductionExecutionPlanDecisionStore,
  assertExecutionPlanDecisionPayload,
} = require('./production-execution-plan-decision-store');
const { decideProductionExecutionPlan } = require('./production-execution-plan-decision-service');

let checks = 0;
function check(fn) { fn(); checks += 1; }
async function rejects(fn, pattern) { await assert.rejects(async () => fn(), pattern); checks += 1; }

function zeroSafety(extra = {}) {
  return {
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
    ...extra,
  };
}

function requestPayload(suffix) {
  const targetId = `dossier-pack:phase19-${suffix}`;
  return {
    schemaVersion: 1,
    requestType: 'advisory_production_change_request',
    mode: 'change_request_only',
    authority: 'advisory_only_manual_production_authorisation_required',
    status: 'pending_production_change_review',
    application: {
      id: `apply_${suffix}`,
      fingerprint: sha256(`application-${suffix}`),
      previewId: `preview_${suffix}`,
      previewFingerprint: sha256(`preview-${suffix}`),
      handoffId: `handoff_${suffix}`,
      routeBatchId: `route_batch_${suffix}`,
      beforeHash: sha256(`before-${suffix}`),
      afterHash: sha256(`after-${suffix}`),
      patchHash: sha256(`patch-${suffix}`),
      diffHash: sha256(`diff-${suffix}`),
      exactMatch: true,
    },
    requester: { name: 'phase19-requester', note: `Request manual review for Phase 1.9 fixture ${suffix}.` },
    sourceSnapshot: {
      sourceId: 'doj-sdny-press-releases',
      sourceUrl: 'https://www.justice.gov/usao-sdny/pr/example',
      title: `Phase 1.9 source ${suffix}`,
      evidenceClass: 'official_source',
      sensitivity: 'low',
      evidenceBoundary: 'Official source requires human interpretation.',
      provenance: [{ sourceId: 'doj-sdny-press-releases', locator: `fixture-${suffix}` }],
    },
    changes: [{
      targetId,
      targetType: 'dossier_pack',
      title: `Phase 1.9 Target ${suffix}`,
      route: `phase19-${suffix}.html`,
      evidenceRoute: `evidence-phase19-${suffix}.html`,
      machineRoute: null,
      requestedOperation: 'manual_review_and_integrate_evidence',
      reviewStatus: 'pending_manual_production_review',
      productionFilePath: null,
      productionDestinationResolved: false,
      evidenceBoundary: 'Manual evidence review required.',
      match: { score: 9, confidence: 'high', reasons: ['fixture'] },
    }],
    requiredApprovals: { evidenceReview: true, editorialReview: true, legalReview: false, productionOwnerApproval: true },
    safety: zeroSafety(),
  };
}

function changeDecisionPayload(request, suffix) {
  return {
    schemaVersion: 1,
    decisionType: 'human_production_change_request_decision',
    mode: 'decision_record_only',
    authority: 'signed_human_decision_only_no_execution_authority',
    status: 'approved_authorisation_record_only',
    decision: 'approve',
    changeRequest: {
      id: request.id,
      recordHash: request.recordHash,
      payloadHash: request.payloadHash,
      applicationId: request.payload.application.id,
      applicationFingerprint: request.payload.application.fingerprint,
    },
    reviewer: {
      name: 'phase19-change-reviewer',
      role: 'production-owner',
      note: `Approve advisory request fixture ${suffix} without execution authority.`,
    },
    completedApprovals: { evidenceReview: true, editorialReview: true, legalReview: false, productionOwnerApproval: true },
    targetIds: request.payload.changes.map((change) => change.targetId),
    productionFilePath: null,
    productionDestinationResolved: false,
    executionAuthorityGranted: false,
    nextAction: 'separate_manual_production_execution_review',
    safety: zeroSafety(),
  };
}

function candidate(candidatePath, exists, role, seed) {
  return {
    roles: [role],
    proposedRepositoryPath: candidatePath,
    exists,
    regularFile: exists,
    symlink: false,
    currentSha256: exists ? sha256(`file-${seed}`) : null,
    currentBytes: exists ? 128 : null,
    mappingStatus: exists ? 'candidate_existing_read_only' : 'candidate_missing_manual_resolution_required',
    mappingConfirmedForExecution: false,
    writeAllowed: false,
  };
}

function executionPlanPayload(request, decision, suffix, missing = false) {
  const change = request.payload.changes[0];
  const candidates = [
    candidate(change.route, true, 'primary_route', `${suffix}-primary`),
    candidate(change.evidenceRoute, !missing, 'evidence_route', `${suffix}-evidence`),
  ];
  const existingCandidateCount = candidates.filter((item) => item.exists).length;
  const missingCandidateCount = candidates.filter((item) => !item.exists).length;
  return {
    schemaVersion: 1,
    planType: 'production_target_mapping_execution_plan_preview',
    mode: 'mapping_and_execution_plan_preview_only',
    authority: 'preview_only_no_execution_authority',
    status: 'pending_manual_execution_plan_review',
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
    planner: { name: 'phase19-planner', note: `Create read-only execution plan fixture ${suffix}.` },
    repositorySnapshot: {
      rootLabel: 'repository_root', accessMode: 'read_only', maxFileBytes: 5242880,
      gitCommandsExecuted: false, writesPerformed: 0, existingCandidateCount, missingCandidateCount,
    },
    targetMappings: [{
      targetId: change.targetId,
      targetType: change.targetType,
      title: change.title,
      sourceRoutes: { primaryRoute: change.route, evidenceRoute: change.evidenceRoute, machineRoute: null },
      candidates,
      productionDestinationResolved: false,
      mappingConfirmedForExecution: false,
    }],
    executionPlan: {
      steps: [{
        sequence: 1,
        targetId: change.targetId,
        action: 'manual_review_and_integrate_evidence',
        candidatePaths: candidates.map((item) => item.proposedRepositoryPath),
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
      }],
      separateExecutionAuthorisationRequired: true,
      finalDestinationConfirmationRequired: true,
      currentHashRevalidationRequired: true,
      rollbackPlanRequired: true,
      humanDiffReviewRequired: true,
      readyForExecution: false,
    },
    safety: zeroSafety(),
  };
}

async function runTests() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase19-'));
  const runtime = path.join(root, '.autonomous-machine');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const productionFile = path.join(dataDir, 'production-sentinel.json');
  fs.writeFileSync(productionFile, '{"unchanged":true}\n');
  const productionHash = sha256(fs.readFileSync(productionFile));

  const requestPath = path.join(runtime, 'production-change-requests.jsonl');
  const changeDecisionPath = path.join(runtime, 'production-change-decisions.jsonl');
  const planPath = path.join(runtime, 'production-execution-plans.jsonl');
  const planDecisionPath = path.join(runtime, 'production-execution-plan-decisions.jsonl');
  const requestStore = new ProductionChangeRequestStore(requestPath);
  const changeDecisionStore = new ProductionChangeDecisionStore(changeDecisionPath);
  const planStore = new ProductionExecutionPlanStore(planPath);
  const planDecisionStore = new ProductionExecutionPlanDecisionStore(planDecisionPath);
  const auditLog = new AuditLog(path.join(runtime, 'audit.jsonl'));

  const requestKey = 'phase19-request-signing-key-at-least-32-bytes';
  const changeDecisionKey = 'phase19-change-decision-key-at-least-32-bytes';
  const planKey = 'phase19-execution-plan-key-at-least-32-bytes';
  const planDecisionKey = 'phase19-plan-decision-key-at-least-32-bytes';

  function createChain(suffix, missing = false) {
    const request = requestStore.appendSigned(requestPayload(suffix), requestKey, 'phase19-request-key').record;
    const changeDecision = changeDecisionStore.appendSigned(changeDecisionPayload(request, suffix), changeDecisionKey, 'phase19-change-decision-key').record;
    const plan = planStore.appendSigned(executionPlanPayload(request, changeDecision, suffix, missing), planKey, 'phase19-plan-key').record;
    return { request, changeDecision, plan };
  }

  const approvedChain = createChain('approved', false);
  const rejectedChain = createChain('rejected', true);
  const completedReviews = {
    targetMappingReview: true,
    fileSnapshotReview: true,
    rollbackPlanReview: true,
    validationPlanReview: true,
    productionOwnerReview: true,
  };
  const base = {
    executionPlanId: approvedChain.plan.id,
    requestStore,
    changeDecisionStore,
    planStore,
    planDecisionStore,
    auditLog,
    requestSigningKey: requestKey,
    changeDecisionSigningKey: changeDecisionKey,
    planSigningKey: planKey,
    planDecisionSigningKey: planDecisionKey,
    planDecisionSigningKeyId: 'phase19-plan-decision-key',
    decision: 'approve',
    reviewerName: 'phase19-plan-reviewer',
    reviewerRole: 'production-plan-reviewer',
    reviewerNote: 'Approve the mapping and plan preview as a record only, without execution authority.',
    completedReviews,
  };

  await rejects(() => decideProductionExecutionPlan({ ...base, executionPlanId: '' }), /executionPlanId/);
  await rejects(() => decideProductionExecutionPlan({ ...base, planDecisionSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => decideProductionExecutionPlan({ ...base, decision: 'maybe' }), /approve or reject/);
  await rejects(() => decideProductionExecutionPlan({ ...base, reviewerName: '' }), /reviewerName/);
  await rejects(() => decideProductionExecutionPlan({ ...base, reviewerRole: '' }), /reviewerRole/);
  await rejects(() => decideProductionExecutionPlan({ ...base, reviewerNote: 'short' }), /reviewerNote/);
  await rejects(() => decideProductionExecutionPlan({ ...base, completedReviews: {} }), /targetMappingReview/);
  await rejects(() => decideProductionExecutionPlan({ ...base, executionPlanId: 'missing-plan' }), /not found/);
  for (const field of Object.keys(completedReviews)) {
    await rejects(() => decideProductionExecutionPlan({ ...base, completedReviews: { ...completedReviews, [field]: false } }), new RegExp(`completed ${field}`));
  }

  const approved = decideProductionExecutionPlan(base);
  for (const condition of [
    approved.decision === 'approve',
    approved.targetCount === 1,
    approved.candidateCount === 2,
    approved.existingCandidateCount === 2,
    approved.missingCandidateCount === 0,
    approved.readyForExecution === false,
    approved.executionAuthorityGranted === false,
    approved.productionWrites === 0,
    approved.publicationTasksCreated === 0,
    approved.commitActions === 0,
    approved.deploymentActions === 0,
    planDecisionStore.readRecords().length === 1,
    planDecisionStore.verify(planDecisionKey).valid === true,
    fs.readFileSync(planDecisionPath, 'utf8').includes(planDecisionKey) === false,
  ]) check(() => assert.equal(condition, true));

  const record = planDecisionStore.readRecords()[0];
  for (const condition of [
    record.payload.status === 'approved_mapping_and_plan_record_only',
    record.payload.authority === 'signed_human_execution_plan_decision_only_no_execution_authority',
    record.payload.executionPlan.id === approvedChain.plan.id,
    record.payload.executionPlan.recordHash === approvedChain.plan.recordHash,
    record.payload.executionPlan.payloadHash === approvedChain.plan.payloadHash,
    record.payload.executionPlan.sourceDecisionId === approvedChain.changeDecision.id,
    record.payload.executionPlan.changeRequestId === approvedChain.request.id,
    record.payload.mappingSummary.allCandidatesPresent === true,
    record.payload.productionFilePath === null,
    record.payload.productionDestinationResolved === false,
    record.payload.mappingConfirmedForExecution === false,
    record.payload.finalDestinationConfirmed === false,
    record.payload.readyForExecution === false,
    record.payload.executionAuthorityGranted === false,
    record.payload.nextAction === 'separate_manual_execution_authorisation_and_fresh_hash_review',
    assertExecutionPlanDecisionPayload(record.payload) === true,
    record.payload.executionPlan.candidateSnapshotHash === sha256(stableStringify(approvedChain.plan.payload.targetMappings)),
    record.payload.executionPlan.executionStepsHash === sha256(stableStringify(approvedChain.plan.payload.executionPlan.steps)),
  ]) check(() => assert.equal(condition, true));

  const duplicate = decideProductionExecutionPlan(base);
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(duplicate.executionPlanDecisionId, approved.executionPlanDecisionId));
  check(() => assert.equal(planDecisionStore.readRecords().length, 1));
  await rejects(() => decideProductionExecutionPlan({
    ...base,
    decision: 'reject',
    reviewerNote: 'A conflicting rejection must not replace the existing signed approval record.',
  }), /different signed execution plan decision/);

  await rejects(() => decideProductionExecutionPlan({ ...base, executionPlanId: rejectedChain.plan.id }), /every candidate path to exist/);
  const rejected = decideProductionExecutionPlan({
    ...base,
    executionPlanId: rejectedChain.plan.id,
    decision: 'reject',
    reviewerName: 'phase19-second-reviewer',
    reviewerRole: 'editorial-reviewer',
    reviewerNote: 'Reject the mapping preview because one proposed candidate path is missing.',
    completedReviews: {
      targetMappingReview: true,
      fileSnapshotReview: false,
      rollbackPlanReview: false,
      validationPlanReview: false,
      productionOwnerReview: false,
    },
  });
  for (const condition of [
    rejected.decision === 'reject',
    rejected.missingCandidateCount === 1,
    rejected.executionAuthorityGranted === false,
    planDecisionStore.readRecords().length === 2,
    planDecisionStore.readRecords()[1].payload.status === 'rejected_mapping_or_plan_no_authorisation',
    planDecisionStore.readRecords()[1].payload.nextAction === 'none',
    planDecisionStore.readRecords()[1].previousRecordHash === planDecisionStore.readRecords()[0].recordHash,
    planDecisionStore.verify(planDecisionKey).valid === true,
    planDecisionStore.verify('different-plan-decision-signing-key-long-enough').valid === false,
  ]) check(() => assert.equal(condition, true));

  const tamperedDecisionPath = path.join(runtime, 'tampered-plan-decisions.jsonl');
  fs.copyFileSync(planDecisionPath, tamperedDecisionPath);
  const tamperedDecisions = fs.readFileSync(tamperedDecisionPath, 'utf8').trim().split('\n').map(JSON.parse);
  tamperedDecisions[0].payload.reviewer.note = 'tampered';
  fs.writeFileSync(tamperedDecisionPath, `${tamperedDecisions.map(JSON.stringify).join('\n')}\n`);
  check(() => assert.equal(new ProductionExecutionPlanDecisionStore(tamperedDecisionPath).verify(planDecisionKey).valid, false));

  const originalPlans = fs.readFileSync(planPath, 'utf8');
  const tamperedPlans = originalPlans.trim().split('\n').map(JSON.parse);
  tamperedPlans[0].payload.planner.note = 'tampered plan';
  fs.writeFileSync(planPath, `${tamperedPlans.map(JSON.stringify).join('\n')}\n`);
  await rejects(() => decideProductionExecutionPlan({ ...base, executionPlanId: rejectedChain.plan.id }), /plan ledger verification failed/i);
  fs.writeFileSync(planPath, originalPlans);

  const originalChangeDecisions = fs.readFileSync(changeDecisionPath, 'utf8');
  const tamperedChangeDecisions = originalChangeDecisions.trim().split('\n').map(JSON.parse);
  tamperedChangeDecisions[0].payload.reviewer.note = 'tampered change decision';
  fs.writeFileSync(changeDecisionPath, `${tamperedChangeDecisions.map(JSON.stringify).join('\n')}\n`);
  await rejects(() => decideProductionExecutionPlan({ ...base, executionPlanId: rejectedChain.plan.id }), /change decision ledger verification failed/i);
  fs.writeFileSync(changeDecisionPath, originalChangeDecisions);

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.ok(auditLog.readEntries().every((entry) => (
    entry.details.readyForExecution === false
      && entry.details.executionAuthorityGranted === false
      && entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0
      && entry.details.commitActions === 0
      && entry.details.deploymentActions === 0
  ))));
  for (const condition of [
    sha256(fs.readFileSync(productionFile)) === productionHash,
    !fs.existsSync(path.join(root, 'data', 'production-execution-plan-decision.json')),
    !fs.existsSync(path.join(root, '.git', 'index.lock')),
    !fs.existsSync(path.join(root, 'deploy')),
  ]) check(() => assert.equal(condition, true));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedExecutionPlanDecisions: planDecisionStore.readRecords().length,
    approved: 1,
    rejected: 1,
    reviewedTargets: approved.targetCount,
    reviewedCandidates: approved.candidateCount,
    readyForExecution: false,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
    auditEntries: auditLog.verify().entries,
  }, null, 2)}\n`);
}

runTests().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
