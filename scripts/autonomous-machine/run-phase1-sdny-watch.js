#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRuntime } = require('./runtime');
const { ReviewStore } = require('./review-store');
const { RateLimitStore } = require('./rate-limit-store');
const { createOfficialRssIngestHandler } = require('./official-rss-handler');
const { ensureConfiguredSources, loadApprovedSourceConfig } = require('./source-bootstrap');
const {
  EVIDENCE_CLASSES,
  PUBLICATION_MODES,
  SENSITIVITY,
  TASK_TYPES,
} = require('./constants');

async function main() {
  const rootDir = process.env.AIM_ROOT_DIR || path.resolve(process.cwd(), '.autonomous-machine');
  const configPath = path.resolve(
    process.cwd(),
    'data/autonomous-machine/phase1-approved-sources.json',
  );
  const runtime = createRuntime({
    rootDir,
    publicationMode: PUBLICATION_MODES.DISABLED,
  });
  const reviewStore = new ReviewStore(path.join(rootDir, 'review-queue.json'));
  const rateLimitStore = new RateLimitStore(path.join(rootDir, 'rate-limits.json'));
  const config = loadApprovedSourceConfig(configPath);
  const [{ source }] = ensureConfiguredSources(runtime.sourceRegistry, config);
  const feedUrl = config.sources[0].feedUrl;
  runtime.sourceRegistry.assertUrlAllowed(source.id, feedUrl);

  runtime.missionDirector.registerHandler(
    TASK_TYPES.INGEST,
    createOfficialRssIngestHandler({ reviewStore, rateLimitStore }),
  );

  const checkedAt = new Date().toISOString();
  const pollWindow = checkedAt.slice(0, 13);
  const enqueued = runtime.taskStore.enqueue({
    type: TASK_TYPES.INGEST,
    priority: 70,
    sourceId: source.id,
    subjectKey: 'crime-state-overlap:doj-sdny',
    evidenceClass: EVIDENCE_CLASSES.OFFICIAL,
    sensitivity: SENSITIVITY.MEDIUM,
    payload: {
      url: feedUrl,
      sourceLabel: source.name,
      lane: 'crime-state-overlap',
      pollWindow,
      evidenceBoundary: 'DOJ releases may describe charges, allegations, pleas, convictions, sentences or settlements. Preserve the source wording and procedural status; do not treat a charge or allegation as a conviction.',
    },
  });

  const result = enqueued.deduplicated
    ? { status: enqueued.task.status, task: enqueued.task, deduplicated: true }
    : await runtime.missionDirector.processOne();

  process.stdout.write(`${JSON.stringify({
    ok: result.status === 'completed' || enqueued.deduplicated,
    publicationMode: PUBLICATION_MODES.DISABLED,
    sourceId: source.id,
    taskId: enqueued.task.id,
    taskStatus: result.status,
    taskDeduplicated: enqueued.deduplicated,
    pendingReviewCount: reviewStore.list({ status: 'pending_review' }).length,
    audit: runtime.auditLog.verify(),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
