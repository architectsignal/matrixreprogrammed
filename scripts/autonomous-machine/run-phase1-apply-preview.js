#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { StagingApplyStore } = require('./staging-apply-store');
const { StagingPreviewStore } = require('./staging-preview-store');
const { applyStagingPreview } = require('./staging-preview-applier');

function usage() {
  process.stderr.write([
    'Usage:',
    '  node scripts/autonomous-machine/run-phase1-apply-preview.js list',
    '  node scripts/autonomous-machine/run-phase1-apply-preview.js show <application-id-or-fingerprint>',
    '  node scripts/autonomous-machine/run-phase1-apply-preview.js apply <preview-id-or-fingerprint> [expected-preview-fingerprint]',
    '  node scripts/autonomous-machine/run-phase1-apply-preview.js verify',
    '',
    'This command writes only disposable runtime artifacts under .autonomous-machine/.',
    'It cannot write production files, create commits, deploy or publish.',
  ].join('\n') + '\n');
}

function main() {
  const rootDir = process.cwd();
  const runtimeRoot = path.join(rootDir, '.autonomous-machine');
  const previewStore = new StagingPreviewStore(runtimeRoot);
  const applyStore = new StagingApplyStore(runtimeRoot);
  const auditLog = new AuditLog(path.join(runtimeRoot, 'audit.jsonl'));
  const [command, identifier, expectedPreviewFingerprint] = process.argv.slice(2);

  if (command === 'list') {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: 'disposable_runtime_only',
      applications: applyStore.list(),
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    }, null, 2)}\n`);
    return;
  }

  if (command === 'show') {
    if (!identifier) throw new Error('show requires an application id or fingerprint');
    const application = applyStore.read(identifier);
    if (!application) throw new Error(`Disposable staging application not found: ${identifier}`);
    process.stdout.write(`${JSON.stringify({ ok: true, application }, null, 2)}\n`);
    return;
  }

  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      previewStore: previewStore.verify(),
      applicationStore: applyStore.verify(),
      audit: auditLog.verify(),
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    }, null, 2)}\n`);
    return;
  }

  if (command === 'apply') {
    if (!identifier) throw new Error('apply requires a preview id or fingerprint');
    const result = applyStagingPreview({
      previewId: identifier,
      expectedPreviewFingerprint: expectedPreviewFingerprint || undefined,
      previewStore,
      applyStore,
      auditLog,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
    return;
  }

  usage();
  process.exitCode = 2;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
