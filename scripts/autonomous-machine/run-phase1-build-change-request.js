#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { StagingApplyStore } = require('./staging-apply-store');
const { buildProductionChangeRequest } = require('./production-change-request-builder');
const { ProductionChangeRequestStore } = require('./production-change-request-store');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const applyStore = new StagingApplyStore(runtimeDir);
const requestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function usage() {
  process.stdout.write([
    'Phase 1.6 advisory production change requests',
    '',
    'Commands:',
    '  list',
    '  show <change-request-id-or-application-id>',
    '  build <application-id> --requester <name> --note <reason>',
    '  verify',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY   Separate secret containing at least 32 bytes',
    '',
    'Optional environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY_ID',
    '',
    'This command cannot modify production files, commit, deploy or publish.',
  ].join('\n') + '\n');
}

function verifiedRecords(signingKey) {
  const verification = requestStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Production change request ledger verification failed: ${verification.reason}`);
  return requestStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }
  const signingKey = process.env.AIM_CHANGE_REQUEST_SIGNING_KEY;
  if (!signingKey) throw new Error('AIM_CHANGE_REQUEST_SIGNING_KEY is required');

  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(requestStore.verify(signingKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedRecords(signingKey).map((record) => ({
      id: record.id,
      applicationId: record.payload.application.id,
      requester: record.payload.requester.name,
      status: record.payload.status,
      changeCount: record.payload.changes.length,
      legalReviewRequired: record.payload.requiredApprovals.legalReview,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a change request id or application id');
    const record = verifiedRecords(signingKey).find((item) => (
      item.id === id || item.payload.application.id === id
    ));
    if (!record) throw new Error(`Production change request not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'build') {
    const applicationId = args[0];
    if (!applicationId) throw new Error('build requires an application id');
    const result = buildProductionChangeRequest({
      applicationId,
      applyStore,
      requestStore,
      auditLog,
      signingKey,
      signingKeyId: process.env.AIM_CHANGE_REQUEST_SIGNING_KEY_ID || 'production-change-request-key',
      requesterName: option(args, '--requester'),
      requesterNote: option(args, '--note'),
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
