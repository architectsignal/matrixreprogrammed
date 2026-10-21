#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ReviewStore } = require('./review-store');
const { ReviewHandoffStore } = require('./review-handoff-store');
const { RouteProposalStore } = require('./route-proposal-store');
const { loadRouteRegistry, sha256, stableStringify } = require('./route-registry');
const { reviewRouteProposal } = require('./route-review-service');
const { buildStagingPreview } = require('./staging-preview-builder');
const { StagingPreviewStore } = require('./staging-preview-store');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function runTests() {
  let checks = 0;
  const check = (fn) => { fn(); checks += 1; };
  const rejects = async (fn, pattern) => { await assert.rejects(async () => fn(), pattern); checks += 1; };

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase14-'));
  const packsPath = path.join(rootDir, 'data', 'dossier-packs.json');
  const peoplePath = path.join(rootDir, 'data', 'epstein-people-index.json');
  writeJson(packsPath, {
    packs: [{
      slug: 'crime-state-overlap',
      title: 'Crime State Overlap',
      keywords: ['indictment', 'money laundering'],
      subjectMap: ['court records'],
      weeklyWatch: ['indictments'],
      evidenceUpgradePath: ['conviction'],
      evidenceRoute: 'evidence-lane-court-records.html',
      machineRoute: 'authority-crime-state.html',
    }],
  });
  writeJson(peoplePath, {
    people: [{
      name: 'Example Person',
      evidenceClass: 'Court record',
      boundary: 'Association is not guilt.',
    }],
  });
  const beforePackHash = sha256(fs.readFileSync(packsPath));
  const beforePeopleHash = sha256(fs.readFileSync(peoplePath));
  const routeRegistry = loadRouteRegistry(rootDir);
  const runtimeDir = path.join(rootDir, '.autonomous-machine');
  const reviewStore = new ReviewStore(path.join(runtimeDir, 'review-queue.json'));
  const proposalStore = new RouteProposalStore(path.join(runtimeDir, 'route-proposals.json'));
  const handoffPath = path.join(runtimeDir, 'review-handoffs.jsonl');
  const handoffStore = new ReviewHandoffStore(handoffPath);
  const previewStore = new StagingPreviewStore(runtimeDir);
  const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));
  const key = 'phase-1.4-test-signing-key-with-at-least-32-bytes';
  const now = () => new Date('2026-07-29T20:00:00.000Z');

  const createReview = (title) => reviewStore.add({
    sourceId: 'doj-sdny',
    sourceLabel: 'DOJ SDNY',
    sourceUrl: `https://www.justice.gov/usao-sdny/pr/${title.toLowerCase().replace(/\s+/g, '-')}`,
    feedUrl: 'https://www.justice.gov/news/rss?type=press_release&field_component_target_id=395',
    lane: 'crime-state-overlap',
    title,
    summary: 'Official indictment record.',
    publishedAt: '2026-07-29T10:00:00.000Z',
    fetchedAt: '2026-07-29T11:00:00.000Z',
    evidenceClass: 'official',
    sensitivity: 'medium',
    evidenceBoundary: 'An indictment is an allegation, not a conviction.',
    provenance: [{
      sourceId: 'doj-sdny',
      locator: 'https://www.justice.gov/usao-sdny/pr/example',
      retrievedAt: '2026-07-29T11:00:00.000Z',
    }],
  }).record;
  const makeBatch = (review, proposals) => proposalStore.add({
    reviewRecordId: review.id,
    reviewFingerprint: review.fingerprint,
    registryFingerprint: routeRegistry.fingerprint,
    proposalFingerprint: sha256(stableStringify(proposals)),
    matcherVersion: 1,
    proposals,
    unmatched: false,
  }).batch;
  const packProposal = {
    targetId: 'dossier-pack:crime-state-overlap',
    targetType: 'dossier_pack',
    title: 'Crime State Overlap',
    route: 'dossier-pack-crime-state-overlap.html',
    evidenceRoute: 'evidence-lane-court-records.html',
    score: 8,
    confidence: 'high',
    reasons: ['lane_match'],
  };
  const personProposal = {
    targetId: 'epstein-person:example-person',
    targetType: 'person_tracker',
    title: 'Example Person',
    route: 'epstein-files.html#epstein-people-tracker',
    evidenceRoute: 'downloads/epstein-people-index.json',
    score: 100,
    confidence: 'high',
    reasons: ['exact_name_match'],
  };
  const acceptReview = createReview('Example Person Indicted');
  const rejectReview = createReview('Unrelated Defendant Indicted');
  const acceptBatch = makeBatch(acceptReview, [packProposal, personProposal]);
  const rejectBatch = makeBatch(rejectReview, [packProposal]);
  const reviewBase = {
    routeRegistry,
    proposalStore,
    reviewStore,
    handoffStore,
    auditLog,
    signingKey: key,
    signingKeyId: 'phase14-test',
    now,
  };
  const accepted = reviewRouteProposal({
    ...reviewBase,
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [packProposal.targetId, personProposal.targetId],
    reviewer: 'phase14-tester',
    reviewNote: 'Approved for a staging preview only; production review remains required.',
  });
  const rejected = reviewRouteProposal({
    ...reviewBase,
    batchId: rejectBatch.id,
    decision: 'reject',
    reviewer: 'phase14-tester',
    reviewNote: 'Rejected because the proposed route is too broad for this source record.',
  });
  check(() => assert.equal(accepted.productionWrites, 0));
  check(() => assert.equal(rejected.publicationTasksCreated, 0));

  const buildBase = { handoffStore, routeRegistry, previewStore, auditLog, signingKey: key };
  await rejects(() => buildStagingPreview({ ...buildBase, signingKey: '', handoffId: accepted.decisionId }), /at least 32 bytes/);
  await rejects(() => buildStagingPreview({ ...buildBase, signingKey: 'different-signing-key-that-is-long-enough', handoffId: accepted.decisionId }), /ledger verification failed/);
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: 'handoff_missing' }), /not found/);
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: rejected.decisionId }), /Only accepted/);
  await rejects(() => new StagingPreviewStore(runtimeDir, '../escape'), /escapes runtime root/);
  await rejects(() => new StagingPreviewStore(runtimeDir, '/absolute'), /relative runtime path/);

  const previewResult = buildStagingPreview({ ...buildBase, handoffId: accepted.decisionId });
  check(() => assert.equal(previewResult.routeCandidateCount, 2));
  check(() => assert.equal(previewResult.productionWrites, 0));
  check(() => assert.equal(previewResult.publicationTasksCreated, 0));
  check(() => assert.equal(previewResult.commitActions, 0));
  check(() => assert.equal(previewResult.deploymentActions, 0));
  check(() => assert.equal(previewResult.deduplicated, false));
  check(() => assert.equal(previewStore.list().length, 1));
  const preview = previewStore.read(previewResult.previewId);
  check(() => assert.equal(preview.status, 'staging_preview_only'));
  check(() => assert.equal(preview.mode, 'preview_only'));
  check(() => assert.equal(preview.patch.target, 'isolated_staging_document'));
  check(() => assert.equal(preview.patch.productionTarget, null));
  check(() => assert.equal(preview.safety.productionTarget, null));
  check(() => assert.equal(preview.safety.autoApplyAllowed, false));
  check(() => assert.equal(preview.safety.commitAllowed, false));
  check(() => assert.equal(preview.safety.deploymentAllowed, false));
  check(() => assert.equal(preview.safety.publicationAllowed, false));
  check(() => assert.deepEqual(preview.before.routeCandidates, []));
  check(() => assert.equal(preview.after.routeCandidates.length, 2));
  check(() => assert.deepEqual(preview.after.routeCandidates.map((item) => item.targetId).sort(), [packProposal.targetId, personProposal.targetId].sort()));
  check(() => assert.equal(preview.after.routeCandidates.find((item) => item.targetId === packProposal.targetId).machineRoute, 'authority-crime-state.html'));
  check(() => assert.equal(preview.after.routeCandidates.find((item) => item.targetId === personProposal.targetId).machineRoute, null));
  check(() => assert.ok(preview.patch.operations.every((operation) => ['replace'].includes(operation.op))));
  check(() => assert.ok(preview.patch.operations.every((operation) => operation.path.startsWith('/'))));
  check(() => assert.equal(previewStore.verify().valid, true));
  const previewIndex = previewStore.loadIndex();
  const previewFilePath = path.join(previewStore.previewDir, previewIndex.previews[0].fileName);
  check(() => assert.ok(previewFilePath.startsWith(`${path.resolve(runtimeDir)}${path.sep}`)));
  check(() => assert.equal(fs.readFileSync(previewFilePath, 'utf8').includes(key), false));
  check(() => assert.equal(fs.existsSync(path.join(rootDir, 'staging-previews')), false));
  check(() => assert.equal(fs.existsSync(path.join(rootDir, 'preview.json')), false));
  check(() => assert.equal(sha256(fs.readFileSync(packsPath)), beforePackHash));
  check(() => assert.equal(sha256(fs.readFileSync(peoplePath)), beforePeopleHash));

  const duplicate = buildStagingPreview({ ...buildBase, handoffId: accepted.decisionId });
  check(() => assert.equal(duplicate.deduplicated, true));
  check(() => assert.equal(duplicate.previewId, previewResult.previewId));
  check(() => assert.equal(previewStore.list().length, 1));

  const acceptedRecord = handoffStore.readRecords().find((record) => record.id === accepted.decisionId);
  const appendVariant = (routeBatchId, patch) => handoffStore.appendSigned({
    ...acceptedRecord.payload,
    routeBatchId,
    ...patch,
  }, key, 'phase14-test').record;
  const stale = appendVariant('route_stale_preview_test', { registryFingerprint: 'f'.repeat(64) });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: stale.id }), /fingerprint is stale/);
  const routeChanged = appendVariant('route_changed_preview_test', {
    selectedTargetIds: [packProposal.targetId],
    selectedProposals: [{ ...packProposal, route: 'wrong-route.html' }],
  });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: routeChanged.id }), /changed after signing/);
  const badAuthority = appendVariant('route_bad_authority_test', { authority: 'publish_now' });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: badAuthority.id }), /authority is invalid/);
  const nonZero = appendVariant('route_non_zero_test', { productionWrites: 1 });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: nonZero.id }), /zero-write safety boundary/);
  const missingProvenance = appendVariant('route_missing_provenance_test', {
    sourceSnapshot: { ...acceptedRecord.payload.sourceSnapshot, provenance: [] },
  });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: missingProvenance.id }), /requires source provenance/);
  const duplicateTargets = appendVariant('route_duplicate_targets_test', {
    selectedTargetIds: [packProposal.targetId, packProposal.targetId],
    selectedProposals: [packProposal, packProposal],
  });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: duplicateTargets.id }), /duplicate route targets/);
  const incompleteSnapshot = appendVariant('route_incomplete_snapshot_test', {
    selectedTargetIds: [packProposal.targetId, personProposal.targetId],
    selectedProposals: [packProposal],
  });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: incompleteSnapshot.id }), /snapshot is incomplete/);
  const missingTarget = appendVariant('route_missing_target_test', {
    selectedTargetIds: ['dossier-pack:not-real'],
    selectedProposals: [{ ...packProposal, targetId: 'dossier-pack:not-real' }],
  });
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: missingTarget.id }), /no longer exists/);

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.ok(auditLog.readEntries().every((entry) => (
    (entry.details.productionWrites === undefined || entry.details.productionWrites === 0)
      && (entry.details.publicationTasksCreated === undefined || entry.details.publicationTasksCreated === 0)
      && (entry.details.commitActions === undefined || entry.details.commitActions === 0)
      && (entry.details.deploymentActions === undefined || entry.details.deploymentActions === 0)
  ))));

  const tampered = JSON.parse(fs.readFileSync(previewFilePath, 'utf8'));
  tampered.after.routeCandidates[0].title = 'Tampered Preview';
  fs.writeFileSync(previewFilePath, `${JSON.stringify(tampered, null, 2)}\n`);
  check(() => assert.equal(previewStore.verify().valid, false));
  await rejects(() => buildStagingPreview({ ...buildBase, handoffId: accepted.decisionId }), /failed integrity verification/);

  const indexTamperRoot = path.join(rootDir, '.autonomous-machine-index-tamper');
  const indexTamperStore = new StagingPreviewStore(indexTamperRoot);
  const indexData = indexTamperStore.loadIndex();
  indexData.previews.push({
    id: 'preview_tampered_index',
    fingerprint: 'a'.repeat(64),
    status: 'staging_preview_only',
    handoffId: accepted.decisionId,
    routeBatchId: acceptBatch.id,
    fileName: '../escape.json',
    createdAt: '2026-07-29T20:00:00.000Z',
  });
  indexTamperStore.saveIndex(indexData);
  check(() => assert.equal(indexTamperStore.verify().reason, 'preview_file_name_invalid'));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    previews: previewStore.list().length,
    routeCandidates: previewResult.routeCandidateCount,
    signedHandoffs: handoffStore.readRecords().length,
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
