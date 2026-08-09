'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { classify } = require('./classify-production-release-state.js');

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
const authorizationPath = path.join(root, 'scripts', 'verify-one-shot-production-authorization.js');
const authorization = fs.readFileSync(authorizationPath, 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const success = classify({ deployOutcome:'success', aiVerifyOutcome:'success', pyramidVerifyOutcome:'success', liveVerifyOutcome:'success', receiptOutcome:'success', ai:{ ok:true }, live:{ ok:true }, receipt:{ ok:true } });
const receiptFailure = classify({ deployOutcome:'success', aiVerifyOutcome:'success', pyramidVerifyOutcome:'success', liveVerifyOutcome:'success', receiptOutcome:'failure', ai:{ ok:true }, live:{ ok:true }, receipt:null });
const aiFailure = classify({ deployOutcome:'success', aiVerifyOutcome:'failure', pyramidVerifyOutcome:'skipped', liveVerifyOutcome:'skipped', receiptOutcome:'skipped', ai:{ ok:false }, live:null, receipt:null });
const liveFailure = classify({ deployOutcome:'success', aiVerifyOutcome:'success', pyramidVerifyOutcome:'success', liveVerifyOutcome:'failure', receiptOutcome:'skipped', ai:{ ok:true }, live:{ ok:false }, receipt:null });
const deployFailure = classify({ deployOutcome:'failure', aiVerifyOutcome:'skipped', pyramidVerifyOutcome:'skipped', liveVerifyOutcome:'skipped', receiptOutcome:'skipped', ai:null, live:null, receipt:null });

check(success.ok && success.state === 'deployed-live-verified-receipt-complete', 'complete release state is misclassified');
check(receiptFailure.ok && receiptFailure.liveVerified && !receiptFailure.receiptComplete, 'receipt-only failure incorrectly fails a live-verified release');
check(receiptFailure.redeployRequired === false && /Do not redeploy/i.test(receiptFailure.action || ''), 'receipt-only failure lacks the no-redeploy boundary');
check(!aiFailure.ok && aiFailure.state === 'deployed-live-verification-failed', 'AI control-plane failure is not distinguished from receipt failure');
check(!liveFailure.ok && liveFailure.state === 'deployed-live-verification-failed', 'live-verification failure is not distinguished from receipt failure');
check(!deployFailure.ok && deployFailure.state === 'deployment-not-completed', 'pre-deployment failure is not distinguished from a deployment failure');

for (const marker of ['workers_dev = true','Resolve canonical workers.dev endpoint','id: cloudflare_deploy','id: ai_verify','id: pyramid_verify','id: live_verify','id: receipt','continue-on-error: true','AI_VERIFY_OUTCOME','classify-production-release-state.js','production-release-state.json']) {
  check(workflow.includes(marker), `controlled production workflow missing release-state marker: ${marker}`);
}

const checkoutIndex = workflow.indexOf('- name: Checkout latest main');
const authorityIndex = workflow.indexOf('- name: Confirm explicit production release authority');
check(
  checkoutIndex >= 0 && authorityIndex >= 0 && checkoutIndex < authorityIndex,
  'repository must be checked out before the guarded production authority verifier runs'
);

for (const marker of [
  'MATRIX_PRODUCTION_CONFIRMATION: ${{ inputs.confirmation }}',
  'MATRIX_PRODUCTION_ACTOR: ${{ github.actor }}',
  'MATRIX_WORKFLOW_EVENT: ${{ github.event_name }}',
  'run: node scripts/verify-one-shot-production-authorization.js'
]) {
  check(workflow.includes(marker), `controlled production workflow missing guarded authority input: ${marker}`);
}

// Explicit human dispatches and the repository-owned one-shot bot dispatcher are
// separate authority paths. The bot path is allowed only when a fresh marker,
// first-parent trigger commit, current main and authorized target all agree.
for (const marker of [
  "if (actor !== 'github-actions[bot]')",
  'resolveFirstParentMarkerCommit',
  'validTriggerSubject',
  'headSha === originMain',
  "merge-base', '--is-ancestor', marker.targetSha, 'HEAD'",
  'fresh-merged-one-shot-dispatch',
  'triggerAgeHours >= -0.1 && triggerAgeHours <= maxAgeHours'
]) {
  check(authorization.includes(marker), `one-shot production verifier missing security boundary: ${marker}`);
}
check(!workflow.includes('billing_exception') && !workflow.includes('owner-exception'),
  'controlled production workflow retains a retired billable-build exception path');

const authorizationSelfTest = spawnSync(process.execPath, [authorizationPath, '--self-test'], {
  cwd: root,
  encoding: 'utf8'
});
check(
  authorizationSelfTest.status === 0,
  `one-shot production authorization self-test failed: ${(authorizationSelfTest.stderr || authorizationSelfTest.stdout || '').trim()}`
);

if (failures.length) {
  console.error(`PRODUCTION RELEASE STATE TEST FAILED: ${failures.length}`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Production release state test passed: guarded human/one-shot authority, deployment, live verification and receipt reporting remain distinct; receipt-only failure cannot request a redeploy.');
