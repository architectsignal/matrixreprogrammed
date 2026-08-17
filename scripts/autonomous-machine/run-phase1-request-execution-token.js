#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { ProductionExecutionPlanStore } = require('./production-execution-plan-store');
const { ProductionExecutionPlanDecisionStore } = require('./production-execution-plan-decision-store');
const { ProductionExecutionAuthorisationRequestStore } = require('./production-execution-authorisation-request-store');
const { ProductionExecutionAuthorisationDecisionStore } = require('./production-execution-authorisation-decision-store');
const { ProductionExecutionTokenRequestStore } = require('./production-execution-token-request-store');
const { requestProductionExecutionToken } = require('./production-execution-token-request-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const changeRequestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const changeDecisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const planStore = new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl'));
const planDecisionStore = new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl'));
const authorisationRequestStore = new ProductionExecutionAuthorisationRequestStore(path.join(runtimeDir, 'production-execution-authorisation-requests.jsonl'));
const authorisationDecisionStore = new ProductionExecutionAuthorisationDecisionStore(path.join(runtimeDir, 'production-execution-authorisation-decisions.jsonl'));
const tokenRequestStore = new ProductionExecutionTokenRequestStore(path.join(runtimeDir, 'production-execution-token-requests.jsonl'));
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
    'Phase 1.12 signed single-use execution-token requests',
    '',
    'Commands:',
    '  list',
    '  show <token-request-id-or-authorisation-decision-id>',
    '  request <authorisation-decision-id> --requester <name> --role <role> --note <reason> [--duration-seconds <30-300>]',
    '  verify',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY',
    '  AIM_CHANGE_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY',
    '  AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY',
    '',
    'Optional environment:',
    '  AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY_ID',
    '',
    'This command creates only a signed token request record. It issues no token material and cannot edit, commit, deploy or publish.',
  ].join('\n') + '\n');
}

function verifiedRequests(signingKey) {
  const verification = tokenRequestStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Execution token request ledger verification failed: ${verification.reason}`);
  return tokenRequestStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) { usage(); return; }
  const tokenRequestSigningKey = requiredEnvironment('AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(tokenRequestStore.verify(tokenRequestSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedRequests(tokenRequestSigningKey).map((record) => ({
      id: record.id,
      authorisationDecisionId: record.payload.authorisationDecision.id,
      status: record.payload.status,
      requester: record.payload.requester.name,
      expiresAt: record.payload.validity.expiresAt,
      targetCount: record.payload.scope.targetIds.length,
      candidateCount: record.payload.scope.candidateCount,
      operationCount: record.payload.scope.operationCount,
      tokenIssued: record.payload.tokenIssued,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a token request id or authorisation decision id');
    const record = verifiedRequests(tokenRequestSigningKey).find((item) => (
      item.id === id || item.payload.authorisationDecision.id === id
    ));
    if (!record) throw new Error(`Execution token request not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'request') {
    const authorisationDecisionId = args[0];
    if (!authorisationDecisionId) throw new Error('request requires an authorisation decision id');
    const durationText = option(args, '--duration-seconds');
    const durationSeconds = durationText === null ? undefined : Number(durationText);
    const result = requestProductionExecutionToken({
      executionAuthorisationDecisionId: authorisationDecisionId,
      changeRequestStore,
      changeDecisionStore,
      planStore,
      planDecisionStore,
      authorisationRequestStore,
      authorisationDecisionStore,
      tokenRequestStore,
      auditLog,
      repositoryRoot: rootDir,
      changeRequestSigningKey: requiredEnvironment('AIM_CHANGE_REQUEST_SIGNING_KEY'),
      changeDecisionSigningKey: requiredEnvironment('AIM_CHANGE_DECISION_SIGNING_KEY'),
      planSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_SIGNING_KEY'),
      planDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'),
      authorisationRequestSigningKey: requiredEnvironment('AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY'),
      authorisationDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY'),
      tokenRequestSigningKey,
      tokenRequestSigningKeyId: process.env.AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY_ID
        || 'production-execution-token-request-key',
      requesterName: option(args, '--requester'),
      requesterRole: option(args, '--role'),
      requesterNote: option(args, '--note'),
      durationSeconds,
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
