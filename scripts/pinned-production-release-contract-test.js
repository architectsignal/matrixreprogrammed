#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'pinned-production-release-contract-test.json');
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };
const read = relative => {
  const file = path.join(root, relative);
  need(fs.existsSync(file), `Missing required file: ${relative}`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

const deploy = read('.github/workflows/deploy.yml');
const dispatcher = read('.github/workflows/authorized-production-dispatch.yml');
const freezeGuard = read('scripts/release-freeze-guard.js');
const liveVerifier = read('scripts/verify-live-production.js');
const budgetGuard = read('scripts/cloudflare-usage-budget-guard.js');
const oneShotVerifier = read('scripts/verify-one-shot-production-authorization.js');
const freezePath = path.join(root, '.github', 'production-release.freeze');
const freezeActive = fs.existsSync(freezePath) && fs.statSync(freezePath).isFile();
if (freezeActive) {
  const freezeText = fs.readFileSync(freezePath, 'utf8');
  need(/^MATRIX REPROGRAMMED PRODUCTION RELEASE FREEZE\s*$/m.test(freezeText), 'Active release-freeze marker is malformed.');
}

need(/Record exact main commit to deploy/.test(deploy), 'Controlled deploy does not record its exact main SHA.');
need(/DEPLOY_COMMIT_SHA=\$\(git rev-parse HEAD\)/.test(deploy), 'Controlled deploy does not pin the checked-out main SHA.');
need(/ref:\s*\$\{\{\s*github\.sha\s*\}\}/.test(dispatcher), 'Authorized dispatcher does not checkout the exact event SHA.');
need(/run\.head_sha\?\.toLowerCase\(\) === expectedHead/.test(dispatcher), 'Authorized dispatcher does not resolve the exact event SHA.');
need(!/billing_exception:/.test(dispatcher), 'Authorized dispatcher still forwards a retired billing exception.');
need(/release-freeze-guard\.js\s+--require-frozen/.test(dispatcher), 'Authorized dispatcher does not require an active controlled-production freeze.');
need(/--is-frozen/.test(freezeGuard), 'Release freeze guard lacks the non-mutating --is-frozen contract.');
need(/mode === 'owner-exception'/.test(budgetGuard), 'Cloudflare guard no longer proves historical owner exceptions remain closed.');
need(!/ownerExceptionDate|ownerExceptionAuthorization/.test(oneShotVerifier), 'One-shot verifier retains a retired owner-exception authority path.');
for (const route of ['/', '/search', '/member-login', '/forum', '/newsletter', '/evidence-vault', '/black-file']) {
  need(liveVerifier.includes(`'${route}':`), `Live verifier does not contain required route ${route}.`);
}

const directDispatchWorkflows = [
  '.github/workflows/epstein-ai-detective.yml',
  '.github/workflows/live-intel-update.yml',
  '.github/workflows/review-queue-speculation-publish.yml',
];
for (const relative of directDispatchWorkflows) {
  const source = read(relative);
  need(!/gh\s+workflow\s+run[\s\S]{0,300}(?:deploy\.yml|Matrix Reprogrammed Controlled Production Deploy)/i.test(source),
    `${relative} still directly dispatches controlled production.`);
  need(!/\[deploy\]/i.test(source), `${relative} still writes a legacy [deploy] commit marker.`);
  need(/release-freeze-guard\.js\s+--is-frozen/.test(source), `${relative} does not respect the release freeze before writing main.`);
}

const writerWorkflows = [
  '.github/workflows/auto-update-orchestrator.yml',
  '.github/workflows/permanent-release-metadata-repair.yml',
  '.github/workflows/capture-current-deploy-status.yml',
  '.github/workflows/release-status-snapshot.yml',
];
for (const relative of writerWorkflows) {
  const source = read(relative);
  need(/release-freeze-guard\.js\s+--is-frozen/.test(source), `${relative} does not respect the release freeze before writing main.`);
  need(!/git\s+commit\s+-m\s+["'][^"']*\[deploy\]/i.test(source), `${relative} retains a [deploy] commit marker.`);
}

const report = {
  ok: problems.length === 0,
  generatedAt: new Date().toISOString(),
  freezeActive,
  checked: { directDispatchWorkflows, writerWorkflows },
  boundary: 'Only the authorized production dispatcher may invoke the controlled zero-spend deploy. It must resolve the exact event SHA and cannot forward a billing exception. Scheduled intelligence and status workflows may continue read/build work but cannot commit, push or dispatch while the release-freeze marker exists.',
  problems,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (problems.length) {
  console.error('PINNED PRODUCTION RELEASE CONTRACT FAILED');
  problems.forEach(problem => console.error(`- ${problem}`));
  process.exit(1);
}
console.log('PINNED PRODUCTION RELEASE CONTRACT PASSED');
