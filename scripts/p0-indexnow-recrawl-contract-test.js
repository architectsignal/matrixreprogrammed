'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const issues = [];
const need = (condition, message) => { if (!condition) issues.push(message); };

const config = JSON.parse(read('data/p0-recrawl-priority-urls.json'));
const keyFile = read(config.indexNowKeyFile).trim();
const script = read('scripts/p0-submit-indexnow-recrawl.mjs');
const workflow = read('.github/workflows/p0-search-engine-recrawl.yml');
const cloudflareBuilder = read('scripts/build-cloudflare-output.js');

need(config.siteUrl === 'https://matrixreprogrammed.com', 'Recrawl host must remain the canonical production origin');
need(config.indexNowEndpoint === 'https://api.indexnow.org/indexnow', 'IndexNow endpoint must remain the canonical HTTPS API endpoint');
need(/^[A-Za-z0-9-]{8,128}$/.test(config.indexNowKey || ''), 'IndexNow key format is invalid');
need(config.indexNowKeyFile === `${config.indexNowKey}.txt`, 'IndexNow key filename must match the key');
need(keyFile === config.indexNowKey, 'Public IndexNow key file does not match the configured key');
need(Number(config.maximumBatchSize) <= 10000, 'IndexNow batch cap must not exceed 10,000 URLs');
need(Array.isArray(config.priorityPaths) && config.priorityPaths.length > 0, 'Priority recrawl list is empty');
need(new Set(config.priorityPaths || []).size === (config.priorityPaths || []).length, 'Priority recrawl list contains duplicate paths');
need((config.priorityPaths || []).every(route => /^\/(?!\/)[^?#]*$/.test(String(route))), 'Priority recrawl paths must be local canonical paths without query strings or fragments');
need((config.priorityPaths || []).length <= Number(config.maximumBatchSize || 0), 'Priority recrawl list exceeds its configured batch cap');

for (const marker of [
  "allowedExt = new Set(['.html'",
  "'.txt'"
]) need(cloudflareBuilder.includes(marker), `Cloudflare builder must deploy the public key file: ${marker}`);

for (const marker of [
  "'/deploy-manifest.json'",
  "'/deploy-health.json'",
  'manifest?.commitSha',
  'health?.buildSha !== liveSha',
  'health?.manifestSha !== liveSha',
  'health?.manifestMatches !== true',
  'expectedSha && liveSha !== expectedSha',
  'keyResponse.text.trim() !== key',
  'forbiddenResidue',
  "method: 'POST'",
  'keyLocation:',
  'urlList: urls',
  "response.status === 200 || response.status === 202",
  "endpoint !== 'https://api.indexnow.org/indexnow'",
  'acceptance confirms receipt only'
]) need(script.includes(marker), `Recrawl submitter missing boundary marker: ${marker}`);

for (const forbidden of [
  "method: 'DELETE'",
  'wrangler d1',
  'CLOUDFLARE_API_TOKEN',
  'ADMIN_API_TOKEN',
  'AI_MANAGEMENT_ADMIN_TOKEN',
  '/api/paypal/',
  '/submit-main-post',
  '/api/membership/signup'
]) need(!script.includes(forbidden), `Recrawl submitter contains forbidden mutating or privileged operation: ${forbidden}`);

for (const marker of [
  'P0 Live Public Completion Gate',
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event != 'pull_request'",
  'ref: main',
  'p0-indexnow-recrawl-contract-test.js',
  'p0-submit-indexnow-recrawl.mjs',
  'downloads/p0-indexnow-recrawl.json'
]) need(workflow.includes(marker), `Recrawl workflow missing release boundary: ${marker}`);

need(!workflow.includes('CLOUDFLARE_API_TOKEN'), 'Recrawl workflow must not receive Cloudflare credentials');
need(!workflow.includes('permissions:\n  contents: write'), 'Recrawl workflow must remain read-only');

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  configuredUrls: Array.isArray(config.priorityPaths) ? config.priorityPaths.length : 0,
  endpoint: config.indexNowEndpoint,
  keyFile: config.indexNowKeyFile,
  trigger: 'successful non-PR P0 live completion gate or explicit manual dispatch',
  boundary: 'Recrawl requests are submitted only after exact live release verification. The workflow has no Cloudflare, D1, member, forum, payment or administrator mutation authority.',
  issues
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'p0-indexnow-recrawl-contract-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (issues.length) {
  console.error('P0 INDEXNOW RECRAWL CONTRACT FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`P0 INDEXNOW RECRAWL CONTRACT PASSED: ${report.configuredUrls} canonical URLs, exact-live gate, public key proof and no privileged mutation authority.`);
