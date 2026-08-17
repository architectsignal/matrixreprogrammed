#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRuntime } = require('./runtime');
const { EVIDENCE_CLASSES, PUBLICATION_MODES, SENSITIVITY, TASK_TYPES } = require('./constants');
const { ReviewStore, REVIEW_STATUSES } = require('./review-store');
const { RouteProposalStore, ROUTE_PROPOSAL_STATUS } = require('./route-proposal-store');
const { loadRouteRegistry } = require('./route-registry');
const { createDossierRouteHandler } = require('./dossier-route-handler');

async function main() {
  const repositoryRoot = process.cwd();
  const runtimeRoot = path.resolve(repositoryRoot, '.autonomous-machine');
  const runtime = createRuntime({
    rootDir: runtimeRoot,
    publicationMode: PUBLICATION_MODES.DISABLED,
  });
  const reviewStore = new ReviewStore(path.join(runtimeRoot, 'review-queue.json'));
  const proposalStore = new RouteProposalStore(path.join(runtimeRoot, 'route-proposals.json'));
  const routeRegistry = loadRouteRegistry(repositoryRoot);
  runtime.missionDirector.registerHandler(TASK_TYPES.ENTITY_RESOLUTION, createDossierRouteHandler({
    reviewStore,
    proposalStore,
    routeRegistry,
  }));

  const pending = reviewStore.list({ status: REVIEW_STATUSES.PENDING }).slice(0, 100);
  let enqueued = 0;
  let deduplicated = 0;
  for (const record of pending) {
    const result = runtime.taskStore.enqueue({
      type: TASK_TYPES.ENTITY_RESOLUTION,
      priority: 65,
      subjectKey: record.id,
      evidenceClass: record.evidenceClass || EVIDENCE_CLASSES.OFFICIAL,
      sensitivity: record.sensitivity || SENSITIVITY.MEDIUM,
      payload: {
        reviewRecordId: record.id,
        reviewFingerprint: record.fingerprint,
        registryFingerprint: routeRegistry.fingerprint,
      },
    });
    if (result.deduplicated) deduplicated += 1;
    else enqueued += 1;
  }

  const results = pending.length ? await runtime.missionDirector.run({ maxTasks: pending.length }) : [{ status: 'idle' }];
  const publicationTasks = runtime.taskStore.list().filter((task) => task.type === TASK_TYPES.PUBLICATION_CANDIDATE);
  if (publicationTasks.length !== 0) throw new Error('Phase 1.2 must not create publication tasks');
  const audit = runtime.auditLog.verify();
  if (!audit.valid) throw new Error(`Audit chain invalid: ${audit.reason}`);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: 'route_proposal_only',
    registryFingerprint: routeRegistry.fingerprint,
    routeTargets: routeRegistry.targets.length,
    pendingReviewRecords: pending.length,
    enqueued,
    deduplicated,
    processed: results.filter((result) => result.status === 'completed').length,
    held: results.filter((result) => result.status === 'held').length,
    failed: results.filter((result) => result.status === 'failed').length,
    pendingRouteBatches: proposalStore.list({ status: ROUTE_PROPOSAL_STATUS }).length,
    productionWrites: 0,
    publicationTasksCreated: 0,
    audit,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
