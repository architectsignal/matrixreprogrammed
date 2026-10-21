#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntime } = require('./runtime');
const { EVIDENCE_CLASSES, PUBLICATION_MODES, SENSITIVITY, TASK_STATUSES, TASK_TYPES } = require('./constants');
const { ReviewStore } = require('./review-store');
const { RouteProposalStore } = require('./route-proposal-store');
const { createDossierRouteHandler } = require('./dossier-route-handler');
const { loadRouteRegistry, sha256 } = require('./route-registry');
const { matchDossierRoutes } = require('./dossier-route-matcher');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function addReview(reviewStore, input) {
  return reviewStore.add({
    sourceId: 'fixture-official',
    sourceLabel: 'Fixture Official Source',
    sourceUrl: input.sourceUrl,
    feedUrl: 'https://www.justice.gov/news/rss?site=768',
    lane: input.lane,
    title: input.title,
    summary: input.summary || '',
    publishedAt: '2026-07-29T12:00:00.000Z',
    fetchedAt: '2026-07-29T13:00:00.000Z',
    evidenceClass: EVIDENCE_CLASSES.OFFICIAL,
    sensitivity: SENSITIVITY.MEDIUM,
    evidenceBoundary: 'Preserve procedural status and do not infer guilt beyond the official record.',
    provenance: [{
      sourceId: 'fixture-official',
      locator: input.sourceUrl,
      retrievedAt: '2026-07-29T13:00:00.000Z',
    }],
    reviewReasons: ['fixture'],
  }).record;
}

async function runTests() {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase12-repo-'));
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase12-runtime-'));
  const packPath = path.join(repositoryRoot, 'data', 'dossier-packs.json');
  const peoplePath = path.join(repositoryRoot, 'data', 'epstein-people-index.json');
  writeJson(packPath, {
    packs: [
      {
        slug: 'crime-state-overlap',
        title: 'Crime-State Overlap Pack',
        keywords: ['organized crime', 'money laundering', 'cartel', 'mafia'],
        subjectMap: ['court records', 'financial institutions'],
        weeklyWatch: ['indictments', 'asset forfeiture'],
        evidenceUpgradePath: ['indictment', 'conviction'],
        evidenceRoute: 'evidence-lane-court-records.html',
        machineRoute: 'authority-crime-state.html',
      },
      {
        slug: 'intelligence-network',
        title: 'Intelligence Network Pack',
        keywords: ['intelligence', 'surveillance', 'declassified'],
        subjectMap: ['agency history'],
        weeklyWatch: ['official advisories'],
        evidenceUpgradePath: ['declassified document'],
        evidenceRoute: 'evidence-lane-declassified-archives.html',
        machineRoute: 'authority-intelligence.html',
      },
    ],
  });
  writeJson(peoplePath, {
    people: [
      { name: 'Jeffrey Epstein', evidenceClass: 'Convicted', boundary: 'A name route does not establish another person’s conduct.' },
      { name: 'Ghislaine Maxwell', evidenceClass: 'Convicted', boundary: 'A name route does not establish another person’s conduct.' },
    ],
  });
  const beforePackHash = sha256(fs.readFileSync(packPath));
  const beforePeopleHash = sha256(fs.readFileSync(peoplePath));

  const routeRegistry = loadRouteRegistry(repositoryRoot);
  assert.equal(routeRegistry.targets.length, 4);
  assert.equal(routeRegistry.fingerprint.length, 64);

  const reviewStore = new ReviewStore(path.join(runtimeRoot, 'review-queue.json'));
  const proposalStore = new RouteProposalStore(path.join(runtimeRoot, 'route-proposals.json'));
  const personRecord = addReview(reviewStore, {
    sourceUrl: 'https://www.justice.gov/usao-sdny/pr/fixture-one',
    lane: 'crime-state-overlap',
    title: 'Jeffrey Epstein Associate Charged in Money Laundering Case',
    summary: 'The indictment includes asset forfeiture allegations.',
  });
  const generalRecord = addReview(reviewStore, {
    sourceUrl: 'https://www.justice.gov/usao-sdny/pr/fixture-two',
    lane: 'crime-state-overlap',
    title: 'Defendant Charged in Organized Crime Indictment',
    summary: 'Official court-record update.',
  });

  const directMatch = matchDossierRoutes(personRecord, routeRegistry);
  assert.equal(directMatch.unmatched, false);
  assert.ok(directMatch.proposals.some((proposal) => proposal.targetId === 'epstein-person:jeffrey-epstein'));
  assert.ok(directMatch.proposals.some((proposal) => proposal.targetId === 'dossier-pack:crime-state-overlap'));
  assert.ok(!directMatch.proposals.some((proposal) => proposal.targetId === 'epstein-person:ghislaine-maxwell'));
  assert.ok(directMatch.proposals.every((proposal) => !proposal.route.startsWith('/')));

  const nearMiss = matchDossierRoutes({
    ...personRecord,
    id: 'review_near_miss',
    title: 'Jeffrey E. Named in Filing',
    summary: '',
  }, routeRegistry);
  assert.ok(!nearMiss.proposals.some((proposal) => proposal.targetType === 'person_tracker'));

  const runtime = createRuntime({
    rootDir: runtimeRoot,
    publicationMode: PUBLICATION_MODES.DISABLED,
  });
  runtime.missionDirector.registerHandler(TASK_TYPES.ENTITY_RESOLUTION, createDossierRouteHandler({
    reviewStore,
    proposalStore,
    routeRegistry,
  }));

  for (const record of [personRecord, generalRecord]) {
    runtime.taskStore.enqueue({
      type: TASK_TYPES.ENTITY_RESOLUTION,
      priority: 65,
      subjectKey: record.id,
      evidenceClass: record.evidenceClass,
      sensitivity: record.sensitivity,
      payload: {
        reviewRecordId: record.id,
        reviewFingerprint: record.fingerprint,
        registryFingerprint: routeRegistry.fingerprint,
      },
    });
  }
  const results = await runtime.missionDirector.run({ maxTasks: 2 });
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.status === TASK_STATUSES.COMPLETED));
  assert.ok(results.every((result) => result.task.result.productionWrites === 0));
  assert.ok(results.every((result) => result.task.result.publicationTasksCreated === 0));

  const batches = proposalStore.list();
  assert.equal(batches.length, 2);
  assert.ok(batches.every((batch) => batch.status === 'pending_route_review'));
  assert.ok(batches.every((batch) => batch.registryFingerprint === routeRegistry.fingerprint));
  assert.equal(runtime.taskStore.list().filter((task) => task.type === TASK_TYPES.PUBLICATION_CANDIDATE).length, 0);

  const duplicateTask = runtime.taskStore.enqueue({
    type: TASK_TYPES.ENTITY_RESOLUTION,
    priority: 65,
    subjectKey: personRecord.id,
    evidenceClass: personRecord.evidenceClass,
    sensitivity: personRecord.sensitivity,
    payload: {
      reviewRecordId: personRecord.id,
      reviewFingerprint: personRecord.fingerprint,
      registryFingerprint: routeRegistry.fingerprint,
    },
  });
  assert.equal(duplicateTask.deduplicated, true);

  const handler = createDossierRouteHandler({ reviewStore, proposalStore, routeRegistry });
  await assert.rejects(
    () => handler({
      id: 'task_stale',
      payload: { reviewRecordId: personRecord.id, registryFingerprint: 'f'.repeat(64) },
    }, runtime),
    /fingerprint changed/,
  );

  assert.equal(sha256(fs.readFileSync(packPath)), beforePackHash);
  assert.equal(sha256(fs.readFileSync(peoplePath)), beforePeopleHash);
  assert.equal(runtime.auditLog.verify().valid, true);

  const unsafeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase12-unsafe-'));
  writeJson(path.join(unsafeRoot, 'data', 'dossier-packs.json'), {
    packs: [{
      slug: 'unsafe',
      title: 'Unsafe Pack',
      keywords: [],
      subjectMap: [],
      weeklyWatch: [],
      evidenceUpgradePath: [],
      evidenceRoute: '../escape.html',
      machineRoute: 'safe.json',
    }],
  });
  writeJson(path.join(unsafeRoot, 'data', 'epstein-people-index.json'), { people: [] });
  assert.throws(() => loadRouteRegistry(unsafeRoot), /unsafe path segment/);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: 24,
    routeTargets: routeRegistry.targets.length,
    reviewRecords: reviewStore.list().length,
    routeBatches: batches.length,
    productionWrites: 0,
    publicationTasksCreated: 0,
    auditEntries: runtime.auditLog.verify().entries,
  }, null, 2)}\n`);
}

runTests().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
