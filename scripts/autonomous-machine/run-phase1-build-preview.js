#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ReviewHandoffStore } = require('./review-handoff-store');
const { loadRouteRegistry } = require('./route-registry');
const { buildStagingPreview } = require('./staging-preview-builder');
const { StagingPreviewStore } = require('./staging-preview-store');

function runtimeInsideRepository(repositoryRoot) {
  const configured = process.env.AIM_RUNTIME_ROOT || '.autonomous-machine';
  const runtimeRoot = path.resolve(repositoryRoot, configured);
  const root = path.resolve(repositoryRoot);
  if (runtimeRoot === root || !runtimeRoot.startsWith(`${root}${path.sep}`)) {
    throw new Error('AIM_RUNTIME_ROOT must remain inside the repository working tree');
  }
  return runtimeRoot;
}

function main() {
  if ((process.env.AIM_PUBLICATION_MODE || 'disabled') !== 'disabled') {
    throw new Error('Phase 1.4 requires AIM_PUBLICATION_MODE=disabled');
  }
  const repositoryRoot = process.cwd();
  const runtimeRoot = runtimeInsideRepository(repositoryRoot);
  const action = process.argv[2] || 'list';
  const signingKey = process.env.AIM_REVIEW_SIGNING_KEY || '';
  const handoffStore = new ReviewHandoffStore(path.join(runtimeRoot, 'review-handoffs.jsonl'));
  const previewStore = new StagingPreviewStore(runtimeRoot);
  const auditLog = new AuditLog(path.join(runtimeRoot, 'audit.jsonl'));

  if (action === 'list') {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: 'preview_only',
      previews: previewStore.list(),
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    }, null, 2)}\n`);
    return;
  }

  if (action === 'show') {
    const previewId = process.argv[3];
    if (!previewId) throw new Error('Usage: run-phase1-build-preview.js show <preview-id>');
    const preview = previewStore.read(previewId);
    if (!preview) throw new Error(`Staging preview not found: ${previewId}`);
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return;
  }

  if (action === 'verify') {
    const handoffVerification = handoffStore.verify(signingKey);
    const previewVerification = previewStore.verify();
    const auditVerification = auditLog.verify();
    const ok = handoffVerification.valid && previewVerification.valid && auditVerification.valid;
    process.stdout.write(`${JSON.stringify({
      ok,
      mode: 'preview_only',
      handoffVerification,
      previewVerification,
      auditVerification,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    }, null, 2)}\n`);
    if (!ok) process.exitCode = 1;
    return;
  }

  if (action === 'build') {
    const handoffId = process.argv[3];
    if (!handoffId) throw new Error('Usage: run-phase1-build-preview.js build <accepted-handoff-id>');
    const routeRegistry = loadRouteRegistry(repositoryRoot);
    const result = buildStagingPreview({
      handoffId,
      handoffStore,
      routeRegistry,
      previewStore,
      auditLog,
      signingKey,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, mode: 'preview_only', ...result }, null, 2)}\n`);
    return;
  }

  throw new Error('Usage: run-phase1-build-preview.js <list|show|verify|build> [id]');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
