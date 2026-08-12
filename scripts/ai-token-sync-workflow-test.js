#!/usr/bin/env node
'use strict';

const fs = require('fs');

const workflow = fs.readFileSync('.github/workflows/sync-ai-admin-token.yml', 'utf8');

for (const required of [
  'environment: production',
  'AI_MANAGEMENT_ADMIN_TOKEN: ${{ secrets.AI_MANAGEMENT_ADMIN_TOKEN }}',
  'AI_DIRECT_WORKER_URL=https://matrixreprogrammed.$SUBDOMAIN.workers.dev',
  'SITE_URL: ${{ env.AI_DIRECT_WORKER_URL }}',
  'secret put ADMIN_API_TOKEN --name matrixreprogrammed',
  'secret put AI_MANAGEMENT_ADMIN_TOKEN --name matrixreprogrammed',
  'node scripts/verify-live-ai-management.mjs'
]) {
  if (!workflow.includes(required)) throw new Error(`Token synchronization workflow is missing: ${required}`);
}

if (/wrangler(?:@latest)?\s+deploy\b/.test(workflow)) {
  throw new Error('Token synchronization must not redeploy application code or static assets.');
}

if (!/workflow_dispatch:\s*[\s\S]*description: 'Type SYNC AI ADMIN TOKEN'/.test(workflow)) {
  throw new Error('Token synchronization workflow is not protected by the explicit owner confirmation.');
}

console.log('AI TOKEN SYNC WORKFLOW TEST PASSED: production-scoped secrets bind without an application redeploy and verify through the direct Worker endpoint.');
