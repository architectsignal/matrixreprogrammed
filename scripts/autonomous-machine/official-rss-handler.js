'use strict';

const { EVIDENCE_CLASSES, SENSITIVITY } = require('./constants');
const { parseRssItems } = require('./rss-reader');

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function createOfficialRssIngestHandler(options = {}) {
  const reviewStore = options.reviewStore;
  const rateLimitStore = options.rateLimitStore;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs || 12000;
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const maxItems = options.maxItems || 12;
  const now = options.now || (() => new Date());

  if (!reviewStore) throw new TypeError('Official RSS handler requires reviewStore');
  if (!rateLimitStore) throw new TypeError('Official RSS handler requires rateLimitStore');
  if (typeof fetchImpl !== 'function') throw new TypeError('Official RSS handler requires fetch');

  return async function officialRssIngest(task, context) {
    const feedUrl = task.payload && task.payload.url;
    if (typeof feedUrl !== 'string' || !feedUrl) throw new TypeError('RSS ingest task requires payload.url');
    context.sourceRegistry.assertUrlAllowed(task.sourceId, feedUrl);
    const source = context.sourceRegistry.assertUsable(task.sourceId);
    const attemptedAt = now();
    const rateLimit = rateLimitStore.consume(source, attemptedAt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(feedUrl, {
        signal: controller.signal,
        headers: {
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
          'user-agent': 'MatrixReprogrammedReviewWatch/1.0 (+review-only; no publication)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response || response.ok !== true) {
      throw new Error(`Official RSS request failed with HTTP ${response ? response.status : 'unknown'}`);
    }

    const contentLength = Number(response.headers && response.headers.get
      ? response.headers.get('content-length')
      : 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Official RSS payload exceeds ${maxBytes} bytes`);
    }

    const xml = await response.text();
    if (Buffer.byteLength(xml, 'utf8') > maxBytes) {
      throw new Error(`Official RSS payload exceeds ${maxBytes} bytes`);
    }

    const fetchedAt = attemptedAt.toISOString();
    const items = parseRssItems(xml, { checkedAt: fetchedAt, maxItems });

    // Validate the complete batch before writing any review records.
    items.forEach((item) => context.sourceRegistry.assertUrlAllowed(task.sourceId, item.url));

    let added = 0;
    let deduplicated = 0;
    const reviewIds = [];
    for (const item of items) {
      const result = reviewStore.add({
        sourceId: task.sourceId,
        sourceLabel: task.payload.sourceLabel || task.sourceId,
        sourceUrl: item.url,
        feedUrl,
        lane: task.payload.lane || 'crime-state-overlap',
        title: item.title,
        summary: item.summary,
        publishedAt: item.publishedAt,
        fetchedAt,
        evidenceClass: task.evidenceClass || EVIDENCE_CLASSES.OFFICIAL,
        sensitivity: task.sensitivity || SENSITIVITY.MEDIUM,
        evidenceBoundary: task.payload.evidenceBoundary
          || 'This is an official public release. Preserve the exact procedural status stated by the source and do not infer guilt, wider involvement, or motive beyond the record.',
        provenance: [{
          sourceId: task.sourceId,
          locator: item.url,
          retrievedAt: fetchedAt,
        }],
        reviewReasons: [
          'new_official_source_item',
          'human_context_and_dossier_routing_required',
          'publication_not_requested',
        ],
      });
      reviewIds.push(result.record.id);
      if (result.deduplicated) deduplicated += 1;
      else added += 1;
    }

    context.auditLog.append('official_rss_review_batch_created', {
      taskId: task.id,
      sourceId: task.sourceId,
      feedUrl,
      itemCount: items.length,
      added,
      deduplicated,
      reviewIds,
      publicationRequested: false,
      rateLimit,
    });

    return {
      mode: 'review_only',
      feedUrl,
      itemCount: items.length,
      added,
      deduplicated,
      reviewIds,
      publicationTasksCreated: 0,
      rateLimit,
    };
  };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  createOfficialRssIngestHandler,
};
