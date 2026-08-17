#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const {
  ProductionExecutionPlanStore,
  assertExecutionPlanPayload,
} = require('./production-execution-plan-store');
const {
  buildProductionExecutionPlan,
  inspectCandidate,
} = require('./production-execution-plan-builder');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

class FixtureLedger {
  constructor(records, key) {
    this.records = records;
    this.key = key;
    this.forcedInvalid = false;
  }
  verify(key) {
    return { valid: !this.forcedInvalid && key === this.key, reason: key === this.key ? 'forced_invalid' : 'signature_mismatch' };
  }
  readRecords() { return this.records; }
}

async function runTests() {
  let checks = 0;
  const check = (fn) => { fn(); checks += 1; };
  const rejects = async (fn, pattern) => {
    await assert.rejects(async () => fn(), pattern);
    checks += 1;
  };

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase18-'));
  const runtime = path.join(root, '.autonomous-machine-test');
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(path.join(root, 'dossier-pack-crime.html'), '<html>crime dossier</html>');
  fs.writeFileSync(path.join(root, 'evidence-lane-court.html'), '<html>court evidence</html>');
  fs.writeFileSync(path.join(root, 'person-record.html'), '<html>person record</html>');
  const productionFile = path.join(root, 'production-sentinel.json');
  fs.writeFileSync(productionFile, '{"unchanged":true}\n');
  const productionHash = hash(fs.readFileSync(productionFile));

  const requestKey = 'phase18-request-signing-key-that-is-long-enough';
  const decisionKey = 'phase18-decision-signing-key-that-is-long-enough';
  const planKey = 'phase18-plan-signing-key-that-is-long-enough';
  const request = {
    id: 'change_request_fixture',
    recordHash: '1'.repeat(64),
    payloadHash: '2'.repeat(64),
    payload: {
      authority: 'advisory_only_manual_production_authorisation_required',
      status: 'pending_production_change_review',
      application: { id: 'apply_fixture', fingerprint: '3'.repeat(64) },
      changes: [
        {
          targetId: 'dossier-pack:crime-state-overlap',
          targetType: 'dossier_pack',
          title: 'Crime State Overlap',
          route: 'dossier-pack-crime.html',
          evidenceRoute: 'evidence-lane-court.html',
          machineRoute: 'missing-machine.json',
          requestedOperation: 'manual_review_and_integrate_evidence',
          reviewStatus: 'pending_manual_production_review',
          productionFilePath: null,
          productionDestinationResolved: false,
        },
        {
          targetId: 'person:example-person',
          targetType: 'person_tracker',
          title: 'Example Person',
          route: 'person-record.html',
          evidenceRoute: 'person-record.html',
          machineRoute: null,
          requestedOperation: 'manual_review_and_integrate_evidence',
          reviewStatus: 'pending_manual_production_review',
          productionFilePath: null,
          productionDestinationResolved: false,
        },
      ],
    },
  };
  const decision = {
    id: 'change_decision_fixture',
    recordHash: '4'.repeat(64),
    payloadHash: '5'.repeat(64),
    payload: {
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
      targetIds: request.payload.changes.map((item) => item.targetId).sort(),
      productionFilePath: null,
      productionDestinationResolved: false,
      executionAuthorityGranted: false,
      nextAction: 'separate_manual_production_execution_review',
      safety: { executionAllowed: false, productionWriteAllowed: false },
    },
  };
  const requestStore = new FixtureLedger([request], requestKey);
  const decisionStore = new FixtureLedger([decision], decisionKey);
  const planPath = path.join(runtime, 'production-execution-plans.jsonl');
  const planStore = new ProductionExecutionPlanStore(planPath);
  const auditLog = new AuditLog(path.join(runtime, 'audit.jsonl'));
  const base = {
    decisionId: decision.id,
    requestStore,
    decisionStore,
    planStore,
    auditLog,
    repositoryRoot: root,
    requestSigningKey: requestKey,
    decisionSigningKey: decisionKey,
    planSigningKey: planKey,
    planSigningKeyId: 'phase18-plan-key',
    plannerName: 'production-planner',
    plannerNote: 'Create a read-only target mapping and execution-plan preview for separate manual review.',
  };

  await rejects(() => buildProductionExecutionPlan({ ...base, planSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => buildProductionExecutionPlan({ ...base, decisionId: '' }), /decisionId/);
  await rejects(() => buildProductionExecutionPlan({ ...base, repositoryRoot: '' }), /repositoryRoot/);
  await rejects(() => buildProductionExecutionPlan({ ...base, plannerName: '' }), /plannerName/);
  await rejects(() => buildProductionExecutionPlan({ ...base, plannerNote: 'short' }), /plannerNote/);
  await rejects(() => buildProductionExecutionPlan({ ...base, maxFileBytes: 0 }), /maxFileBytes/);

  const result = buildProductionExecutionPlan(base);
  check(() => assert.equal(result.targetCount, 2));
  check(() => assert.equal(result.existingCandidateCount, 3));
  check(() => assert.equal(result.missingCandidateCount, 1));
  check(() => assert.equal(result.readyForExecution, false));
  check(() => assert.equal(result.executionAuthorityGranted, false));
  check(() => assert.equal(result.productionWrites, 0));
  check(() => assert.equal(result.publicationTasksCreated, 0));
  check(() => assert.equal(result.commitActions, 0));
  check(() => assert.equal(result.deploymentActions, 0));
  check(() => assert.equal(planStore.readRecords().length, 1));
  check(() => assert.equal(planStore.verify(planKey).valid, true));
  check(() => assert.equal(planStore.verify('wrong-plan-signing-key-that-is-long-enough').valid, false));
  check(() => assert.equal(fs.readFileSync(planPath, 'utf8').includes(planKey), false));

  const record = planStore.readRecords()[0];
  check(() => assert.equal(record.payload.mode, 'mapping_and_execution_plan_preview_only'));
  check(() => assert.equal(record.payload.authority, 'preview_only_no_execution_authority'));
  check(() => assert.equal(record.payload.status, 'pending_manual_execution_plan_review'));
  check(() => assert.equal(record.payload.repositorySnapshot.accessMode, 'read_only'));
  check(() => assert.equal(record.payload.repositorySnapshot.gitCommandsExecuted, false));
  check(() => assert.equal(record.payload.repositorySnapshot.writesPerformed, 0));
  check(() => assert.equal(record.payload.executionPlan.readyForExecution, false));
  check(() => assert.equal(record.payload.executionPlan.separateExecutionAuthorisationRequired, true));
  check(() => assert.equal(record.payload.safety.productionTarget, null));
  check(() => assert.equal(record.payload.safety.executionAllowed, false));
  check(() => assert.equal(record.payload.safety.productionWriteAllowed, false));
  check(() => assert.equal(record.payload.safety.commitAllowed, false));
  check(() => assert.equal(record.payload.safety.deploymentAllowed, false));
  check(() => assert.equal(record.payload.safety.publicationAllowed, false));
  check(() => assert.ok(record.payload.targetMappings.every((mapping) => mapping.productionDestinationResolved === false)));
  check(() => assert.ok(record.payload.targetMappings.every((mapping) => mapping.mappingConfirmedForExecution === false)));
  check(() => assert.ok(record.payload.targetMappings.flatMap((mapping) => mapping.candidates).every((candidate) => candidate.writeAllowed === false)));
  check(() => assert.ok(record.payload.executionPlan.steps.every((step) => step.executionAllowed === false && step.productionWriteAllowed === false)));
  const personMapping = record.payload.targetMappings.find((mapping) => mapping.targetId === 'person:example-person');
  check(() => assert.equal(personMapping.candidates.length, 1));
  check(() => assert.deepEqual(personMapping.candidates[0].roles, ['evidence_route', 'primary_route']));
  const missing = record.payload.targetMappings.flatMap((mapping) => mapping.candidates).find((candidate) => !candidate.exists);
  check(() => assert.equal(missing.mappingStatus, 'candidate_missing_manual_resolution_required'));
  check(() => assert.equal(missing.currentSha256, null));
  check(() => assertExecutionPlanPayload(record.payload));

  const duplicate = buildProductionExecutionPlan(base);
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(duplicate.executionPlanId, result.executionPlanId));
  check(() => assert.equal(planStore.readRecords().length, 1));
  await rejects(() => buildProductionExecutionPlan({ ...base, plannerNote: 'A conflicting planning rationale must not replace the signed execution plan preview.' }), /different signed production execution plan/);

  async function invalidTest({ requestPatch, decisionPatch, basePatch, requestValid = true, decisionValid = true }, pattern) {
    const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase18-invalid-'));
    fs.writeFileSync(path.join(localRoot, 'safe.html'), '<html>safe</html>');
    const localRequest = JSON.parse(JSON.stringify(request));
    localRequest.id = `request_${crypto.randomUUID()}`;
    localRequest.recordHash = hash(localRequest.id);
    localRequest.payloadHash = hash(`${localRequest.id}:payload`);
    localRequest.payload.changes = [{ ...localRequest.payload.changes[0], route: 'safe.html', evidenceRoute: 'safe.html', machineRoute: null }];
    Object.assign(localRequest, requestPatch || {});
    if (requestPatch && requestPatch.payload) localRequest.payload = requestPatch.payload;
    const localDecision = JSON.parse(JSON.stringify(decision));
    localDecision.id = `decision_${crypto.randomUUID()}`;
    localDecision.recordHash = hash(localDecision.id);
    localDecision.payloadHash = hash(`${localDecision.id}:payload`);
    localDecision.payload.changeRequest = {
      id: localRequest.id,
      recordHash: localRequest.recordHash,
      payloadHash: localRequest.payloadHash,
      applicationId: localRequest.payload.application.id,
      applicationFingerprint: localRequest.payload.application.fingerprint,
    };
    localDecision.payload.targetIds = localRequest.payload.changes.map((item) => item.targetId).sort();
    if (decisionPatch) {
      const { changeRequest: changeRequestPatch, ...decisionFields } = decisionPatch;
      Object.assign(localDecision.payload, decisionFields);
      if (changeRequestPatch) Object.assign(localDecision.payload.changeRequest, changeRequestPatch);
    }
    const localRequestStore = new FixtureLedger([localRequest], requestKey);
    const localDecisionStore = new FixtureLedger([localDecision], decisionKey);
    localRequestStore.forcedInvalid = !requestValid;
    localDecisionStore.forcedInvalid = !decisionValid;
    const localPlanStore = new ProductionExecutionPlanStore(path.join(localRoot, '.runtime', 'plans.jsonl'));
    const localAudit = new AuditLog(path.join(localRoot, '.runtime', 'audit.jsonl'));
    await rejects(() => buildProductionExecutionPlan({
      ...base,
      ...basePatch,
      decisionId: localDecision.id,
      requestStore: localRequestStore,
      decisionStore: localDecisionStore,
      planStore: localPlanStore,
      auditLog: localAudit,
      repositoryRoot: localRoot,
    }), pattern);
  }

  await invalidTest({ decisionPatch: { decision: 'reject', status: 'rejected_no_authorisation', nextAction: 'none' } }, /requires an approved/);
  await invalidTest({ decisionPatch: { executionAuthorityGranted: true } }, /authority boundary/);
  await invalidTest({ decisionPatch: { productionFilePath: 'safe.html' } }, /already resolves/);
  await invalidTest({ decisionPatch: { safety: { executionAllowed: true, productionWriteAllowed: false } } }, /safety boundary/);
  await invalidTest({ decisionPatch: { changeRequest: { recordHash: 'a'.repeat(64) } } }, /request hashes/);
  await invalidTest({ decisionPatch: { changeRequest: { applicationId: 'different' } } }, /application binding/);
  await invalidTest({ decisionPatch: { targetIds: ['different-target'] } }, /target set/);
  await invalidTest({ requestValid: false }, /request ledger verification failed/i);
  await invalidTest({ decisionValid: false }, /decision ledger verification failed/i);

  const unsafePayload = JSON.parse(JSON.stringify(request.payload));
  unsafePayload.changes = [{ ...unsafePayload.changes[0], route: '../escape.html', evidenceRoute: 'safe.html', machineRoute: null }];
  await invalidTest({ requestPatch: { payload: unsafePayload } }, /unsafe path segment/);
  const encodedPayload = JSON.parse(JSON.stringify(request.payload));
  encodedPayload.changes = [{ ...encodedPayload.changes[0], route: '%2e%2e/escape.html', evidenceRoute: 'safe.html', machineRoute: null }];
  await invalidTest({ requestPatch: { payload: encodedPayload } }, /encoded path/);
  const protectedPayload = JSON.parse(JSON.stringify(request.payload));
  protectedPayload.changes = [{ ...protectedPayload.changes[0], route: '.git/config.json', evidenceRoute: 'safe.html', machineRoute: null }];
  await invalidTest({ requestPatch: { payload: protectedPayload } }, /hidden or protected|protected segment/);
  const extensionPayload = JSON.parse(JSON.stringify(request.payload));
  extensionPayload.changes = [{ ...extensionPayload.changes[0], route: 'unsafe.exe', evidenceRoute: 'safe.html', machineRoute: null }];
  await invalidTest({ requestPatch: { payload: extensionPayload } }, /extension is not allowed/);

  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase18-symlink-'));
  fs.writeFileSync(path.join(symlinkRoot, 'real.html'), 'real');
  fs.symlinkSync(path.join(symlinkRoot, 'real.html'), path.join(symlinkRoot, 'linked.html'));
  await rejects(() => inspectCandidate(symlinkRoot, 'linked.html', ['primary_route'], 1024), /symlink/);
  const directoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase18-directory-'));
  fs.mkdirSync(path.join(directoryRoot, 'folder.html'));
  await rejects(() => inspectCandidate(directoryRoot, 'folder.html', ['primary_route'], 1024), /not a regular file/);
  const largeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase18-large-'));
  fs.writeFileSync(path.join(largeRoot, 'large.html'), 'x'.repeat(100));
  await rejects(() => inspectCandidate(largeRoot, 'large.html', ['primary_route'], 10), /exceeds read-only snapshot limit/);

  const tamperedPath = path.join(runtime, 'tampered-plans.jsonl');
  fs.copyFileSync(planPath, tamperedPath);
  const tampered = fs.readFileSync(tamperedPath, 'utf8').trim().split('\n').map(JSON.parse);
  tampered[0].payload.planner.note = 'tampered';
  fs.writeFileSync(tamperedPath, `${tampered.map(JSON.stringify).join('\n')}\n`);
  check(() => assert.equal(new ProductionExecutionPlanStore(tamperedPath).verify(planKey).valid, false));

  const originalPlan = fs.readFileSync(planPath, 'utf8');
  const alteredPlan = JSON.parse(originalPlan.trim());
  alteredPlan.payload.repositorySnapshot.writesPerformed = 1;
  fs.writeFileSync(planPath, `${JSON.stringify(alteredPlan)}\n`);
  await rejects(() => buildProductionExecutionPlan(base), /plan ledger verification failed/i);
  fs.writeFileSync(planPath, originalPlan);

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.ok(auditLog.readEntries().every((entry) => (
    entry.details.executionAuthorityGranted === false
      && entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0
      && entry.details.commitActions === 0
      && entry.details.deploymentActions === 0
  ))));
  for (const condition of [
    hash(fs.readFileSync(productionFile)) === productionHash,
    !fs.existsSync(path.join(root, 'data', 'production-execution-plan.json')),
    !fs.existsSync(path.join(root, '.git', 'index.lock')),
    !fs.existsSync(path.join(root, 'deploy')),
  ]) check(() => assert.equal(condition, true));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedExecutionPlans: planStore.readRecords().length,
    targetMappings: record.payload.targetMappings.length,
    existingCandidates: result.existingCandidateCount,
    missingCandidates: result.missingCandidateCount,
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
