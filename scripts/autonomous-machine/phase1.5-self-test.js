#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { sha256, stableStringify } = require('./route-registry');
const { StagingPreviewStore } = require('./staging-preview-store');
const { StagingApplyStore } = require('./staging-apply-store');
const { applyStagingPreview, applyPreviewOperations, validateAppliedDocument } = require('./staging-preview-applier');

const clone = (value) => JSON.parse(JSON.stringify(value));

async function runTests() {
  let checks = 0;
  const check = (fn) => { fn(); checks += 1; };
  const rejects = async (fn, pattern) => { await assert.rejects(async () => fn(), pattern); checks += 1; };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase15-'));
  const runtimeRoot = path.join(root, '.autonomous-machine');
  const previewStore = new StagingPreviewStore(runtimeRoot);
  const applyStore = new StagingApplyStore(runtimeRoot);
  const auditLog = new AuditLog(path.join(runtimeRoot, 'audit.jsonl'));
  const productionFile = path.join(root, 'data', 'production.json');
  fs.mkdirSync(path.dirname(productionFile), { recursive: true });
  fs.writeFileSync(productionFile, '{"untouched":true}\n');
  const productionHash = sha256(fs.readFileSync(productionFile));

  const generatedFrom = { handoffId: 'handoff_test', handoffRecordHash: '1'.repeat(64), handoffPayloadHash: '2'.repeat(64), signingKeyId: 'phase15-test', routeBatchId: 'route_batch_test', reviewRecordId: 'review_test', reviewer: 'tester', reviewNote: 'Approved for disposable staging validation only.', decidedAt: '2026-07-29T20:20:00.000Z' };
  const sourceSnapshot = { sourceId: 'doj-sdny', sourceLabel: 'DOJ SDNY', sourceUrl: 'https://www.justice.gov/usao-sdny/pr/example', title: 'Example Person Indicted', evidenceClass: 'official', sensitivity: 'medium', evidenceBoundary: 'An indictment is an allegation, not a conviction.', provenance: [{ sourceId: 'doj-sdny', locator: 'https://www.justice.gov/usao-sdny/pr/example', retrievedAt: '2026-07-29T20:00:00.000Z' }], reviewFingerprint: '3'.repeat(64) };
  const routeCandidates = [
    { targetId: 'dossier-pack:crime-state-overlap', targetType: 'dossier_pack', title: 'Crime State Overlap', route: 'dossier-pack-crime-state-overlap.html', evidenceRoute: 'evidence-lane-court-records.html', machineRoute: 'authority-crime-state.html', match: { score: 8, confidence: 'high', reasons: ['lane_match'] }, evidenceBoundary: 'An indictment is an allegation, not a conviction.', status: 'proposed_for_manual_production_review' },
    { targetId: 'epstein-person:example-person', targetType: 'person_tracker', title: 'Example Person', route: 'epstein-files.html#epstein-people-tracker', evidenceRoute: 'downloads/epstein-people-index.json', machineRoute: null, match: { score: 100, confidence: 'high', reasons: ['exact_name_match'] }, evidenceBoundary: 'Association is not guilt.', status: 'proposed_for_manual_production_review' },
  ];
  const before = { schemaVersion: 1, documentType: 'route_handoff_staging_document', generatedFrom: null, sourceSnapshot: null, routeCandidates: [] };
  const after = { schemaVersion: 1, documentType: 'route_handoff_staging_document', generatedFrom, sourceSnapshot, routeCandidates };
  const patch = { format: 'json-patch-preview', target: 'isolated_staging_document', productionTarget: null, operations: [
    { op: 'replace', path: '/generatedFrom', value: generatedFrom },
    { op: 'replace', path: '/sourceSnapshot', value: sourceSnapshot },
    { op: 'replace', path: '/routeCandidates', value: routeCandidates },
  ] };
  const safety = { productionTarget: null, autoApplyAllowed: false, commitAllowed: false, deploymentAllowed: false, publicationAllowed: false, productionWrites: 0, publicationTasksCreated: 0, commitActions: 0, deploymentActions: 0 };
  const baseBundle = { schemaVersion: 1, previewType: 'route_handoff_staging_preview', mode: 'preview_only', handoff: { id: 'handoff_test', recordHash: '1'.repeat(64), payloadHash: '2'.repeat(64), routeBatchId: 'route_batch_test', decision: 'accept' }, registryFingerprint: '4'.repeat(64), before, after, patch, safety };
  const preview = previewStore.add(baseBundle).preview;

  for (const [options, pattern] of [
    [{ previewId: '', previewStore, applyStore, auditLog }, /requires previewId/],
    [{ previewId: 'missing', previewStore, applyStore, auditLog }, /not found/],
    [{ previewId: preview.id, previewStore: null, applyStore, auditLog }, /requires previewStore/],
    [{ previewId: preview.id, previewStore, applyStore: null, auditLog }, /requires previewStore/],
    [{ previewId: preview.id, previewStore, applyStore, auditLog: null }, /requires previewStore/],
    [{ previewId: preview.id, previewStore, applyStore, auditLog, expectedPreviewFingerprint: 'f'.repeat(64) }, /does not match/],
  ]) await rejects(() => applyStagingPreview(options), pattern);

  check(() => assert.deepEqual(applyPreviewOperations(before, patch.operations), after));
  check(() => assert.equal(validateAppliedDocument(after), true));
  await rejects(() => applyPreviewOperations(before, [{ op: 'add', path: '/generatedFrom', value: generatedFrom }]), /only permits replace/);
  await rejects(() => applyPreviewOperations(before, [{ op: 'replace', path: '/notAllowed', value: {} }]), /path is not allowed/);
  await rejects(() => applyPreviewOperations(before, [{ op: 'replace', path: '/generatedFrom', value: generatedFrom }, { op: 'replace', path: '/generatedFrom', value: generatedFrom }, { op: 'replace', path: '/sourceSnapshot', value: sourceSnapshot }]), /duplicate path/);
  await rejects(() => applyPreviewOperations(before, [{ op: 'replace', path: '/generatedFrom', value: generatedFrom }, { op: 'replace', path: '/sourceSnapshot', value: sourceSnapshot }]), /complete staging patch set/);

  const result = applyStagingPreview({ previewId: preview.id, expectedPreviewFingerprint: preview.fingerprint, previewStore, applyStore, auditLog });
  const resultExpectations = {
    exactMatch: true, operationCount: 3, routeCandidateCount: 2, productionWrites: 0,
    publicationTasksCreated: 0, commitActions: 0, deploymentActions: 0, deduplicated: false,
  };
  for (const [field, value] of Object.entries(resultExpectations)) check(() => assert.equal(result[field], value));
  for (const verification of [applyStore.verify(), previewStore.verify(), auditLog.verify()]) check(() => assert.equal(verification.valid, true));
  check(() => assert.equal(applyStore.list().length, 1));
  check(() => assert.equal(sha256(fs.readFileSync(productionFile)), productionHash));

  const stored = applyStore.read(result.applicationId);
  const storedExpectations = {
    mode: 'disposable_runtime_only', applyType: 'disposable_staging_application', exactMatch: true,
    beforeHash: sha256(stableStringify(before)), expectedAfterHash: sha256(stableStringify(after)),
    actualAfterHash: sha256(stableStringify(after)), patchHash: sha256(stableStringify(patch)),
  };
  for (const [field, value] of Object.entries(storedExpectations)) check(() => assert.equal(stored[field], value));
  const safetyExpectations = { workspaceType: 'disposable_runtime_copy', productionTarget: null, productionWriteAllowed: false, commitAllowed: false, deploymentAllowed: false, publicationAllowed: false, productionWrites: 0, publicationTasksCreated: 0, commitActions: 0, deploymentActions: 0 };
  for (const [field, value] of Object.entries(safetyExpectations)) check(() => assert.equal(stored.safety[field], value));
  check(() => assert.equal(stored.diff.operationCount, 3));
  check(() => assert.deepEqual(stored.diff.changedTopLevelPaths, ['/generatedFrom', '/sourceSnapshot', '/routeCandidates']));
  check(() => assert.equal(stored.diff.exactPreviewMatch, true));
  check(() => assert.equal(stored.diffHash, sha256(stableStringify(stored.diff))));
  check(() => assert.deepEqual(stored.appliedDocument, after));

  const duplicate = applyStagingPreview({ previewId: preview.id, previewStore, applyStore, auditLog });
  check(() => assert.equal(duplicate.deduplicated, true));
  check(() => assert.equal(duplicate.applicationId, result.applicationId));
  check(() => assert.equal(applyStore.list().length, 1));
  check(() => assert.equal(auditLog.readEntries().length, 2));
  check(() => assert.ok(auditLog.readEntries().every((entry) => ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions'].every((field) => entry.details[field] === 0))));

  const variants = [
    [(bundle) => { bundle.after.routeCandidates[0].title = 'Expected title differs'; }, /does not exactly match/],
    [(bundle) => { bundle.patch.operations[2].path = '/other'; }, /path is not allowed/],
    [(bundle) => { bundle.patch.operations[2].path = '/sourceSnapshot'; }, /duplicate path/],
    [(bundle) => { bundle.after.routeCandidates[0].route = '../escape.html'; bundle.patch.operations[2].value = bundle.after.routeCandidates; }, /unsafe path segment/],
    [(bundle) => { bundle.after.routeCandidates[1].targetId = bundle.after.routeCandidates[0].targetId; bundle.patch.operations[2].value = bundle.after.routeCandidates; }, /duplicate route target/],
    [(bundle) => { bundle.after.sourceSnapshot.provenance = []; bundle.patch.operations[1].value = bundle.after.sourceSnapshot; }, /requires source provenance/],
    [(bundle) => { bundle.after.routeCandidates[0].status = 'publish_now'; bundle.patch.operations[2].value = bundle.after.routeCandidates; }, /status is invalid/],
  ];
  for (const [mutate, pattern] of variants) {
    const bundle = clone(baseBundle); mutate(bundle);
    const badPreview = previewStore.add(bundle).preview;
    await rejects(() => applyStagingPreview({ previewId: badPreview.id, previewStore, applyStore, auditLog }), pattern);
  }

  const applicationPath = applyStore.applyFilePath(applyStore.loadIndex().applications[0].fileName);
  const tampered = JSON.parse(fs.readFileSync(applicationPath, 'utf8'));
  tampered.appliedDocument.routeCandidates[0].title = 'Tampered';
  fs.writeFileSync(applicationPath, `${JSON.stringify(tampered, null, 2)}\n`);
  check(() => assert.equal(applyStore.verify().valid, false));
  await rejects(() => applyStagingPreview({ previewId: preview.id, previewStore, applyStore, auditLog }), /Staging application store verification failed/);

  const indexRoot = path.join(root, '.autonomous-machine-index-tamper');
  const indexStore = new StagingApplyStore(indexRoot);
  const index = indexStore.loadIndex();
  index.applications.push({ id: 'apply_bad', fingerprint: 'a'.repeat(64), status: 'disposable_staging_application_only', previewId: preview.id, previewFingerprint: preview.fingerprint, fileName: '../escape.json', createdAt: '2026-07-29T20:30:00.000Z' });
  indexStore.saveIndex(index);
  check(() => assert.equal(indexStore.verify().reason, 'apply_file_name_invalid'));
  for (const condition of [
    sha256(fs.readFileSync(productionFile)) === productionHash,
    !fs.existsSync(path.join(root, 'data', 'route-handoff-staging-document.json')),
    !fs.existsSync(path.join(root, '.git', 'index.lock')),
    !fs.existsSync(path.join(root, 'deploy')),
  ]) check(() => assert.equal(condition, true));

  process.stdout.write(`${JSON.stringify({ ok: true, tests: checks, applications: 1, routeCandidates: result.routeCandidateCount, exactMatch: true, productionWrites: 0, publicationTasksCreated: 0, commitActions: 0, deploymentActions: 0, auditEntries: auditLog.verify().entries }, null, 2)}\n`);
}

runTests().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
