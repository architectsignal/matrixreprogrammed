const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outDir = path.join(root, 'downloads');
fs.mkdirSync(outDir, { recursive: true });

const expectedSha = process.env.EXPECTED_BUILD_SHA || process.env.GITHUB_SHA || '';
const hosts = (process.env.DEPLOY_VERIFY_HOSTS || 'matrixreprogrammed.com,www.matrixreprogrammed.com').split(',').map(x => x.trim()).filter(Boolean);
const checks = [];

function add(name, ok, detail = null, severity = 'hard') {
  checks.push({ name, ok: Boolean(ok), detail, severity });
}

async function getJson(url) {
  const response = await fetch(url, { redirect: 'follow', cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'MatrixReprogrammedDeploymentProof/2.0' } });
  const text = await response.text();
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes('application/json') || /^\s*</.test(text)) throw new Error('HTML returned instead of JSON');
  return { response, body: JSON.parse(text) };
}

async function main() {
  if (!expectedSha) throw new Error('EXPECTED_BUILD_SHA or GITHUB_SHA is required');

  const hostResults = [];
  for (const host of hosts) {
    const result = { host, deployStatus: null, forumHealth: null, newsletterHealth: null, errors: [] };
    try {
      const { response, body } = await getJson(`https://${host}/deploy-status.json?proof=${Date.now()}`);
      result.deployStatus = { status: response.status, finalUrl: response.url, body };
      const liveSha = String(body.buildSha || '');
      add(`${host} serves expected build SHA`, liveSha === expectedSha, { expectedSha, liveSha, finalUrl: response.url });
    } catch (error) {
      result.errors.push(`deploy-status: ${error.message}`);
      add(`${host} deploy-status reachable`, false, error.message);
    }

    try {
      const { response, body } = await getJson(`https://${host}/forum-health?proof=${Date.now()}`);
      result.forumHealth = { status: response.status, finalUrl: response.url, body };
      add(`${host} Worker health active`, body.ok === true && body.backend === 'src/worker.js' && Boolean(body.assetBinding), body);
      add(`${host} forum KV connected`, body.bindingHealthy === true && body.forumPostsBinding === 'connected', body);
    } catch (error) {
      result.errors.push(`forum-health: ${error.message}`);
      add(`${host} forum health reachable`, false, error.message);
    }

    try {
      const { response, body } = await getJson(`https://${host}/newsletter-health?proof=${Date.now()}`);
      result.newsletterHealth = { status: response.status, finalUrl: response.url, body };
      add(`${host} newsletter persistence configured`, body.ok === true && body.configured === true && body.capturePersistent === true, body);
    } catch (error) {
      result.errors.push(`newsletter-health: ${error.message}`);
      add(`${host} newsletter health reachable`, false, error.message);
    }
    hostResults.push(result);
  }

  const hardFailures = checks.filter(check => check.severity === 'hard' && !check.ok);
  const report = {
    ok: hardFailures.length === 0,
    status: hardFailures.length ? 'failed' : 'passed',
    checkedAt: new Date().toISOString(),
    expectedSha,
    hosts,
    checks,
    hardFailures,
    hostResults,
    boundary: 'Production is confirmed only when both public hosts serve the expected build SHA through the Worker and report connected persistent KV services.'
  };

  fs.writeFileSync(path.join(outDir, 'deployment-proof.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'deployment-proof.md'), [
    '# Production Deployment Proof',
    '',
    `Checked: ${report.checkedAt}`,
    `Expected SHA: ${expectedSha}`,
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    ...checks.map(check => `- ${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`)
  ].join('\n'));

  if (!report.ok) {
    console.error('PRODUCTION DEPLOYMENT PROOF FAILED');
    hardFailures.forEach(check => console.error(`- ${check.name}`));
    process.exit(1);
  }
  console.log(`PRODUCTION DEPLOYMENT PROOF PASSED for ${expectedSha}`);
}

main().catch(error => {
  const report = { ok: false, status: 'failed', checkedAt: new Date().toISOString(), expectedSha, hosts, error: error.message };
  fs.writeFileSync(path.join(outDir, 'deployment-proof.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'deployment-proof.md'), `# Production Deployment Proof\n\nResult: FAIL\n\n${error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
});
