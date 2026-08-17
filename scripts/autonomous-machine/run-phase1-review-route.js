#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ReviewStore } = require('./review-store');
const { ReviewHandoffStore } = require('./review-handoff-store');
const { RouteProposalStore, ROUTE_PROPOSAL_STATUSES } = require('./route-proposal-store');
const { loadRouteRegistry } = require('./route-registry');
const { reviewRouteProposal } = require('./route-review-service');

function argsFrom(argv) {
  const values = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    const [key, ...rest] = argument.slice(2).split('=');
    values[key] = rest.length ? rest.join('=') : true;
  }
  return values;
}

function printPending(proposalStore) {
  const batches = proposalStore.list({ status: ROUTE_PROPOSAL_STATUSES.PENDING });
  process.stdout.write(`${JSON.stringify({
    mode: 'list_pending_route_reviews',
    pending: batches.map((batch) => ({
      id: batch.id,
      reviewRecordId: batch.reviewRecordId,
      unmatched: batch.unmatched,
      proposals: batch.proposals.map((proposal) => ({
        targetId: proposal.targetId,
        targetType: proposal.targetType,
        title: proposal.title,
        route: proposal.route,
        confidence: proposal.confidence,
        score: proposal.score,
      })),
    })),
  }, null, 2)}\n`);
}

function main() {
  const args = argsFrom(process.argv.slice(2));
  const rootDir = process.cwd();
  const runtimeDir = path.resolve(rootDir, '.autonomous-machine');
  const proposalStore = new RouteProposalStore(path.join(runtimeDir, 'route-proposals.json'));
  const handoffStore = new ReviewHandoffStore(path.join(runtimeDir, 'review-handoffs.jsonl'));

  if (args.list === true || (!args.batch && !args.verify)) {
    printPending(proposalStore);
    return;
  }

  const signingKey = process.env.AIM_REVIEW_SIGNING_KEY;
  if (args.verify === true) {
    process.stdout.write(`${JSON.stringify({
      mode: 'verify_signed_handoffs',
      ...handoffStore.verify(signingKey),
    }, null, 2)}\n`);
    return;
  }

  const reviewStore = new ReviewStore(path.join(runtimeDir, 'review-queue.json'));
  const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));
  const routeRegistry = loadRouteRegistry(rootDir);
  const selectedTargetIds = typeof args.targets === 'string'
    ? args.targets.split(',').map((value) => value.trim()).filter(Boolean)
    : [];
  const result = reviewRouteProposal({
    batchId: args.batch,
    decision: args.decision || process.env.AIM_REVIEW_DECISION,
    selectedTargetIds,
    reviewer: args.reviewer || process.env.AIM_REVIEWER_ID,
    reviewNote: args.note || process.env.AIM_REVIEW_NOTE,
    signingKey,
    signingKeyId: process.env.AIM_REVIEW_SIGNING_KEY_ID || 'manual-review-key',
    routeRegistry,
    proposalStore,
    reviewStore,
    handoffStore,
    auditLog,
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'signed_route_review',
    ...result,
    handoffVerification: handoffStore.verify(signingKey),
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
