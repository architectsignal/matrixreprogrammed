#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { sha256 } = require('./route-registry');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { decideProductionChangeRequest } = require('./production-change-decision-service');

async function runTests() {
  let checks = 0;
  const check = (fn) => { fn(); checks += 1; };
  const rejects = async (fn, pattern) => { await assert.rejects(async () => fn(), pattern); checks += 1; };

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase17-'));
  const runtime = path.join(root, '.autonomous-machine');
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const productionFile = path.join(root, 'data', 'production-sentinel.json');
  fs.writeFileSync(productionFile, '{"untouched":true}\n');
  const productionHash = sha256(fs.readFileSync(productionFile));
  const requestKey = 'phase-1.7-request-signing-key-with-at-least-32-bytes';
  const decisionKey = 'phase-1.7-decision-signing-key-with-at-least-32-bytes';
  const requestPath = path.join(runtime, 'production-change-requests.jsonl');
  const decisionPath = path.join(runtime, 'production-change-decisions.jsonl');
  const requestStore = new ProductionChangeRequestStore(requestPath);
  const decisionStore = new ProductionChangeDecisionStore(decisionPath);
  const auditLog = new AuditLog(path.join(runtime, 'audit.jsonl'));

  function makeRequestPayload(idSuffix, sensitivity = 'high', legalReview = true) {
    return {
      schemaVersion: 1,
      requestType: 'advisory_production_change_request',
      mode: 'change_request_only',
      authority: 'advisory_only_manual_production_authorisation_required',
      status: 'pending_production_change_review',
      application: {
        id: `apply_${idSuffix}`,
        fingerprint: '1'.repeat(64),
        previewId: `preview_${idSuffix}`,
        previewFingerprint: '2'.repeat(64),
        handoffId: `handoff_${idSuffix}`,
        routeBatchId: `route_${idSuffix}`,
        beforeHash: '3'.repeat(64),
        afterHash: '4'.repeat(64),
        patchHash: '5'.repeat(64),
        diffHash: '6'.repeat(64),
        exactMatch: true,
      },
      requester: { name: 'production-reviewer', note: 'Request manual production review of this exact advisory package.' },
      sourceSnapshot: {
        sourceId: 'doj-sdny',
        sourceUrl: `https://www.justice.gov/usao-sdny/pr/example-${idSuffix}`,
        title: `Example ${idSuffix}`,
        evidenceClass: 'official',
        sensitivity,
        provenance: [{ sourceId: 'doj-sdny', locator: `https://www.justice.gov/usao-sdny/pr/example-${idSuffix}` }],
      },
      changes: [
        {
          targetId: `dossier-pack:crime-state-${idSuffix}`,
          targetType: 'dossier_pack',
          title: `Crime State ${idSuffix}`,
          route: 'dossier-pack-crime-state-overlap.html',
          evidenceRoute: 'evidence-lane-court-records.html',
          machineRoute: null,
          requestedOperation: 'manual_review_and_integrate_evidence',
          reviewStatus: 'pending_manual_production_review',
          productionFilePath: null,
          productionDestinationResolved: false,
        },
        {
          targetId: `epstein-person:example-${idSuffix}`,
          targetType: 'person_tracker',
          title: `Example Person ${idSuffix}`,
          route: 'epstein-files.html#epstein-people-tracker',
          evidenceRoute: 'downloads/epstein-people-index.json',
          machineRoute: null,
          requestedOperation: 'manual_review_and_integrate_evidence',
          reviewStatus: 'pending_manual_production_review',
          productionFilePath: null,
          productionDestinationResolved: false,
        },
      ],
      requiredApprovals: {
        evidenceReview: true,
        editorialReview: true,
        legalReview,
        productionOwnerApproval: true,
      },
      safety: {
        productionTarget: null,
        productionWriteAllowed: false,
        commitAllowed: false,
        deploymentAllowed: false,
        publicationAllowed: false,
        productionWrites: 0,
        publicationTasksCreated: 0,
        commitActions: 0,
        deploymentActions: 0,
      },
    };
  }

  const firstRequest = requestStore.appendSigned(makeRequestPayload('high'), requestKey, 'phase17-request').record;
  const secondRequest = requestStore.appendSigned(makeRequestPayload('low', 'low', false), requestKey, 'phase17-request').record;
  const approvalsComplete = {
    evidenceReview: true,
    editorialReview: true,
    legalReview: true,
    productionOwnerApproval: true,
  };
  const base = {
    changeRequestId: firstRequest.id,
    requestStore,
    decisionStore,
    auditLog,
    requestSigningKey: requestKey,
    decisionSigningKey: decisionKey,
    decisionSigningKeyId: 'phase17-decision',
    decision: 'approve',
    reviewerName: 'final-reviewer',
    reviewerRole: 'production-owner',
    reviewerNote: 'Approve this advisory request record for a separate manual production execution review.',
    completedApprovals: approvalsComplete,
  };

  await rejects(() => decideProductionChangeRequest({ ...base, requestSigningKey: '' }), /at least 32 bytes/);
  await rejects(() => decideProductionChangeRequest({ ...base, decisionSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => decideProductionChangeRequest({ ...base, changeRequestId: '' }), /changeRequestId/);
  await rejects(() => decideProductionChangeRequest({ ...base, decision: 'maybe' }), /approve or reject/);
  await rejects(() => decideProductionChangeRequest({ ...base, reviewerName: '' }), /reviewerName/);
  await rejects(() => decideProductionChangeRequest({ ...base, reviewerRole: '' }), /reviewerRole/);
  await rejects(() => decideProductionChangeRequest({ ...base, reviewerNote: 'short' }), /reviewerNote/);
  await rejects(() => decideProductionChangeRequest({ ...base, completedApprovals: null }), /completedApprovals/);
  await rejects(() => decideProductionChangeRequest({ ...base, completedApprovals: { ...approvalsComplete, evidenceReview: 'yes' } }), /must be boolean/);
  await rejects(() => decideProductionChangeRequest({ ...base, changeRequestId: 'change_request_missing' }), /not found/);
  await rejects(() => decideProductionChangeRequest({ ...base, completedApprovals: { ...approvalsComplete, evidenceReview: false } }), /evidenceReview/);
  await rejects(() => decideProductionChangeRequest({ ...base, completedApprovals: { ...approvalsComplete, editorialReview: false } }), /editorialReview/);
  await rejects(() => decideProductionChangeRequest({ ...base, completedApprovals: { ...approvalsComplete, productionOwnerApproval: false } }), /productionOwnerApproval/);
  await rejects(() => decideProductionChangeRequest({ ...base, completedApprovals: { ...approvalsComplete, legalReview: false } }), /legalReview/);

  const approved = decideProductionChangeRequest(base);
  check(() => assert.equal(approved.decision, 'approve'));
  check(() => assert.equal(approved.targetCount, 2));
  check(() => assert.equal(approved.executionAuthorityGranted, false));
  check(() => assert.equal(approved.productionWrites, 0));
  check(() => assert.equal(approved.publicationTasksCreated, 0));
  check(() => assert.equal(approved.commitActions, 0));
  check(() => assert.equal(approved.deploymentActions, 0));
  check(() => assert.equal(decisionStore.readRecords().length, 1));
  check(() => assert.equal(decisionStore.verify(decisionKey).valid, true));
  check(() => assert.equal(fs.readFileSync(decisionPath, 'utf8').includes(decisionKey), false));

  const approvalRecord = decisionStore.readRecords()[0];
  check(() => assert.equal(approvalRecord.payload.status, 'approved_authorisation_record_only'));
  check(() => assert.equal(approvalRecord.payload.authority, 'signed_human_decision_only_no_execution_authority'));
  check(() => assert.equal(approvalRecord.payload.changeRequest.id, firstRequest.id));
  check(() => assert.equal(approvalRecord.payload.changeRequest.recordHash, firstRequest.recordHash));
  check(() => assert.equal(approvalRecord.payload.changeRequest.payloadHash, firstRequest.payloadHash));
  check(() => assert.equal(approvalRecord.payload.completedApprovals.legalReview, true));
  check(() => assert.equal(approvalRecord.payload.productionFilePath, null));
  check(() => assert.equal(approvalRecord.payload.productionDestinationResolved, false));
  check(() => assert.equal(approvalRecord.payload.executionAuthorityGranted, false));
  check(() => assert.equal(approvalRecord.payload.nextAction, 'separate_manual_production_execution_review'));
  check(() => assert.equal(approvalRecord.payload.safety.executionAllowed, false));
  check(() => assert.ok(approvalRecord.payload.targetIds.every((item, index, array) => index === 0 || array[index - 1] < item)));

  const duplicate = decideProductionChangeRequest(base);
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(duplicate.changeDecisionId, approved.changeDecisionId));
  check(() => assert.equal(decisionStore.readRecords().length, 1));
  await rejects(() => decideProductionChangeRequest({
    ...base,
    decision: 'reject',
    reviewerNote: 'A conflicting rejection must not replace the existing signed approval record.',
  }), /different signed production change decision/);

  const rejected = decideProductionChangeRequest({
    ...base,
    changeRequestId: secondRequest.id,
    decision: 'reject',
    reviewerName: 'second-reviewer',
    reviewerRole: 'editorial-reviewer',
    reviewerNote: 'Reject because the proposed production change requires additional evidence and review.',
    completedApprovals: {
      evidenceReview: false,
      editorialReview: true,
      legalReview: false,
      productionOwnerApproval: false,
    },
  });
  check(() => assert.equal(rejected.decision, 'reject'));
  check(() => assert.equal(rejected.executionAuthorityGranted, false));
  check(() => assert.equal(decisionStore.readRecords().length, 2));
  check(() => assert.equal(decisionStore.readRecords()[1].payload.status, 'rejected_no_authorisation'));
  check(() => assert.equal(decisionStore.readRecords()[1].payload.nextAction, 'none'));
  check(() => assert.equal(decisionStore.readRecords()[1].previousRecordHash, decisionStore.readRecords()[0].recordHash));
  check(() => assert.equal(decisionStore.verify(decisionKey).valid, true));
  check(() => assert.equal(decisionStore.verify('different-decision-signing-key-that-is-long-enough').valid, false));

  const tamperedDecisionPath = path.join(runtime, 'tampered-decisions.jsonl');
  fs.copyFileSync(decisionPath, tamperedDecisionPath);
  const tamperedDecisions = fs.readFileSync(tamperedDecisionPath, 'utf8').trim().split('\n').map(JSON.parse);
  tamperedDecisions[0].payload.reviewer.note = 'tampered';
  fs.writeFileSync(tamperedDecisionPath, `${tamperedDecisions.map(JSON.stringify).join('\n')}\n`);
  check(() => assert.equal(new ProductionChangeDecisionStore(tamperedDecisionPath).verify(decisionKey).valid, false));

  const originalRequests = fs.readFileSync(requestPath, 'utf8');
  const tamperedRequests = originalRequests.trim().split('\n').map(JSON.parse);
  tamperedRequests[0].payload.requester.note = 'tampered request';
  fs.writeFileSync(requestPath, `${tamperedRequests.map(JSON.stringify).join('\n')}\n`);
  await rejects(() => decideProductionChangeRequest({ ...base, changeRequestId: secondRequest.id }), /request ledger verification failed/i);
  fs.writeFileSync(requestPath, originalRequests);

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.ok(auditLog.readEntries().every((entry) => (
    entry.details.executionAuthorityGranted === false
      && entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0
      && entry.details.commitActions === 0
      && entry.details.deploymentActions === 0
  ))));
  for (const condition of [
    sha256(fs.readFileSync(productionFile)) === productionHash,
    !fs.existsSync(path.join(root, 'data', 'production-change-decision.json')),
    !fs.existsSync(path.join(root, '.git', 'index.lock')),
    !fs.existsSync(path.join(root, 'deploy')),
  ]) check(() => assert.equal(condition, true));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedDecisions: decisionStore.readRecords().length,
    approved: 1,
    rejected: 1,
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
