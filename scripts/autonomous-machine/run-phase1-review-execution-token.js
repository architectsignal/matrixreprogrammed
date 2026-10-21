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
const { ProductionExecutionTokenDecisionStore } = require('./production-execution-token-decision-store');
const { decideProductionExecutionToken } = require('./production-execution-token-decision-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const changeRequestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const changeDecisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const planStore = new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl'));
const planDecisionStore = new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl'));
const authorisationRequestStore = new ProductionExecutionAuthorisationRequestStore(path.join(runtimeDir, 'production-execution-authorisation-requests.jsonl'));
const authorisationDecisionStore = new ProductionExecutionAuthorisationDecisionStore(path.join(runtimeDir, 'production-execution-authorisation-decisions.jsonl'));
const tokenRequestStore = new ProductionExecutionTokenRequestStore(path.join(runtimeDir, 'production-execution-token-requests.jsonl'));
const tokenDecisionStore = new ProductionExecutionTokenDecisionStore(path.join(runtimeDir, 'production-execution-token-decisions.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function flag(args, name) { return args.includes(name); }

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function usage() {
  process.stdout.write([
    'Phase 1.13 signed human decisions for single-use execution-token requests',
    '',
    'Commands:',
    '  list',
    '  show <decision-id-or-request-id>',
    '  decide <token-request-id> <approve|reject> --reviewer <name> --role <role> --note <reason>',
    '    [--all-reviews-complete]',
    '    [--request-window-reviewed] [--final-preflight-reviewed] [--scope-reviewed]',
    '    [--backup-evidence-reviewed] [--restore-evidence-reviewed] [--production-owner-reviewed]',
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
    '  AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY',
    '',
    'Approval performs read-only preflight and scope checks only.',
    'It cannot issue a token, edit files, stage or commit Git changes, deploy or publish.',
  ].join('\n') + '\n');
}

function verifiedDecisions(signingKey) {
  const verification = tokenDecisionStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Execution token decision ledger verification failed: ${verification.reason}`);
  return tokenDecisionStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) { usage(); return; }
  const tokenDecisionSigningKey = requiredEnvironment('AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(tokenDecisionStore.verify(tokenDecisionSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedDecisions(tokenDecisionSigningKey).map((record) => ({
      id: record.id,
      tokenRequestId: record.payload.tokenRequest.id,
      decision: record.payload.decision,
      status: record.payload.status,
      reviewer: record.payload.reviewer.name,
      remainingSeconds: record.payload.validityReview.remainingSeconds,
      candidateCount: record.payload.finalPreflight.candidates.length,
      operationCount: record.payload.scopeReview.operations.length,
      tokenIssued: record.payload.tokenIssued,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a decision id or token request id');
    const record = verifiedDecisions(tokenDecisionSigningKey).find((item) => (
      item.id === id || item.payload.tokenRequest.id === id
    ));
    if (!record) throw new Error(`Execution token decision not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'decide') {
    const requestId = args[0];
    const decision = args[1];
    if (!requestId || !decision) throw new Error('decide requires token request id and approve or reject');
    const allReviews = flag(args, '--all-reviews-complete');
    const result = decideProductionExecutionToken({
      executionTokenRequestId: requestId,
      changeRequestStore,
      changeDecisionStore,
      planStore,
      planDecisionStore,
      authorisationRequestStore,
      authorisationDecisionStore,
      tokenRequestStore,
      tokenDecisionStore,
      auditLog,
      repositoryRoot: rootDir,
      changeRequestSigningKey: requiredEnvironment('AIM_CHANGE_REQUEST_SIGNING_KEY'),
      changeDecisionSigningKey: requiredEnvironment('AIM_CHANGE_DECISION_SIGNING_KEY'),
      planSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_SIGNING_KEY'),
      planDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'),
      authorisationRequestSigningKey: requiredEnvironment('AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY'),
      authorisationDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY'),
      tokenRequestSigningKey: requiredEnvironment('AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY'),
      tokenDecisionSigningKey,
      tokenDecisionSigningKeyId: process.env.AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY_ID
        || 'production-execution-token-decision-key',
      decision,
      reviewerName: option(args, '--reviewer'),
      reviewerRole: option(args, '--role'),
      reviewerNote: option(args, '--note'),
      completedReviews: {
        tokenRequestWindowReview: allReviews || flag(args, '--request-window-reviewed'),
        finalPreflightReview: allReviews || flag(args, '--final-preflight-reviewed'),
        scopeReview: allReviews || flag(args, '--scope-reviewed'),
        backupEvidenceReview: allReviews || flag(args, '--backup-evidence-reviewed'),
        restoreEvidenceReview: allReviews || flag(args, '--restore-evidence-reviewed'),
        productionOwnerReview: allReviews || flag(args, '--production-owner-reviewed'),
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
