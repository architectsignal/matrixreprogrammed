'use strict';

const fs = require('fs');
const path = require('path');
const { classify } = require('./classify-production-release-state.js');

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const success = classify({ deployOutcome:'success', pyramidVerifyOutcome:'success', liveVerifyOutcome:'success', receiptOutcome:'success', live:{ ok:true }, receipt:{ ok:true } });
const receiptFailure = classify({ deployOutcome:'success', pyramidVerifyOutcome:'success', liveVerifyOutcome:'success', receiptOutcome:'failure', live:{ ok:true }, receipt:null });
const liveFailure = classify({ deployOutcome:'success', pyramidVerifyOutcome:'success', liveVerifyOutcome:'failure', receiptOutcome:'skipped', live:{ ok:false }, receipt:null });
const deployFailure = classify({ deployOutcome:'failure', pyramidVerifyOutcome:'skipped', liveVerifyOutcome:'skipped', receiptOutcome:'skipped', live:null, receipt:null });

check(success.ok && success.state === 'deployed-live-verified-receipt-complete', 'complete release state is misclassified');
check(receiptFailure.ok && receiptFailure.liveVerified && !receiptFailure.receiptComplete, 'receipt-only failure incorrectly fails a live-verified release');
check(receiptFailure.redeployRequired === false && /Do not redeploy/i.test(receiptFailure.action || ''), 'receipt-only failure lacks the no-redeploy boundary');
check(!liveFailure.ok && liveFailure.state === 'deployed-live-verification-failed', 'live-verification failure is not distinguished from receipt failure');
check(!deployFailure.ok && deployFailure.state === 'deployment-not-completed', 'pre-deployment failure is not distinguished from a deployment failure');
for (const marker of ['id: cloudflare_deploy','id: pyramid_verify','id: live_verify','id: receipt','continue-on-error: true','classify-production-release-state.js','production-release-state.json']) {
  check(workflow.includes(marker), `controlled production workflow missing release-state marker: ${marker}`);
}

if (failures.length) {
  console.error(`PRODUCTION RELEASE STATE TEST FAILED: ${failures.length}`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Production release state test passed: deploy, live verification and receipt reporting remain distinct; receipt-only failure cannot request a redeploy.');
