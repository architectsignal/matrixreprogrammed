#!/usr/bin/env node
'use strict';

const fs = require('fs');

const workflow = fs.readFileSync('.github/workflows/sync-ai-admin-token.yml', 'utf8');

for (const required of [
  'environment: production',
  'AI_MANAGEMENT_ADMIN_TOKEN: ${{ secrets.AI_MANAGEMENT_ADMIN_TOKEN }}',
  "'AI_COMPUTE_RESOURCE_SCOUT_ENABLED = \"false\"': 'AI_COMPUTE_RESOURCE_SCOUT_ENABLED = \"true\"'",
  "grep -F 'AI_COMPUTE_RESOURCE_SCOUT_ENABLED = \"true\"' .wrangler-ai-auth-repair.toml",
  'node scripts/verify-live-ai-management.mjs'
]) {
  if (!workflow.includes(required)) throw new Error(`Token synchronization workflow is missing: ${required}`);
}

if (!/workflow_dispatch:\s*[\s\S]*description: 'Type SYNC AI ADMIN TOKEN'/.test(workflow)) {
  throw new Error('Token synchronization workflow is not protected by the explicit owner confirmation.');
}

console.log('AI TOKEN SYNC WORKFLOW TEST PASSED: production-scoped secret, compute-cycle activation and live verification are required.');
