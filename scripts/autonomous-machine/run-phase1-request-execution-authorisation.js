#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { ProductionExecutionPlanStore } = require('./production-execution-plan-store');
const { ProductionExecutionPlanDecisionStore } = require('./production-execution-plan-decision-store');
const { ProductionExecutionAuthorisationRequestStore } = require('./production-execution-authorisation-request-store');
const { requestProductionExecutionAuthorisation } = require('./production-execution-authorisation-request-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const requestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const changeDecisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const planStore = new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl'));
const planDecisionStore = new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl'));
const authorisationRequestStore = new ProductionExecutionAuthorisationRequestStore(path.join(runtimeDir, 'production-execution-authorisation-requests.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function usage() {
  process.stdout.write([
    'Phase 1.10 time-limited manual execution-authorisation requests',
    '',
    'Commands:',
    '  list',
    '  show <request-id-or-execution-plan-decision-id>',
    '  build <approved-execution-plan-decision-id> --requester <name> --role <role> --note <reason> --rollback-custodian <name> --rollback-note <reason> [--duration-seconds <60-3600>] [--fresh-hash-max-age-seconds <seconds>]',
    '  verify',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY',
    '  AIM_CHANGE_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY',
    '',
    'Optional environment:',
    '  AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY_ID',
    '',
    'This command reads candidate files and creates a signed request record only.',
    'It cannot write production files, commit, deploy or publish.',
  ].join('\n') + '\n');
}

function verifiedRecords(signingKey) {
  const verification = authorisationRequestStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Execution authorisation request ledger verification failed: ${verification.reason}`);
  return authorisationRequestStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }
  const authorisationRequestSigningKey = requiredEnvironment('AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(authorisationRequestStore.verify(authorisationRequestSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedRecords(authorisationRequestSigningKey).map((record) => ({
      id: record.id,
      executionPlanDecisionId: record.payload.executionPlanDecision.id,
      executionPlanId: record.payload.executionPlanDecision.executionPlanId,
      requester: record.payload.requester.name,
      status: record.payload.status,
      expiresAt: record.payload.validity.expiresAt,
      uniqueCandidateCount: record.payload.freshSnapshot.uniqueCandidateCount,
      rollbackPackageComplete: record.payload.rollbackPackage.packageComplete,
      authorisationGranted: record.payload.authorisationGranted,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a request id or execution plan decision id');
    const record = verifiedRecords(authorisationRequestSigningKey).find((item) => (
      item.id === id || item.payload.executionPlanDecision.id === id
    ));
    if (!record) throw new Error(`Execution authorisation request not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'build') {
    const executionPlanDecisionId = args[0];
    if (!executionPlanDecisionId) throw new Error('build requires an approved execution plan decision id');
    const durationText = option(args, '--duration-seconds');
    const maxAgeText = option(args, '--fresh-hash-max-age-seconds');
    const result = requestProductionExecutionAuthorisation({
      executionPlanDecisionId,
      requestStore,
      changeDecisionStore,
      planStore,
      planDecisionStore,
      authorisationRequestStore,
      auditLog,
      repositoryRoot: rootDir,
      requestSigningKey: requiredEnvironment('AIM_CHANGE_REQUEST_SIGNING_KEY'),
      changeDecisionSigningKey: requiredEnvironment('AIM_CHANGE_DECISION_SIGNING_KEY'),
      planSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_SIGNING_KEY'),
      planDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'),
      authorisationRequestSigningKey,
      authorisationRequestSigningKeyId: process.env.AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY_ID || 'production-execution-authorisation-request-key',
      requesterName: option(args, '--requester'),
      requesterRole: option(args, '--role'),
      requesterNote: option(args, '--note'),
      rollbackCustodianName: option(args, '--rollback-custodian'),
      rollbackCustodianNote: option(args, '--rollback-note'),
      durationSeconds: durationText === null ? undefined : Number(durationText),
      freshHashMaxAgeSeconds: maxAgeText === null ? undefined : Number(maxAgeText),
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
