#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { ProductionExecutionPlanStore } = require('./production-execution-plan-store');
const { buildProductionExecutionPlan } = require('./production-execution-plan-builder');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const requestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const decisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const planStore = new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function usage() {
  process.stdout.write([
    'Phase 1.8 preview-only production target mapping and execution plans',
    '',
    'Commands:',
    '  list',
    '  show <execution-plan-id-or-decision-id>',
    '  build <approved-decision-id> --planner <name> --note <reason> [--max-file-bytes <bytes>]',
    '  verify',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY',
    '  AIM_CHANGE_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_SIGNING_KEY',
    '',
    'Optional environment:',
    '  AIM_EXECUTION_PLAN_SIGNING_KEY_ID',
    '',
    'This command reads candidate repository files only. It cannot edit, commit, deploy or publish.',
  ].join('\n') + '\n');
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function verifiedPlans(signingKey) {
  const verification = planStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Production execution plan ledger verification failed: ${verification.reason}`);
  return planStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }
  const planSigningKey = requiredEnvironment('AIM_EXECUTION_PLAN_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(planStore.verify(planSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedPlans(planSigningKey).map((record) => ({
      id: record.id,
      decisionId: record.payload.decision.id,
      changeRequestId: record.payload.changeRequest.id,
      planner: record.payload.planner.name,
      status: record.payload.status,
      targetCount: record.payload.targetMappings.length,
      existingCandidateCount: record.payload.repositorySnapshot.existingCandidateCount,
      missingCandidateCount: record.payload.repositorySnapshot.missingCandidateCount,
      readyForExecution: record.payload.executionPlan.readyForExecution,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires an execution plan id or decision id');
    const record = verifiedPlans(planSigningKey).find((item) => (
      item.id === id || item.payload.decision.id === id
    ));
    if (!record) throw new Error(`Production execution plan not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'build') {
    const decisionId = args[0];
    if (!decisionId) throw new Error('build requires an approved decision id');
    const maxFileBytesText = option(args, '--max-file-bytes');
    const maxFileBytes = maxFileBytesText === null ? undefined : Number(maxFileBytesText);
    const result = buildProductionExecutionPlan({
      decisionId,
      requestStore,
      decisionStore,
      planStore,
      auditLog,
      repositoryRoot: rootDir,
      requestSigningKey: requiredEnvironment('AIM_CHANGE_REQUEST_SIGNING_KEY'),
      decisionSigningKey: requiredEnvironment('AIM_CHANGE_DECISION_SIGNING_KEY'),
      planSigningKey,
      planSigningKeyId: process.env.AIM_EXECUTION_PLAN_SIGNING_KEY_ID || 'production-execution-plan-key',
      plannerName: option(args, '--planner'),
      plannerNote: option(args, '--note'),
      maxFileBytes,
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
