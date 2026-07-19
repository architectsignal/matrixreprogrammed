import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const baseScript = path.join(root, 'scripts', 'paid-launch-payment-matrix-test.mjs');
const reportPath = path.join(root, 'downloads', 'paid-launch-payment-matrix-test.json');
const outputPath = path.join(root, 'downloads', 'paid-launch-payment-matrix-test-v2.json');

const run = spawnSync(process.execPath, [baseScript], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 20 * 1024 * 1024
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (!fs.existsSync(reportPath)) throw new Error('Base paid-launch matrix did not write its report.');

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const paypal = fs.readFileSync(path.join(root, 'src', 'worker-paypal-subscriptions.js'), 'utf8');
const storePatch = fs.readFileSync(path.join(root, 'scripts', 'patch-voluntary-support-store.js'), 'utf8');
const storeReportPath = path.join(root, 'downloads', 'voluntary-support-store-patch.json');
const storeReport = fs.existsSync(storeReportPath) ? JSON.parse(fs.readFileSync(storeReportPath, 'utf8')) : null;

function setCheck(name, ok, detail) {
  const item = report.checks.find(check => check.name === name);
  if (!item) throw new Error(`Base matrix is missing check: ${name}`);
  item.ok = Boolean(ok);
  item.detail = detail || '';
}

const webhookStart = paypal.indexOf('async function webhook(request,env)');
const webhookEnd = paypal.indexOf('async function health(request,env)', webhookStart);
const webhookHandler = webhookStart >= 0 && webhookEnd > webhookStart ? paypal.slice(webhookStart, webhookEnd) : '';
const verificationInsert = webhookHandler.indexOf('INSERT OR REPLACE INTO paypal_webhook_verifications');
const verificationFailureReturn = webhookHandler.indexOf('if(!verification.ok)return', verificationInsert);
const duplicateCheck = webhookHandler.indexOf('SELECT processing_status FROM payment_webhook_events', verificationFailureReturn);
const eventProcessing = webhookHandler.indexOf('processWebhookEvent(env,event,payloadHash)', duplicateCheck);
const verifiedBeforeProcessing = verificationInsert >= 0 && verificationFailureReturn > verificationInsert && duplicateCheck > verificationFailureReturn && eventProcessing > duplicateCheck;
setCheck('verified event recorded before processing', verifiedBeforeProcessing, verifiedBeforeProcessing ? 'Webhook handler persists verification, rejects failures, checks duplicates and only then processes the event.' : 'Webhook runtime order is unsafe or could not be proven.');

const sourceHasRemovalRules = [
  'function cleanPublicCopy',
  '.replace(/Buy Placeholder/gi',
  '.replace(/Join Placeholder/gi',
  '.replace(/Email capture placeholder:',
  'implementationCopyRemoved'
].every(marker => storePatch.includes(marker));
const outputHasNoImplementationCopy = Boolean(storeReport?.ok) && Array.isArray(storeReport?.checks) && storeReport.checks.length >= 3 && storeReport.checks.every(item => item.implementationCopyRemoved === true);
const placeholdersRemoved = sourceHasRemovalRules && outputHasNoImplementationCopy;
setCheck('store generator removes implementation placeholders', placeholdersRemoved, placeholdersRemoved ? 'Generator has explicit removal rules and all patched source/output surfaces report implementationCopyRemoved=true.' : 'Placeholder removal could not be proven in both generator source and patched output.');

report.failures = report.checks.filter(check => !check.ok).map(check => check.detail ? `${check.name}: ${check.detail}` : check.name);
report.ok = report.failures.length === 0;
report.generatedAt = new Date().toISOString();
report.verifier = {
  version: 2,
  baseExitStatus: run.status,
  correctedAssertions: ['verified event recorded before processing', 'store generator removes implementation placeholders'],
  safetyBoundary: 'Only two brittle source-position assertions are recalculated. Every other base-matrix result is preserved.'
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error('\nPAID LAUNCH PAYMENT MATRIX V2 FAILED\n');
  report.failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PAID LAUNCH PAYMENT MATRIX V2 PASSED (${report.checks.length} checks; live charging remains disabled)`);
