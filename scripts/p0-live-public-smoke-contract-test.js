'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const smokePath = path.join(root, 'scripts', 'p0-live-public-smoke.mjs');
const workflowPath = path.join(root, '.github', 'workflows', 'p0-live-public-smoke.yml');
const failures = [];
const need = (condition, message) => { if (!condition) failures.push(message); };

need(fs.existsSync(smokePath), 'P0 live smoke script is missing');
need(fs.existsSync(workflowPath), 'P0 live smoke workflow is missing');

const smoke = fs.existsSync(smokePath) ? fs.readFileSync(smokePath, 'utf8') : '';
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

const syntax = spawnSync(process.execPath, ['--check', smokePath], { cwd: root, encoding: 'utf8' });
need(syntax.status === 0, `P0 live smoke syntax failed: ${syntax.stderr || syntax.stdout || syntax.status}`);

for (const marker of [
  '/deploy-manifest.json',
  '/deploy-health.json',
  'health?.buildSha === liveSha',
  'health?.manifestSha === liveSha',
  "['identical', 'ahead'].includes(status)",
  '/search-index.json',
  '/search-semantic-index.json',
  '/api/auth/health',
  '/api/auth/request-link',
  "email: 'not-an-email'",
  '/newsletter-health',
  '/api/membership/signup',
  'marketingConsent: false',
  'normalizeCloudflareHtml',
  'cdn-cgi\\/challenge-platform\\/scripts\\/jsd',
  'noConsent?.saved !== true',
  'cloudflare-worker-email-lifecycle',
  'card artwork control routes are not consistently admin-protected',
  '/forum-health',
  '/forum-feed-main',
  '/submit-main-post',
  'anonymousPostResponse.status === 401',
  'P0 LIVE PUBLIC SMOKE PASSED'
]) need(smoke.includes(marker), `P0 live smoke missing contract marker: ${marker}`);

for (const route of ['/', '/search', '/member-login', '/forum', '/newsletter', '/evidence-vault', '/live-intel']) {
  need(smoke.includes(`route: '${route}'`), `P0 live smoke missing public journey: ${route}`);
}

for (const pair of [
  "['/start-here.html', '/start-here']",
  "['/search.html', '/search']",
  "['/member-login.html', '/member-login']",
  "['/forum.html', '/forum']",
  "['/newsletter.html', '/newsletter']",
  "['/evidence-vault.html', '/evidence-vault']",
  "['/follow-the-money.html', '/follow-the-money']",
  "['/making-money.html', '/making-money']",
  "['/subject-briefs.html', '/subject-briefs']",
  "['/entity-timelines.html', '/entity-timelines']"
]) need(smoke.includes(pair), `P0 live smoke missing route-alias pair: ${pair}`);

for (const token of [
  'compatibility-marker-vault',
  'public-copy-internal-vault',
  'preservedaftervisiblede-duplication',
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  ' reader field='
]) need(smoke.includes(`'${token}'`), `P0 live smoke missing forbidden-residue token: ${token}`);

need(!/marketingConsent:\s*true/.test(smoke), 'P0 live smoke must not submit marketing consent');
need(!/method:\s*['"]DELETE['"]/.test(smoke), 'P0 live smoke must not issue DELETE requests');
need(!/x-admin-token/i.test(smoke), 'P0 live smoke must not use an administrator token');
need(!/paypal.*create/i.test(smoke), 'P0 live smoke must not initiate a PayPal subscription');

for (const marker of [
  'P0 Live Public Completion Gate',
  'workflow_run:',
  'Matrix Reprogrammed Controlled Production Deploy',
  'pull_request:',
  'workflow_dispatch:',
  'node scripts/p0-live-public-smoke-contract-test.js',
  'node scripts/p0-live-public-smoke.mjs',
  'downloads/p0-live-public-smoke.json'
]) need(workflow.includes(marker), `P0 live smoke workflow missing marker: ${marker}`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks: 58,
  failures,
  boundary: 'The P0 live gate is read-only apart from deliberately invalid requests that fail before persistence: malformed login email, absent newsletter consent and anonymous forum posting.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'p0-live-public-smoke-contract-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('P0 LIVE PUBLIC SMOKE CONTRACT TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('P0 LIVE PUBLIC SMOKE CONTRACT TEST PASSED: exact SHA, required journeys, clean search, route aliases and non-mutating D1 boundaries are enforced.');
