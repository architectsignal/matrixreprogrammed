'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSafeRoute, sha256, stableStringify } = require('./route-registry');

const ROUTE_PROPOSAL_STATUS = 'pending_route_review';

function assertBatch(batch) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new TypeError('route proposal batch must be an object');
  for (const field of ['reviewRecordId', 'reviewFingerprint', 'registryFingerprint', 'proposalFingerprint']) {
    if (typeof batch[field] !== 'string' || !batch[field]) throw new TypeError(`route proposal batch requires ${field}`);
  }
  if (!Array.isArray(batch.proposals)) throw new TypeError('route proposal batch requires proposals');
  batch.proposals.forEach((proposal) => {
    if (!proposal || typeof proposal.targetId !== 'string' || typeof proposal.targetType !== 'string') {
      throw new TypeError('route proposal requires targetId and targetType');
    }
    assertSafeRoute(proposal.route, 'proposal.route');
    assertSafeRoute(proposal.evidenceRoute, 'proposal.evidenceRoute');
    if (!Number.isFinite(proposal.score) || proposal.score < 0) throw new TypeError('route proposal score is invalid');
    if (!['low', 'medium', 'high'].includes(proposal.confidence)) throw new TypeError('route proposal confidence is invalid');
  });
}

class RouteProposalStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('RouteProposalStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.save({ version: 1, batches: [] });
  }

  load() {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(parsed.batches)) throw new Error('Route proposal store must contain batches');
    return parsed;
  }

  save(store) {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }

  add(batch) {
    assertBatch(batch);
    const store = this.load();
    const fingerprint = sha256(stableStringify({
      reviewRecordId: batch.reviewRecordId,
      reviewFingerprint: batch.reviewFingerprint,
      registryFingerprint: batch.registryFingerprint,
      proposalFingerprint: batch.proposalFingerprint,
    }));
    const existing = store.batches.find((item) => item.fingerprint === fingerprint);
    if (existing) return { batch: existing, deduplicated: true };
    const now = new Date().toISOString();
    const record = {
      id: `route_${crypto.randomUUID()}`,
      fingerprint,
      status: ROUTE_PROPOSAL_STATUS,
      reviewRecordId: batch.reviewRecordId,
      reviewFingerprint: batch.reviewFingerprint,
      registryFingerprint: batch.registryFingerprint,
      proposalFingerprint: batch.proposalFingerprint,
      matcherVersion: batch.matcherVersion || 1,
      proposals: batch.proposals,
      unmatched: batch.unmatched === true,
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      reviewer: null,
      reviewNote: null,
    };
    store.batches.push(record);
    this.save(store);
    return { batch: record, deduplicated: false };
  }

  list({ status } = {}) {
    const batches = this.load().batches;
    return status ? batches.filter((item) => item.status === status) : batches;
  }
}

module.exports = { ROUTE_PROPOSAL_STATUS, RouteProposalStore, assertBatch };
