#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().toLowerCase();
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Could not resolve the exact release SHA.');
const now = new Date();
const requested = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
const stamp = requested.replace(/[-:]/g, '').replace('.000', '');
const nonce = `pr224-final-black-file-pinned-production-${stamp}-${sha.slice(0, 8)}`;
const billingException = 'OWNER AUTHORIZED ONE BILLABLE BUILD 2026-08-02';
const ownerExceptionDate = '2026-08-07';

const oneShot = `DEPLOY MATRIX REPROGRAMMED
Requested: ${requested}
Release: pr224-final-black-file-pinned-production
Target: current main ${sha} containing the final Black File pathway-ID repair, exact-SHA release orchestration and active automation freeze
Authorization: exactly one controlled Cloudflare production deployment
Billing exception: ${billingException}
Tracking: dispatch exactly one run whose pinned target_sha is the resolved dispatcher head; never reuse a failed, cancelled or wrong-SHA run
Required proof: complete production build; owner-authorized single billable-build exception on ${ownerExceptionDate}; verified D1 Time Travel rollback bookmark; repeat-safe migrations; AI_RESOURCE_ZERO_SPEND_LOCK=true; valid credentials; exact deployed SHA; live homepage, search, login, forum, newsletter, Evidence Vault and Black File verification; and no regression to membership, email, PayPal, contact intake, evidence labels or existing public pages
Purpose: deploy merged PR #224 plus the final Black File postbuild repair, with one page-specific matrix pathway ID across source and all aliases
Boundary: owner-authorized single billable build on ${ownerExceptionDate}; all other zero-spend, credential, rollback, migration, evidence-label, payment, human-review and exact live-verification gates remain mandatory; the release freeze stays active until exact proof passes
Nonce: ${nonce}
`;
const productionTrigger = `DEPLOY MATRIX REPROGRAMMED
Requested: ${requested}
Target: current main ${sha} containing the final pinned release repair
Authorization: exactly one controlled Cloudflare production deployment
Billing exception: ${billingException}
Purpose: dispatch the exact repaired release through the sole authorized production dispatcher
Boundary: target_sha, credentials, D1 rollback, repeat-safe migrations, zero-spend controls and live verification remain mandatory
Nonce: ${nonce}-dispatch
`;

fs.mkdirSync(path.join(root, '.github'), { recursive: true });
fs.writeFileSync(path.join(root, '.github', 'one-shot-controlled-production.trigger'), oneShot);
fs.writeFileSync(path.join(root, '.github', 'production-deploy.trigger'), productionTrigger);
console.log(`Prepared fresh pinned production markers for release base ${sha}. Commit both marker files together; the resulting dispatcher commit will be pinned and passed as target_sha.`);
