'use strict';

const fs = require('fs');
const path = require('path');

function classify({ deployOutcome, aiVerifyOutcome, pyramidVerifyOutcome, liveVerifyOutcome, receiptOutcome, ai, live, receipt }) {
  const deployed = deployOutcome === 'success';
  const liveVerified = deployed
    && aiVerifyOutcome === 'success'
    && ai?.ok === true
    && pyramidVerifyOutcome === 'success'
    && liveVerifyOutcome === 'success'
    && live?.ok === true;
  const receiptComplete = receiptOutcome === 'success' && receipt?.ok === true;

  if (!deployed) {
    return { ok: false, state: 'deployment-not-completed', deployed: false, liveVerified: false, receiptComplete: false, redeployRequired: false };
  }
  if (!liveVerified) {
    return { ok: false, state: 'deployed-live-verification-failed', deployed: true, liveVerified: false, receiptComplete: false, redeployRequired: false };
  }
  if (!receiptComplete) {
    return {
      ok: true,
      state: 'deployed-live-verified-reporting-degraded',
      deployed: true,
      liveVerified: true,
      receiptComplete: false,
      redeployRequired: false,
      action: 'Repair or rerun receipt reporting. Do not redeploy solely because this post-deployment reporting stage failed.',
    };
  }
  return { ok: true, state: 'deployed-live-verified-receipt-complete', deployed: true, liveVerified: true, receiptComplete: true, redeployRequired: false };
}

if (require.main === module) {
  const root = process.cwd();
  const readJson = relative => {
    try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
    catch { return null; }
  };
  const outcomes = {
    deployOutcome: process.env.CLOUDFLARE_DEPLOY_OUTCOME || 'unknown',
    aiVerifyOutcome: process.env.AI_VERIFY_OUTCOME || 'unknown',
    pyramidVerifyOutcome: process.env.PYRAMID_VERIFY_OUTCOME || 'unknown',
    liveVerifyOutcome: process.env.LIVE_VERIFY_OUTCOME || 'unknown',
    receiptOutcome: process.env.RECEIPT_OUTCOME || 'unknown',
  };
  const result = classify({
    ...outcomes,
    ai: readJson('downloads/live-ai-management-verification.json'),
    live: readJson('downloads/live-production-verification.json'),
    receipt: readJson('downloads/production-deploy-receipt.json'),
  });
  const report = {
    ...result,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    deployedCommit: process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || null,
    outcomes,
    boundary: 'Cloudflare deployment, direct owner-only AI verification, public live verification and post-deployment receipt reporting are separate states. Receipt-only failure never authorizes or requires a repeat deployment.',
  };
  fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'downloads', 'production-release-state.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Production release state: ${report.state}.`);
  if (!report.ok) process.exit(1);
}

module.exports = { classify };
