#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { decideProductionChangeRequest } = require('./production-change-decision-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const requestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const decisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function booleanOption(args, name) {
  const value = option(args, name);
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function usage() {
  process.stdout.write([
    'Phase 1.7 signed production change request decisions',
    '',
    'Commands:',
    '  list',
    '  show <change-request-id-or-decision-id>',
    '  decide <change-request-id> --decision <approve|reject> --reviewer <name> --role <role> --note <reason>',
    '         --evidence-review <true|false> --editorial-review <true|false>',
    '         --legal-review <true|false> --production-owner-approval <true|false>',
    '  verify',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY    Phase 1.6 request-ledger key, at least 32 bytes',
    '  AIM_CHANGE_DECISION_SIGNING_KEY   Separate Phase 1.7 decision key, at least 32 bytes',
    '',
    'Optional environment:',
    '  AIM_CHANGE_DECISION_SIGNING_KEY_ID',
    '',
    'Approval is a signed authorisation record only. This command cannot resolve or modify',
    'production files, grant execution authority, commit, deploy or publish.',
  ].join('\n') + '\n');
}

function verified(requestSigningKey, decisionSigningKey) {
  const requests = requestStore.verify(requestSigningKey);
  if (!requests.valid) throw new Error(`Production change request ledger verification failed: ${requests.reason}`);
  const decisions = decisionStore.verify(decisionSigningKey);
  if (!decisions.valid) throw new Error(`Production change decision ledger verification failed: ${decisions.reason}`);
  return {
    requests: requestStore.readRecords(),
    decisions: decisionStore.readRecords(),
  };
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }
  const requestSigningKey = process.env.AIM_CHANGE_REQUEST_SIGNING_KEY;
  const decisionSigningKey = process.env.AIM_CHANGE_DECISION_SIGNING_KEY;
  if (!requestSigningKey) throw new Error('AIM_CHANGE_REQUEST_SIGNING_KEY is required');
  if (!decisionSigningKey) throw new Error('AIM_CHANGE_DECISION_SIGNING_KEY is required');

  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify({
      requests: requestStore.verify(requestSigningKey),
      decisions: decisionStore.verify(decisionSigningKey),
    }, null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verified(requestSigningKey, decisionSigningKey);
    const decisionMap = new Map(records.decisions.map((record) => [record.payload.changeRequest.id, record]));
    const output = records.requests.map((request) => {
      const decision = decisionMap.get(request.id);
      return {
        changeRequestId: request.id,
        applicationId: request.payload.application.id,
        requester: request.payload.requester.name,
        requestedChanges: request.payload.changes.length,
        legalReviewRequired: request.payload.requiredApprovals.legalReview,
        decision: decision ? decision.payload.decision : null,
        decisionStatus: decision ? decision.payload.status : 'pending_human_decision',
        executionAuthorityGranted: false,
        createdAt: request.createdAt,
      };
    });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a change request id or decision id');
    const records = verified(requestSigningKey, decisionSigningKey);
    const request = records.requests.find((record) => record.id === id);
    const decision = records.decisions.find((record) => record.id === id || record.payload.changeRequest.id === id);
    if (!request && !decision) throw new Error(`Production change request or decision not found: ${id}`);
    process.stdout.write(`${JSON.stringify({ request: request || null, decision: decision || null }, null, 2)}\n`);
    return;
  }
  if (command === 'decide') {
    const changeRequestId = args[0];
    if (!changeRequestId) throw new Error('decide requires a change request id');
    const result = decideProductionChangeRequest({
      changeRequestId,
      requestStore,
      decisionStore,
      auditLog,
      requestSigningKey,
      decisionSigningKey,
      decisionSigningKeyId: process.env.AIM_CHANGE_DECISION_SIGNING_KEY_ID || 'production-change-decision-key',
      decision: option(args, '--decision'),
      reviewerName: option(args, '--reviewer'),
      reviewerRole: option(args, '--role'),
      reviewerNote: option(args, '--note'),
      completedApprovals: {
        evidenceReview: booleanOption(args, '--evidence-review'),
        editorialReview: booleanOption(args, '--editorial-review'),
        legalReview: booleanOption(args, '--legal-review'),
        productionOwnerApproval: booleanOption(args, '--production-owner-approval'),
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

try { run(); }
catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
