#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntime } = require('./runtime');
const { ReviewStore, REVIEW_STATUSES } = require('./review-store');
const { RateLimitStore } = require('./rate-limit-store');
const { createOfficialRssIngestHandler } = require('./official-rss-handler');
const {
  EVIDENCE_CLASSES,
  PUBLICATION_MODES,
  SENSITIVITY,
  TASK_STATUSES,
  TASK_TYPES,
} = require('./constants');

const VALID_FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Defendant Charged in Public Corruption Case</title>
    <link>https://www.justice.gov/usao-sdny/pr/defendant-charged-public-corruption-case</link>
    <pubDate>Tue, 28 Jul 2026 14:00:00 GMT</pubDate>
    <description><![CDATA[An indictment was unsealed. The charge is an allegation and the defendant is presumed innocent.]]></description>
  </item>
  <item>
    <title>Company Agrees to Resolve False Claims Act Allegations</title>
    <link>https://www.justice.gov/usao-sdny/pr/company-agrees-resolve-false-claims-act-allegations</link>
    <pubDate>Mon, 27 Jul 2026 14:00:00 GMT</pubDate>
    <description><![CDATA[The company agreed to a civil settlement without an admission beyond the agreement.]]></description>
  </item>
</channel></rss>`;

function responseFor(xml, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => String(Buffer.byteLength(xml, 'utf8')) },
    text: async () => xml,
  };
}

function enqueue(runtime, pollWindow) {
  return runtime.taskStore.enqueue({
    type: TASK_TYPES.INGEST,
    priority: 70,
    sourceId: 'doj-sdny-press-releases',
    subjectKey: 'crime-state-overlap:doj-sdny',
    evidenceClass: EVIDENCE_CLASSES.OFFICIAL,
    sensitivity: SENSITIVITY.MEDIUM,
    payload: {
      url: 'https://www.justice.gov/news/rss?field_component=1981',
      sourceLabel: 'U.S. DOJ SDNY Press Releases',
      lane: 'crime-state-overlap',
      pollWindow,
    },
  });
}

async function runTests() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-aim-phase11-'));
  const runtime = createRuntime({
    rootDir,
    publicationMode: PUBLICATION_MODES.DISABLED,
  });
  const reviewStore = new ReviewStore(path.join(rootDir, 'review-queue.json'));
  const rateLimitStore = new RateLimitStore(path.join(rootDir, 'rate-limits.json'));
  runtime.sourceRegistry.add({
    id: 'doj-sdny-press-releases',
    name: 'U.S. DOJ SDNY Press Releases',
    baseUrl: 'https://www.justice.gov/',
    enabled: true,
    allowSubdomains: false,
    allowedPathPrefixes: ['/news/rss', '/usao-sdny/pr/'],
    lawfulBasis: 'official_public_rss',
    termsReviewed: true,
    automationAllowed: true,
    rateLimitPerHour: 20,
    reliability: 'official',
  });

  runtime.missionDirector.registerHandler(
    TASK_TYPES.INGEST,
    createOfficialRssIngestHandler({
      reviewStore,
      rateLimitStore,
      fetchImpl: async () => responseFor(VALID_FEED),
      now: () => new Date('2026-07-29T18:30:00.000Z'),
    }),
  );

  enqueue(runtime, '2026-07-29T18');
  const first = await runtime.missionDirector.processOne();
  assert.equal(first.status, TASK_STATUSES.COMPLETED);
  assert.equal(first.task.result.added, 2);
  assert.equal(first.task.result.publicationTasksCreated, 0);

  const records = reviewStore.list();
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.status === REVIEW_STATUSES.PENDING));
  assert.ok(records.every((record) => record.evidenceClass === EVIDENCE_CLASSES.OFFICIAL));
  assert.ok(records.every((record) => record.provenance[0].sourceId === 'doj-sdny-press-releases'));
  assert.ok(records[0].summary.includes('presumed innocent'));

  enqueue(runtime, '2026-07-29T19');
  const second = await runtime.missionDirector.processOne();
  assert.equal(second.status, TASK_STATUSES.COMPLETED);
  assert.equal(second.task.result.added, 0);
  assert.equal(second.task.result.deduplicated, 2);
  assert.equal(reviewStore.list().length, 2);

  assert.equal(
    runtime.taskStore.list().filter((task) => task.type === TASK_TYPES.PUBLICATION_CANDIDATE).length,
    0,
  );
  assert.equal(runtime.publicationGate.mode, PUBLICATION_MODES.DISABLED);
  assert.throws(
    () => runtime.sourceRegistry.assertUrlAllowed(
      'doj-sdny-press-releases',
      'https://www.justice.gov/atr/press-releases',
    ),
    /URL path is outside/,
  );

  const hostileRoot = path.join(rootDir, 'hostile');
  const hostileRuntime = createRuntime({
    rootDir: hostileRoot,
    publicationMode: PUBLICATION_MODES.DISABLED,
  });
  const hostileReview = new ReviewStore(path.join(hostileRoot, 'review-queue.json'));
  const hostileRateLimit = new RateLimitStore(path.join(hostileRoot, 'rate-limits.json'));
  hostileRuntime.sourceRegistry.add({
    id: 'doj-sdny-press-releases',
    name: 'U.S. DOJ SDNY Press Releases',
    baseUrl: 'https://www.justice.gov/',
    enabled: true,
    allowedPathPrefixes: ['/news/rss', '/usao-sdny/pr/'],
    termsReviewed: true,
    automationAllowed: true,
    rateLimitPerHour: 2,
  });
  const hostileFeed = VALID_FEED.replace(
    'https://www.justice.gov/usao-sdny/pr/company-agrees-resolve-false-claims-act-allegations',
    'https://malicious.example/redirect',
  );
  hostileRuntime.missionDirector.registerHandler(
    TASK_TYPES.INGEST,
    createOfficialRssIngestHandler({
      reviewStore: hostileReview,
      rateLimitStore: hostileRateLimit,
      fetchImpl: async () => responseFor(hostileFeed),
    }),
  );
  enqueue(hostileRuntime, '2026-07-29T18');
  const hostile = await hostileRuntime.missionDirector.processOne();
  assert.equal(hostile.status, TASK_STATUSES.FAILED);
  assert.equal(hostileReview.list().length, 0);

  const oversizedHandler = createOfficialRssIngestHandler({
    reviewStore,
    rateLimitStore,
    maxBytes: 32,
    fetchImpl: async () => responseFor(VALID_FEED),
  });
  await assert.rejects(
    () => oversizedHandler({
      id: 'oversized',
      sourceId: 'doj-sdny-press-releases',
      evidenceClass: EVIDENCE_CLASSES.OFFICIAL,
      sensitivity: SENSITIVITY.MEDIUM,
      payload: { url: 'https://www.justice.gov/news/rss?field_component=1981' },
    }, {
      sourceRegistry: runtime.sourceRegistry,
      auditLog: runtime.auditLog,
    }),
    /exceeds 32 bytes/,
  );

  const limitedRoot = path.join(rootDir, 'limited');
  const limitedRuntime = createRuntime({
    rootDir: limitedRoot,
    publicationMode: PUBLICATION_MODES.DISABLED,
  });
  const limitedReview = new ReviewStore(path.join(limitedRoot, 'review-queue.json'));
  const limitedRate = new RateLimitStore(path.join(limitedRoot, 'rate-limits.json'));
  limitedRuntime.sourceRegistry.add({
    id: 'doj-sdny-press-releases',
    name: 'U.S. DOJ SDNY Press Releases',
    baseUrl: 'https://www.justice.gov/',
    enabled: true,
    allowedPathPrefixes: ['/news/rss', '/usao-sdny/pr/'],
    termsReviewed: true,
    automationAllowed: true,
    rateLimitPerHour: 1,
  });
  const limitedHandler = createOfficialRssIngestHandler({
    reviewStore: limitedReview,
    rateLimitStore: limitedRate,
    fetchImpl: async () => responseFor(VALID_FEED),
    now: () => new Date('2026-07-29T18:30:00.000Z'),
  });
  const limitedTask = {
    id: 'limited-task',
    sourceId: 'doj-sdny-press-releases',
    evidenceClass: EVIDENCE_CLASSES.OFFICIAL,
    sensitivity: SENSITIVITY.MEDIUM,
    payload: { url: 'https://www.justice.gov/news/rss?field_component=1981' },
  };
  await limitedHandler(limitedTask, {
    sourceRegistry: limitedRuntime.sourceRegistry,
    auditLog: limitedRuntime.auditLog,
  });
  await assert.rejects(
    () => limitedHandler(limitedTask, {
      sourceRegistry: limitedRuntime.sourceRegistry,
      auditLog: limitedRuntime.auditLog,
    }),
    /Rate limit reached/,
  );

  const audit = runtime.auditLog.verify();
  assert.equal(audit.valid, true);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: 17,
    reviewRecords: records.length,
    publicationTasks: 0,
    auditEntries: audit.entries,
    rootDir,
  }, null, 2)}\n`);
}

runTests().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
