#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntime } = require('./runtime');
const {
  EVIDENCE_CLASSES,
  PUBLICATION_MODES,
  SENSITIVITY,
  TASK_STATUSES,
  TASK_TYPES,
} = require('./constants');

async function runTests() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase1-'));
  const runtime = createRuntime({
    rootDir,
    publicationMode: PUBLICATION_MODES.DISABLED,
    handlers: {
      [TASK_TYPES.INGEST]: async (task, context) => {
        context.sourceRegistry.assertUrlAllowed(task.sourceId, task.payload.url);
        return { accepted: true, locator: task.payload.url };
      },
    },
  });

  runtime.sourceRegistry.add({
    id: 'example-official',
    name: 'Example Official Source',
    baseUrl: 'https://example.org/',
    termsReviewed: true,
    automationAllowed: true,
    reliability: 'official',
    rateLimitPerHour: 10,
  });

  const enqueueResult = runtime.taskStore.enqueue({
    type: TASK_TYPES.INGEST,
    priority: 80,
    sourceId: 'example-official',
    subjectKey: 'test-subject',
    evidenceClass: EVIDENCE_CLASSES.OFFICIAL,
    sensitivity: SENSITIVITY.LOW,
    payload: { url: 'https://example.org/record/1' },
  });
  assert.equal(enqueueResult.deduplicated, false);

  const duplicate = runtime.taskStore.enqueue({
    type: TASK_TYPES.INGEST,
    priority: 80,
    sourceId: 'example-official',
    subjectKey: 'test-subject',
    evidenceClass: EVIDENCE_CLASSES.OFFICIAL,
    sensitivity: SENSITIVITY.LOW,
    payload: { url: 'https://example.org/record/1' },
  });
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.task.id, enqueueResult.task.id);

  const processed = await runtime.missionDirector.processOne();
  assert.equal(processed.status, TASK_STATUSES.COMPLETED);
  assert.equal(processed.task.result.accepted, true);

  const publicationTask = runtime.taskStore.enqueue({
    type: TASK_TYPES.PUBLICATION_CANDIDATE,
    priority: 100,
    evidenceClass: EVIDENCE_CLASSES.PRIMARY,
    sensitivity: SENSITIVITY.LOW,
    payload: {
      humanApproved: true,
      provenance: [{ sourceId: 'example-official', locator: 'record/1' }],
      evidenceClass: EVIDENCE_CLASSES.PRIMARY,
      sensitivity: SENSITIVITY.LOW,
    },
  }).task;
  const publicationResult = await runtime.missionDirector.processOne();
  assert.equal(publicationResult.task.id, publicationTask.id);
  assert.equal(publicationResult.status, TASK_STATUSES.HELD);
  assert.equal(publicationResult.decision.code, 'publication_disabled');

  assert.throws(
    () => runtime.sourceRegistry.assertUrlAllowed('example-official', 'https://not-example.org/record/1'),
    /outside the registered source boundary/,
  );

  const killedRuntime = createRuntime({ rootDir: path.join(rootDir, 'killed'), killSwitch: () => true });
  const halted = await killedRuntime.missionDirector.processOne();
  assert.equal(halted.status, 'halted');

  const auditVerification = runtime.auditLog.verify();
  assert.equal(auditVerification.valid, true);
  assert.ok(auditVerification.entries >= 4);

  const reviewGateRuntime = createRuntime({
    rootDir: path.join(rootDir, 'review-gate'),
    publicationMode: PUBLICATION_MODES.REVIEW_ONLY,
  });
  const sensitiveDecision = reviewGateRuntime.publicationGate.evaluate({
    humanApproved: true,
    provenance: [{ sourceId: 'example-official', locator: 'record/1' }],
    evidenceClass: EVIDENCE_CLASSES.ALLEGATION,
    sensitivity: SENSITIVITY.HIGH,
  });
  assert.equal(sensitiveDecision.allowed, false);
  assert.equal(sensitiveDecision.code, 'sensitive_language_review_required');

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: 9,
    auditEntries: auditVerification.entries,
    rootDir,
  }, null, 2)}\n`);
}

runTests().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
