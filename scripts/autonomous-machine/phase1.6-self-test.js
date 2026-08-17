#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { sha256, stableStringify } = require('./route-registry');
const { StagingApplyStore } = require('./staging-apply-store');
const { buildProductionChangeRequest } = require('./production-change-request-builder');
const { ProductionChangeRequestStore } = require('./production-change-request-store');

async function runTests() {
  let checks = 0;
  const check = (fn) => { fn(); checks += 1; };
  const rejects = async (fn, pattern) => { await assert.rejects(async () => fn(), pattern); checks += 1; };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase16-'));
  const runtime = path.join(root, '.autonomous-machine');
  const productionFile = path.join(root, 'data', 'production-sentinel.json');
  fs.mkdirSync(path.dirname(productionFile), { recursive: true });
  fs.writeFileSync(productionFile, '{"untouched":true}\n');
  const productionHash = sha256(fs.readFileSync(productionFile));
  const key = 'phase-1.6-separate-change-request-signing-key-32-bytes';

  const buildDocument = (overrides = {}) => ({
    schemaVersion: 1,
    documentType: 'route_handoff_staging_document',
    generatedFrom: {
      handoffId: overrides.handoffId || 'handoff_example',
      routeBatchId: overrides.routeBatchId || 'route_example',
      reviewRecordId: 'review_example',
      reviewer: 'phase16-reviewer',
      reviewNote: 'Accepted for advisory production review only.',
    },
    sourceSnapshot: {
      sourceId: 'doj-sdny',
      sourceLabel: 'DOJ SDNY',
      sourceUrl: 'https://www.justice.gov/usao-sdny/pr/example',
      title: 'Example Person Indicted',
      evidenceClass: 'official',
      sensitivity: overrides.sensitivity || 'medium',
      evidenceBoundary: 'An indictment is an allegation, not a conviction.',
      provenance: overrides.provenance === undefined ? [{
        sourceId: 'doj-sdny',
        locator: 'https://www.justice.gov/usao-sdny/pr/example',
        retrievedAt: '2026-07-29T20:30:00.000Z',
      }] : overrides.provenance,
    },
    routeCandidates: overrides.routeCandidates || [{
      targetId: 'dossier-pack:crime-state-overlap',
      targetType: 'dossier_pack',
      title: 'Crime State Overlap',
      route: 'dossier-pack-crime-state-overlap.html',
      evidenceRoute: 'evidence-lane-court-records.html',
      machineRoute: 'authority-crime-state.html',
      match: { score: 8, confidence: 'high', reasons: ['lane_match'] },
      evidenceBoundary: 'An indictment is an allegation, not a conviction.',
      status: 'proposed_for_manual_production_review',
    }, {
      targetId: 'epstein-person:example-person',
      targetType: 'person_tracker',
      title: 'Example Person',
      route: 'epstein-files.html#epstein-people-tracker',
      evidenceRoute: 'downloads/epstein-people-index.json',
      machineRoute: null,
      match: { score: 100, confidence: 'high', reasons: ['exact_name_match'] },
      evidenceBoundary: 'Association is not guilt.',
      status: 'proposed_for_manual_production_review',
    }],
  });

  const buildBundle = (document, overrides = {}) => {
    const documentHash = sha256(stableStringify(document));
    const diff = overrides.diff || {
      format: 'canonical-json-diff-summary',
      changedTopLevelPaths: ['/generatedFrom', '/sourceSnapshot', '/routeCandidates'],
      operationCount: 3,
      beforeHash: '1'.repeat(64),
      afterHash: documentHash,
      exactPreviewMatch: overrides.exactPreviewMatch === undefined ? true : overrides.exactPreviewMatch,
    };
    return {
      schemaVersion: 1,
      applyType: 'disposable_staging_application',
      mode: 'disposable_runtime_only',
      preview: {
        id: overrides.previewId || 'preview_example',
        fingerprint: overrides.previewFingerprint || '2'.repeat(64),
        handoffId: document.generatedFrom.handoffId,
        routeBatchId: document.generatedFrom.routeBatchId,
      },
      beforeHash: '1'.repeat(64),
      expectedAfterHash: overrides.expectedAfterHash || documentHash,
      actualAfterHash: overrides.actualAfterHash || documentHash,
      patchHash: '3'.repeat(64),
      exactMatch: overrides.exactMatch === undefined ? true : overrides.exactMatch,
      appliedDocument: document,
      diff,
      diffHash: overrides.diffHash || sha256(stableStringify(diff)),
      safety: {
        workspaceType: overrides.workspaceType || 'disposable_runtime_copy',
        productionTarget: overrides.productionTarget === undefined ? null : overrides.productionTarget,
        productionWriteAllowed: overrides.productionWriteAllowed === undefined ? false : overrides.productionWriteAllowed,
        commitAllowed: false,
        deploymentAllowed: false,
        publicationAllowed: false,
        productionWrites: overrides.productionWrites || 0,
        publicationTasksCreated: 0,
        commitActions: 0,
        deploymentActions: 0,
      },
    };
  };

  const applyStore = new StagingApplyStore(runtime);
  const requestPath = path.join(runtime, 'production-change-requests.jsonl');
  const requestStore = new ProductionChangeRequestStore(requestPath);
  const auditLog = new AuditLog(path.join(runtime, 'audit.jsonl'));
  const application = applyStore.add(buildBundle(buildDocument())).application;
  const base = {
    applicationId: application.id,
    applyStore,
    requestStore,
    auditLog,
    signingKey: key,
    signingKeyId: 'phase16-test-key',
    requesterName: 'production-reviewer',
    requesterNote: 'Request manual production review of the signed, exact staging result only.',
  };

  await rejects(() => buildProductionChangeRequest({ ...base, signingKey: '' }), /at least 32 bytes/);
  await rejects(() => buildProductionChangeRequest({ ...base, signingKey: 'short' }), /at least 32 bytes/);
  await rejects(() => buildProductionChangeRequest({ ...base, applicationId: '' }), /applicationId/);
  await rejects(() => buildProductionChangeRequest({ ...base, requesterName: '' }), /requesterName/);
  await rejects(() => buildProductionChangeRequest({ ...base, requesterNote: 'short' }), /requesterNote/);
  await rejects(() => buildProductionChangeRequest({ ...base, applicationId: 'apply_missing' }), /not found/);

  const result = buildProductionChangeRequest(base);
  check(() => assert.equal(result.changeCount, 2));
  check(() => assert.equal(result.legalReviewRequired, true));
  check(() => assert.equal(result.productionWrites, 0));
  check(() => assert.equal(result.publicationTasksCreated, 0));
  check(() => assert.equal(result.commitActions, 0));
  check(() => assert.equal(result.deploymentActions, 0));
  check(() => assert.equal(requestStore.readRecords().length, 1));
  check(() => assert.equal(requestStore.verify(key).valid, true));
  check(() => assert.equal(fs.readFileSync(requestPath, 'utf8').includes(key), false));

  const record = requestStore.readRecords()[0];
  check(() => assert.equal(record.payload.mode, 'change_request_only'));
  check(() => assert.equal(record.payload.authority, 'advisory_only_manual_production_authorisation_required'));
  check(() => assert.equal(record.payload.status, 'pending_production_change_review'));
  check(() => assert.equal(record.payload.application.id, application.id));
  check(() => assert.equal(record.payload.application.exactMatch, true));
  check(() => assert.equal(record.payload.requiredApprovals.evidenceReview, true));
  check(() => assert.equal(record.payload.requiredApprovals.editorialReview, true));
  check(() => assert.equal(record.payload.requiredApprovals.productionOwnerApproval, true));
  check(() => assert.equal(record.payload.requiredApprovals.legalReview, true));
  check(() => assert.ok(record.payload.changes.every((change) => change.productionFilePath === null)));
  check(() => assert.ok(record.payload.changes.every((change) => change.productionDestinationResolved === false)));
  check(() => assert.ok(record.payload.changes.every((change) => change.reviewStatus === 'pending_manual_production_review')));
  check(() => assert.equal(record.payload.safety.productionTarget, null));
  check(() => assert.equal(record.payload.safety.productionWriteAllowed, false));
  check(() => assert.equal(record.payload.safety.commitAllowed, false));
  check(() => assert.equal(record.payload.safety.deploymentAllowed, false));
  check(() => assert.equal(record.payload.safety.publicationAllowed, false));

  const duplicate = buildProductionChangeRequest(base);
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(duplicate.changeRequestId, result.changeRequestId));
  check(() => assert.equal(requestStore.readRecords().length, 1));
  await rejects(() => buildProductionChangeRequest({ ...base, requesterNote: 'A conflicting rationale must not replace the signed request package.' }), /different signed production change request/);

  const lowDocument = buildDocument({
    handoffId: 'handoff_low',
    routeBatchId: 'route_low',
    sensitivity: 'low',
    routeCandidates: [{
      targetId: 'dossier-pack:crime-state-overlap-low',
      targetType: 'dossier_pack',
      title: 'Crime State Overlap Low',
      route: 'dossier-pack-crime-state-overlap.html',
      evidenceRoute: 'evidence-lane-court-records.html',
      machineRoute: null,
      match: { score: 4, confidence: 'medium', reasons: ['keyword_match'] },
      evidenceBoundary: 'Review required.',
      status: 'proposed_for_manual_production_review',
    }],
  });
  const lowApplication = applyStore.add(buildBundle(lowDocument, { previewId: 'preview_low', previewFingerprint: '4'.repeat(64) })).application;
  const second = buildProductionChangeRequest({ ...base, applicationId: lowApplication.id, requesterNote: 'Request manual review of the second exact disposable result.' });
  check(() => assert.equal(second.legalReviewRequired, false));
  check(() => assert.equal(requestStore.readRecords().length, 2));
  check(() => assert.equal(requestStore.readRecords()[1].previousRecordHash, requestStore.readRecords()[0].recordHash));
  check(() => assert.equal(requestStore.verify(key).valid, true));
  check(() => assert.equal(requestStore.verify('different-change-request-signing-key-long-enough').valid, false));

  async function invalidApplicationTest(document, bundleOverrides, pattern) {
    const invalidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase16-invalid-'));
    const invalidRequestStore = new ProductionChangeRequestStore(path.join(invalidRoot, 'requests.jsonl'));
    const invalidAudit = new AuditLog(path.join(invalidRoot, 'audit.jsonl'));
    const invalidApp = {
      ...buildBundle(document, bundleOverrides),
      id: 'apply_invalid_test',
      fingerprint: '9'.repeat(64),
      status: 'disposable_staging_application_only',
    };
    const invalidApplyStore = {
      verify: () => ({ valid: true, applications: 1 }),
      read: (id) => (id === invalidApp.id ? invalidApp : null),
    };
    await rejects(() => buildProductionChangeRequest({
      ...base,
      applicationId: invalidApp.id,
      applyStore: invalidApplyStore,
      requestStore: invalidRequestStore,
      auditLog: invalidAudit,
    }), pattern);
  }

  await invalidApplicationTest(buildDocument(), { exactMatch: false }, /exact staging application/);
  await invalidApplicationTest(buildDocument(), { productionTarget: 'data/live-intel.json' }, /production target/);
  await invalidApplicationTest(buildDocument(), { productionWriteAllowed: true }, /productionWriteAllowed/);
  await invalidApplicationTest(buildDocument(), { productionWrites: 1 }, /productionWrites/);
  await invalidApplicationTest(buildDocument(), { workspaceType: 'production_checkout' }, /disposable runtime/);
  await invalidApplicationTest(buildDocument(), { actualAfterHash: 'a'.repeat(64) }, /document hash is not exact/);
  await invalidApplicationTest(buildDocument(), { diffHash: 'b'.repeat(64) }, /diff hash is invalid/);
  await invalidApplicationTest(buildDocument(), { exactPreviewMatch: false }, /exactPreviewMatch/);
  await invalidApplicationTest(buildDocument({ provenance: [] }), {}, /source provenance/);
  await invalidApplicationTest(buildDocument({ routeCandidates: [{
    targetId: 'unsafe', targetType: 'dossier_pack', title: 'Unsafe', route: '../escape.html', evidenceRoute: 'evidence.html', machineRoute: null, status: 'proposed_for_manual_production_review',
  }] }), {}, /unsafe path segment/);
  const duplicateTarget = buildDocument().routeCandidates[0];
  await invalidApplicationTest(buildDocument({ routeCandidates: [duplicateTarget, { ...duplicateTarget }] }), {}, /duplicate route target/);

  const tamperedPath = path.join(runtime, 'tampered-change-requests.jsonl');
  fs.copyFileSync(requestPath, tamperedPath);
  const tampered = fs.readFileSync(tamperedPath, 'utf8').trim().split('\n').map(JSON.parse);
  tampered[0].payload.requester.note = 'tampered';
  fs.writeFileSync(tamperedPath, `${tampered.map(JSON.stringify).join('\n')}\n`);
  const tamperedStore = new ProductionChangeRequestStore(tamperedPath);
  check(() => assert.equal(tamperedStore.verify(key).valid, false));

  const applyIndex = applyStore.loadIndex();
  const firstApplyPath = path.join(runtime, 'staging-applies', applyIndex.applications[0].fileName);
  const originalApplication = fs.readFileSync(firstApplyPath, 'utf8');
  const alteredApplication = JSON.parse(originalApplication);
  alteredApplication.appliedDocument.sourceSnapshot.title = 'Tampered application';
  fs.writeFileSync(firstApplyPath, JSON.stringify(alteredApplication, null, 2));
  await rejects(() => buildProductionChangeRequest({ ...base, applicationId: application.id }), /store verification failed/);
  fs.writeFileSync(firstApplyPath, originalApplication);

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.ok(auditLog.readEntries().every((entry) => (
    entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0
      && entry.details.commitActions === 0
      && entry.details.deploymentActions === 0
  ))));
  for (const condition of [
    sha256(fs.readFileSync(productionFile)) === productionHash,
    !fs.existsSync(path.join(root, 'data', 'production-change-request.json')),
    !fs.existsSync(path.join(root, '.git', 'index.lock')),
    !fs.existsSync(path.join(root, 'deploy')),
  ]) check(() => assert.equal(condition, true));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedChangeRequests: requestStore.readRecords().length,
    requestedChanges: record.payload.changes.length,
    legalReviewRequired: result.legalReviewRequired,
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
