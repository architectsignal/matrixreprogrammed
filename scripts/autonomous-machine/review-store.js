'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { normaliseUrl, sha256, stableStringify } = require('./validation');
const { EVIDENCE_CLASSES, SENSITIVITY } = require('./constants');

const REVIEW_STATUSES = Object.freeze({
  PENDING: 'pending_review',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

function assertReviewCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('review candidate must be an object');
  }
  for (const field of ['sourceId', 'sourceLabel', 'sourceUrl', 'feedUrl', 'title', 'fetchedAt']) {
    if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
      throw new TypeError(`review candidate requires ${field}`);
    }
  }
  if (!Object.values(EVIDENCE_CLASSES).includes(candidate.evidenceClass)) {
    throw new TypeError('review candidate evidenceClass is invalid');
  }
  if (!Object.values(SENSITIVITY).includes(candidate.sensitivity)) {
    throw new TypeError('review candidate sensitivity is invalid');
  }
  if (!Array.isArray(candidate.provenance) || candidate.provenance.length === 0) {
    throw new TypeError('review candidate requires provenance');
  }
  candidate.provenance.forEach((entry) => {
    if (!entry || typeof entry.sourceId !== 'string' || typeof entry.locator !== 'string') {
      throw new TypeError('review provenance requires sourceId and locator');
    }
  });
}

function buildReviewFingerprint(candidate) {
  return sha256(stableStringify({
    sourceId: candidate.sourceId,
    sourceUrl: normaliseUrl(candidate.sourceUrl),
    title: candidate.title.trim(),
    publishedAt: candidate.publishedAt || null,
  }));
}

class ReviewStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ReviewStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.save({ version: 1, records: [] });
  }

  load() {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(parsed.records)) throw new Error('Review store must contain a records array');
    return parsed;
  }

  save(store) {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }

  add(candidate) {
    assertReviewCandidate(candidate);
    const store = this.load();
    const fingerprint = buildReviewFingerprint(candidate);
    const existing = store.records.find((record) => record.fingerprint === fingerprint);
    if (existing) return { record: existing, deduplicated: true };

    const now = new Date().toISOString();
    const record = {
      id: `review_${crypto.randomUUID()}`,
      fingerprint,
      status: REVIEW_STATUSES.PENDING,
      sourceId: candidate.sourceId,
      sourceLabel: candidate.sourceLabel.trim(),
      sourceUrl: normaliseUrl(candidate.sourceUrl),
      feedUrl: normaliseUrl(candidate.feedUrl),
      lane: candidate.lane || 'unrouted',
      title: candidate.title.trim(),
      summary: candidate.summary || '',
      publishedAt: candidate.publishedAt || null,
      fetchedAt: candidate.fetchedAt,
      evidenceClass: candidate.evidenceClass,
      sensitivity: candidate.sensitivity,
      evidenceBoundary: candidate.evidenceBoundary || '',
      provenance: candidate.provenance.map((entry) => ({
        sourceId: entry.sourceId,
        locator: normaliseUrl(entry.locator),
        retrievedAt: entry.retrievedAt || candidate.fetchedAt,
      })),
      reviewReasons: Array.isArray(candidate.reviewReasons) ? candidate.reviewReasons : [],
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      reviewer: null,
      reviewNote: null,
    };
    store.records.push(record);
    this.save(store);
    return { record, deduplicated: false };
  }

  list({ status } = {}) {
    const records = this.load().records;
    return status ? records.filter((record) => record.status === status) : records;
  }
}

module.exports = {
  REVIEW_STATUSES,
  ReviewStore,
  assertReviewCandidate,
  buildReviewFingerprint,
};
