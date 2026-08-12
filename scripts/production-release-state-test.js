'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { classify } = require('./classify-production-release-state.js');

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
const dispatchWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'one-shot-dispatch-controlled-production.yml'), 'utf8');
const observerWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'production-run-observer.yml'), 'utf8');
const trackedProductionRecord = JSON.parse(fs.readFileSync(path.join(root, 'data', 'current-production-run.json'), 'utf8'));
const authorizationPath = path.join(root, 'scripts', 'verify-one-shot-production-authorization.js');
const authorization = fs.readFileSync(authorizationPath, 'utf8');
const policyTestPath = path.join(root, 'scripts', 'live-production-verification-policy-test.js');
const dailyDeployGuardPath = path.join(root, 'scripts', 'production-daily-deploy-guard.js');
const autonomousWriterAuditPath = path.join(root, 'scripts', 'autonomous-main-write-freeze-audit.js');
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
  'MATRIX_BILLING_EXCEPTION: ${{ inputs.billing_exception }}',
  'run: node scripts/verify-one-shot-production-authorization.js'
]) {
  check(workflow.includes(marker), `controlled production workflow missing guarded authority input: ${marker}`);
}

for (const marker of [
  "if (actor !== 'github-actions[bot]')",
  'resolveFirstParentMarkerCommit',
  'validTriggerSubject',
  'headSha === originMain',
  "merge-base', '--is-ancestor', marker.targetSha, 'HEAD'",
  'fresh-merged-one-shot-dispatch',
  'fresh-merged-one-shot-owner-exception',
  'triggerAgeHours >= -0.1 && triggerAgeHours <= maxAgeHours'
]) {
  check(authorization.includes(marker), `one-shot production verifier missing security boundary: ${marker}`);
}

for (const marker of ['contents: read', 'production-dispatch-receipt.json', 'actions/upload-artifact@v4', 'immutable dispatch receipt']) {
  check(dispatchWorkflow.includes(marker), `one-shot dispatcher missing immutable receipt boundary: ${marker}`);
}
check(!dispatchWorkflow.includes('contents: write'), 'one-shot dispatcher can still mutate tracked production status');
check(!dispatchWorkflow.includes('createOrUpdateFileContents'), 'one-shot dispatcher can still commit a pending status snapshot');
check(observerWorkflow.includes('contents: read') && !observerWorkflow.includes('contents: write'), 'production observer must remain read-only');
check(trackedProductionRecord.canonical === false, 'tracked production record is not marked historical');
check(trackedProductionRecord.status === 'completed' && trackedProductionRecord.conclusion === 'cancelled', 'tracked production record does not match cancelled run 31617822854');
check(/current and final production state/i.test(trackedProductionRecord.boundary || ''), 'tracked production record lacks its canonical-state boundary');

function runNodeCheck(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...(args || [])], { cwd: root, encoding: 'utf8' });
  check(result.status === 0, `${label} failed: ${(result.stderr || result.stdout || '').trim()}`);
}

runNodeCheck(authorizationPath, ['--self-test'], 'one-shot production authorization self-test');
runNodeCheck(policyTestPath, [], 'live production verification WAF policy test');
runNodeCheck(dailyDeployGuardPath, ['--self-test'], 'Europe/Paris one-production-deploy-per-day self-test');
runNodeCheck(autonomousWriterAuditPath, [], 'autonomous main-write freeze audit');

if (failures.length) {
  console.error(`PRODUCTION RELEASE STATE TEST FAILED: ${failures.length}`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Production release state test passed: guarded human/one-shot authority, immutable dispatch receipts, read-only current-state observation, maximum one successful Europe/Paris production deploy per day, freeze-safe autonomous main writers, live verification, WAF-only supplemental policy and receipt reporting remain distinct; receipt-only failure cannot request a redeploy.');
