#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ReviewStore } = require('./review-store');
const { ReviewHandoffStore } = require('./review-handoff-store');
const { RouteProposalStore, ROUTE_PROPOSAL_STATUSES } = require('./route-proposal-store');
const { loadRouteRegistry, sha256, stableStringify } = require('./route-registry');
const { reviewRouteProposal } = require('./route-review-service');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function runTests() {
  let checks = 0;
  const check = (fn) => {
    fn();
    checks += 1;
  };
  const rejects = async (fn, pattern) => {
    await assert.rejects(async () => fn(), pattern);
    checks += 1;
  };

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase13-'));
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
  const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));
  const key = 'phase-1.3-test-signing-key-with-at-least-32-bytes';
  const now = () => new Date('2026-07-29T19:20:00.000Z');

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
  const makeBatch = (review, proposals, unmatched = false, registryFingerprint = routeRegistry.fingerprint) => proposalStore.add({
    reviewRecordId: review.id,
    reviewFingerprint: review.fingerprint,
    registryFingerprint,
    proposalFingerprint: sha256(stableStringify(proposals)),
    matcherVersion: 1,
    proposals,
    unmatched,
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
  const unmatchedReview = createReview('No Route Match');
  const staleReview = createReview('Stale Registry Match');
  const acceptBatch = makeBatch(acceptReview, [packProposal, personProposal]);
  const rejectBatch = makeBatch(rejectReview, [packProposal]);
  const unmatchedBatch = makeBatch(unmatchedReview, [], true);
  const staleBatch = makeBatch(staleReview, [packProposal], false, 'f'.repeat(64));
  const base = {
    routeRegistry,
    proposalStore,
    reviewStore,
    handoffStore,
    auditLog,
    signingKey: key,
    signingKeyId: 'phase13-test',
    now,
  };

  await rejects(() => reviewRouteProposal({
    ...base,
    signingKey: '',
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [packProposal.targetId],
    reviewer: 'tester',
    reviewNote: 'Approved for manual handoff.',
  }), /at least 32 bytes/);
  await rejects(() => reviewRouteProposal({
    ...base,
    signingKey: 'short',
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [packProposal.targetId],
    reviewer: 'tester',
    reviewNote: 'Approved for manual handoff.',
  }), /at least 32 bytes/);
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [packProposal.targetId],
    reviewer: '',
    reviewNote: 'Approved for manual handoff.',
  }), /reviewer/);
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [packProposal.targetId],
    reviewer: 'tester',
    reviewNote: 'short',
  }), /reviewNote/);
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: 'route_missing',
    decision: 'reject',
    reviewer: 'tester',
    reviewNote: 'Reject because no route is appropriate.',
  }), /not found/);
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: staleBatch.id,
    decision: 'accept',
    selectedTargetIds: [packProposal.targetId],
    reviewer: 'tester',
    reviewNote: 'Approved for manual handoff.',
  }), /fingerprint is stale/);
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [],
    reviewer: 'tester',
    reviewNote: 'Approved for manual handoff.',
  }), /at least one matched/);
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: ['dossier-pack:not-real'],
    reviewer: 'tester',
    reviewNote: 'Approved for manual handoff.',
  }), /not in proposal batch/);
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: rejectBatch.id,
    decision: 'reject',
    selectedTargetIds: [packProposal.targetId],
    reviewer: 'tester',
    reviewNote: 'Reject because this route is not sufficiently specific.',
  }), /cannot include/);

  const accepted = reviewRouteProposal({
    ...base,
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [personProposal.targetId, packProposal.targetId],
    reviewer: 'tester',
    reviewNote: 'Approved as a route handoff only; production review remains required.',
  });
  check(() => assert.equal(accepted.decision, 'accept'));
  check(() => assert.equal(accepted.productionWrites, 0));
  check(() => assert.equal(accepted.publicationTasksCreated, 0));
  check(() => assert.deepEqual(accepted.selectedTargetIds, [packProposal.targetId, personProposal.targetId].sort()));
  check(() => assert.equal(proposalStore.get(acceptBatch.id).status, ROUTE_PROPOSAL_STATUSES.ACCEPTED));
  check(() => assert.equal(proposalStore.get(acceptBatch.id).decisionId, accepted.decisionId));
  check(() => assert.equal(handoffStore.readRecords().length, 1));
  check(() => assert.equal(handoffStore.verify(key).valid, true));
  check(() => assert.equal(fs.readFileSync(handoffPath, 'utf8').includes(key), false));
  check(() => assert.equal(handoffStore.readRecords()[0].signatureAlgorithm, 'hmac-sha256'));
  check(() => assert.equal(
    handoffStore.readRecords()[0].payload.authority,
    'handoff_only_manual_production_review_required',
  ));

  const duplicate = reviewRouteProposal({
    ...base,
    batchId: acceptBatch.id,
    decision: 'accept',
    selectedTargetIds: [packProposal.targetId, personProposal.targetId],
    reviewer: 'tester',
    reviewNote: 'Approved as a route handoff only; production review remains required.',
  });
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(handoffStore.readRecords().length, 1));
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: acceptBatch.id,
    decision: 'reject',
    reviewer: 'tester',
    reviewNote: 'Conflicting rejection after acceptance should fail.',
  }), /different signed decision/);

  const rejected = reviewRouteProposal({
    ...base,
    batchId: rejectBatch.id,
    decision: 'reject',
    reviewer: 'tester-two',
    reviewNote: 'Rejected because the proposed route is too broad for this record.',
  });
  check(() => assert.equal(rejected.decision, 'reject'));
  check(() => assert.equal(proposalStore.get(rejectBatch.id).status, ROUTE_PROPOSAL_STATUSES.REJECTED));
  check(() => assert.equal(handoffStore.readRecords().length, 2));
  check(() => assert.equal(
    handoffStore.readRecords()[1].previousRecordHash,
    handoffStore.readRecords()[0].recordHash,
  ));
  await rejects(() => reviewRouteProposal({
    ...base,
    batchId: unmatchedBatch.id,
    decision: 'accept',
    selectedTargetIds: [],
    reviewer: 'tester',
    reviewNote: 'Cannot accept an unmatched batch without a target.',
  }), /at least one matched/);
  const unmatchedRejected = reviewRouteProposal({
    ...base,
    batchId: unmatchedBatch.id,
    decision: 'reject',
    reviewer: 'tester',
    reviewNote: 'Rejected because the matcher produced no supported route target.',
  });
  check(() => assert.equal(unmatchedRejected.decision, 'reject'));
  check(() => assert.equal(handoffStore.readRecords().length, 3));
  check(() => assert.equal(sha256(fs.readFileSync(packsPath)), beforePackHash));
  check(() => assert.equal(sha256(fs.readFileSync(peoplePath)), beforePeopleHash));
  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.equal(
    auditLog.readEntries().every((entry) => entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0),
    true,
  ));

  const tamperedPath = path.join(runtimeDir, 'tampered.jsonl');
  fs.copyFileSync(handoffPath, tamperedPath);
  const tamperedRecords = fs.readFileSync(tamperedPath, 'utf8').trim().split('\n').map(JSON.parse);
  tamperedRecords[0].payload.reviewNote = 'tampered';
  fs.writeFileSync(tamperedPath, `${tamperedRecords.map(JSON.stringify).join('\n')}\n`);
  const tamperedStore = new ReviewHandoffStore(tamperedPath);
  check(() => assert.equal(tamperedStore.verify(key).valid, false));
  check(() => assert.equal(
    handoffStore.verify('different-signing-key-that-is-also-long-enough').valid,
    false,
  ));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedHandoffs: handoffStore.readRecords().length,
    acceptedBatches: proposalStore.list({ status: ROUTE_PROPOSAL_STATUSES.ACCEPTED }).length,
    rejectedBatches: proposalStore.list({ status: ROUTE_PROPOSAL_STATUSES.REJECTED }).length,
    productionWrites: 0,
    publicationTasksCreated: 0,
    auditEntries: auditLog.verify().entries,
  }, null, 2)}\n`);
}

runTests().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
