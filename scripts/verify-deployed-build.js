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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(url) {
  const response = await fetch(url, { redirect: 'follow', cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'MatrixReprogrammedDeploymentProof/2.4' } });
  const text = await response.text();
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes('application/json') || /^\s*</.test(text)) throw new Error('HTML returned instead of JSON');
  return { response, body: JSON.parse(text) };
}

async function getJsonUntil(makeUrl, predicate, attempts = 6, delayMs = 5000) {
  let last = null;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      last = await getJson(makeUrl(attempt));
      if (predicate(last.body)) return { ...last, attempts: attempt, matched: true };
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await wait(delayMs);
  }
  if (last) return { ...last, attempts, matched: false };
  throw lastError || new Error('No valid JSON response received');
}

function membershipPersistenceConfigured(body = {}) {
  return body.ok === true && body.configured === true && body.d1Connected === true && body.d1SchemaReady === true && Number.isFinite(Number(body.d1MemberCount));
}

function membershipAuthReady(body = {}) {
  return body.ok === true && body.d1Connected === true && body.authSchemaReady === true && body.provider === 'brevo' && body.endpoints && body.endpoints.verify === '/api/auth/verify' && body.endpoints.me === '/api/member/me';
}

async function main() {
  if (!expectedSha) throw new Error('EXPECTED_BUILD_SHA or GITHUB_SHA is required');

  const hostResults = [];
  for (const host of hosts) {
    const result = { host, deployStatus: null, forumHealth: null, membershipHealth: null, authHealth: null, errors: [] };
    try {
      const proof = await getJsonUntil(
        attempt => `https://${host}/deploy-status.json?proof=${Date.now()}-${attempt}`,
        body => String(body.buildSha || '') === expectedSha,
        8,
        5000
      );
      const { response, body } = proof;
      result.deployStatus = { status: response.status, finalUrl: response.url, body, attempts: proof.attempts, matched: proof.matched };
      const liveSha = String(body.buildSha || '');
      add(`${host} serves expected build SHA`, liveSha === expectedSha, { expectedSha, liveSha, finalUrl: response.url, attempts: proof.attempts });
    } catch (error) {
      result.errors.push(`deploy-status: ${error.message}`);
      add(`${host} deploy-status reachable`, false, error.message);
    }

    try {
      const proof = await getJsonUntil(
        attempt => `https://${host}/forum-health?proof=${Date.now()}-${attempt}`,
        body => body.ok === true && body.backend === 'src/worker.js' && Boolean(body.assetBinding) && body.bindingHealthy === true && body.forumPostsBinding === 'connected',
        4,
        3000
      );
      const { response, body } = proof;
      result.forumHealth = { status: response.status, finalUrl: response.url, body, attempts: proof.attempts, matched: proof.matched };
      add(`${host} Worker health active`, body.ok === true && body.backend === 'src/worker.js' && Boolean(body.assetBinding), { ...body, attempts: proof.attempts });
      add(`${host} forum KV connected`, body.bindingHealthy === true && body.forumPostsBinding === 'connected', { ...body, attempts: proof.attempts });
    } catch (error) {
      result.errors.push(`forum-health: ${error.message}`);
      add(`${host} forum health reachable`, false, error.message);
    }

    try {
      const proof = await getJsonUntil(
        attempt => `https://${host}/api/membership/health?proof=${Date.now()}-${attempt}`,
        membershipPersistenceConfigured,
        6,
        4000
      );
      const { response, body } = proof;
      result.membershipHealth = { status: response.status, finalUrl: response.url, body, attempts: proof.attempts, matched: proof.matched };
      add(`${host} membership D1 schema ready`, membershipPersistenceConfigured(body), { ...body, attempts: proof.attempts });
    } catch (error) {
      result.errors.push(`membership-health: ${error.message}`);
      add(`${host} membership health reachable`, false, error.message);
    }

    try {
      const proof = await getJsonUntil(
        attempt => `https://${host}/api/auth/health?proof=${Date.now()}-${attempt}`,
        membershipAuthReady,
        6,
        4000
      );
      const { response, body } = proof;
      result.authHealth = { status: response.status, finalUrl: response.url, body, attempts: proof.attempts, matched: proof.matched };
      add(`${host} passwordless auth backend ready`, membershipAuthReady(body), { ...body, attempts: proof.attempts });
      add(`${host} transactional email configured`, body.transactionalEmailConfigured === true, { provider: body.provider, configured: body.transactionalEmailConfigured }, 'advisory');
    } catch (error) {
      result.errors.push(`auth-health: ${error.message}`);
      add(`${host} auth health reachable`, false, error.message);
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
    propagationPolicy: { deployStatusAttempts: 8, deployStatusDelayMs: 5000, healthAttempts: 6, healthDelayMs: 4000 },
    boundary: 'Production is confirmed only when both public hosts serve the expected build SHA, forum KV is connected, MEMBERS_DB can query the membership schema, and the passwordless authentication routes can query magic-link and session tables. Transactional email configuration remains advisory until its secret and sender are installed.'
  };

  fs.writeFileSync(path.join(outDir, 'deployment-proof.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'deployment-proof.md'), [
    '# Production Deployment Proof',
    '',
    `Checked: ${report.checkedAt}`,
    `Expected SHA: ${expectedSha}`,
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    ...checks.map(check => `- ${check.ok ? 'PASS' : check.severity === 'advisory' ? 'ADVISORY' : 'FAIL'}: ${check.name}`)
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
