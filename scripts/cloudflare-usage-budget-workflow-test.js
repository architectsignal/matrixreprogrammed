#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowsDirectory = path.resolve(__dirname, '..', '.github', 'workflows');
const workflowFiles = fs.readdirSync(workflowsDirectory)
  .filter(file => /\.ya?ml$/i.test(file))
  .sort();

const directMutationLine = line => {
  const normalized = line.toLowerCase();
  if (!normalized.includes('wrangler')) return false;
  if (normalized.includes('--dry-run')) return false;
  if (/\bsecret\s+(put|delete)\b/.test(normalized)) return true;
  if (/\bdeploy\b/.test(normalized)) return true;
  if (/\bd1\s+execute\b/.test(normalized) && /(--file=|\b(update|insert|delete|alter|create|drop)\b)/.test(normalized)) return true;
  return false;
};

const directMutationWorkflows = [];
for (const file of workflowFiles) {
  const absolute = path.join(workflowsDirectory, file);
  const source = fs.readFileSync(absolute, 'utf8');
  if (!source.split(/\r?\n/).some(directMutationLine)) continue;
  directMutationWorkflows.push(file);
  assert.match(
    source,
    /node scripts\/cloudflare-usage-budget-guard\.js release/,
    `${file} mutates Cloudflare without the zero-overage guard.`
  );
  assert.doesNotMatch(
    source,
    /^ {2}push:/m,
    `${file} mutates Cloudflare and must remain manual-only.`
  );
}

assert(directMutationWorkflows.length >= 9, 'Expected the known direct Cloudflare mutation workflows to be audited.');
console.log(`Cloudflare workflow budget PASS: ${directMutationWorkflows.length} direct mutation workflows are guarded and manual-only.`);
