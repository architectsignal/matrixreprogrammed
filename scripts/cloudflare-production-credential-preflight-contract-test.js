'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const scriptPath = path.join(root, 'scripts', 'cloudflare-production-credential-preflight.mjs');
const workflowPath = path.join(root, '.github', 'workflows', 'cloudflare-production-credential-preflight.yml');
const reportPath = path.join(root, 'downloads', 'cloudflare-production-credential-preflight-contract-test.json');
const failures = [];
const need = (condition, message) => { if (!condition) failures.push(message); };

need(fs.existsSync(scriptPath), 'credential preflight script is missing');
need(fs.existsSync(workflowPath), 'credential preflight workflow is missing');

const script = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
const syntax = spawnSync(process.execPath, ['--check', scriptPath], { cwd: root, encoding: 'utf8' });
need(syntax.status === 0, `credential preflight syntax failed: ${syntax.stderr || syntax.stdout || syntax.status}`);

for (const marker of [
  "['whoami']",
  "['d1', 'info', databaseName]",
  "['d1', 'time-travel', 'info', databaseName, '--json']",
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'AI_MANAGEMENT_ADMIN_TOKEN',
  'ownerVerificationTokenLengthValid',
  'cloudflare-production-credential-preflight.json',
  'No deployment was attempted',
  'MEMBERS_DB',
  'matrix-members'
]) need(script.includes(marker), `credential preflight missing contract marker: ${marker}`);

for (const forbidden of [
  "['deploy'",
  "'d1', 'execute'",
  "'secret', 'put'",
  "'secret', 'delete'",
  "'d1', 'time-travel', 'restore'",
  'method: \'POST\'',
  'method: "POST"',
  'method: \'DELETE\'',
  'method: "DELETE"'
]) need(!script.includes(forbidden), `credential preflight contains mutating operation: ${forbidden}`);

for (const marker of [
  'name: Cloudflare Production Credential Preflight',
  'pull_request:',
  'push:',
  'branches:',
  '- main',
  'workflow_dispatch:',
  'contents: read',
  'issues: write',
  'environment: production',
  "if: github.event_name != 'pull_request'",
  'node scripts/cloudflare-production-credential-preflight-contract-test.js',
  'node scripts/cloudflare-production-credential-preflight.mjs',
  'downloads/cloudflare-production-credential-preflight.json',
  'Publish sanitized preflight status',
  "const title = 'Cloudflare Production Credential Preflight';",
  'Preflight **${status}**',
  'No deployment or D1 mutation was attempted.',
  'github.rest.issues.update',
  'github.rest.issues.create'
]) need(workflow.includes(marker), `credential preflight workflow missing marker: ${marker}`);

const contractJob = workflow.match(/jobs:\s*\n\s*contract:[\s\S]*?\n\s*preflight:/)?.[0] || '';
const preflightJob = workflow.match(/\n\s*preflight:[\s\S]*$/)?.[0] || '';
need(contractJob && !/CLOUDFLARE_API_TOKEN|environment:\s*production/.test(contractJob), 'PR contract job must not receive production secrets');
need(preflightJob.includes('if: always()') && preflightJob.includes('actions/github-script@v7'), 'Production preflight does not publish a status when a read check fails');
need(!/npm\s+(?:ci|install)|npm run build/.test(workflow), 'credential preflight must not install the application or build the site');

// The status publisher may repeat sanitized report strings, but it must never
// interpolate or print a secret expression into issue content.
const statusStep = workflow.split('- name: Publish sanitized preflight status')[1] || '';
need(statusStep.length > 0, 'Sanitized status step could not be isolated');
need(!/secrets\.|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|AI_MANAGEMENT_ADMIN_TOKEN|ADMIN_API_TOKEN/.test(statusStep), 'Sanitized status step references production secret values');
need(statusStep.includes('report?.checks') && statusStep.includes('report?.failures') && statusStep.includes('report?.nextAction') && statusStep.includes('report?.boundary'), 'Status issue does not use the sanitized preflight report fields');
need(!/body:[\s\S]*process\.env/i.test(statusStep), 'Status issue body reads environment variables directly');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks: 45,
  failures,
  boundary: 'The production credential preflight uses only Cloudflare identity, D1 metadata and D1 Time Travel metadata reads. Pull requests receive no production environment secrets, no site build is performed, and the persistent GitHub issue contains only the sanitized report—not environment variables or secret values.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('CLOUDFLARE PRODUCTION CREDENTIAL PREFLIGHT CONTRACT FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('CLOUDFLARE PRODUCTION CREDENTIAL PREFLIGHT CONTRACT PASSED: fail-fast, read-only, production-secret isolated and sanitised status reporting enforced.');
