const fs = require('fs');
const path = require('path');

const root = process.cwd();
const expected = String(process.env.EXPECTED_COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const attempts = Math.max(1, Number(process.env.DEPLOY_WAIT_ATTEMPTS || 72));
const delayMs = Math.max(1000, Number(process.env.DEPLOY_WAIT_DELAY_MS || 10000));
const adminToken = String(process.env.ADMIN_API_TOKEN || process.env.AI_MANAGEMENT_ADMIN_TOKEN || '').trim();
const reportFile = path.join(root, 'downloads', 'deep-audit-live-deploy-wait.json');

if (!/^[a-f0-9]{40}$/i.test(expected)) throw new Error('EXPECTED_COMMIT_SHA must be a full 40-character commit SHA');
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function requestHeaders() {
  const headers = {
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent': 'MatrixDeepAuditDeployWait/2.0'
  };
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
    headers.authorization = `Bearer ${adminToken}`;
  }
  return headers;
}
async function fetchJson(route) {
  const response = await fetch(`${siteUrl}${route}?deep_wait=${Date.now()}`, {
    redirect: 'follow',
    headers: requestHeaders()
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return {
    status: response.status,
    data,
    type: response.headers.get('content-type') || '',
    origin: response.headers.get('x-matrix-origin') || ''
  };
}

(async () => {
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  let proof = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const [manifestResponse, healthResponse] = await Promise.all([
        fetchJson('/deploy-manifest.json'),
        fetchJson('/deploy-health.json')
      ]);
      const manifestSha = String(manifestResponse.data?.commitSha || '');
      const healthBuildSha = String(healthResponse.data?.buildSha || '');
      const healthManifestSha = String(healthResponse.data?.manifestSha || '');
      const matched = manifestResponse.status === 200
        && healthResponse.status === 200
        && manifestSha === expected
        && healthBuildSha === expected
        && healthManifestSha === expected
        && healthResponse.data?.ok === true
        && healthResponse.data?.manifestMatches === true;
      proof = {
        ok: matched,
        checkedAt: new Date().toISOString(),
        attempt,
        attempts,
        expected,
        authenticated: Boolean(adminToken),
        manifestStatus: manifestResponse.status,
        healthStatus: healthResponse.status,
        manifestType: manifestResponse.type,
        healthType: healthResponse.type,
        manifestOrigin: manifestResponse.origin,
        healthOrigin: healthResponse.origin,
        manifestSha,
        healthBuildSha,
        healthManifestSha,
        healthOk: healthResponse.data?.ok === true,
        manifestMatches: healthResponse.data?.manifestMatches === true
      };
      fs.writeFileSync(reportFile, `${JSON.stringify(proof, null, 2)}\n`);
      if (matched) {
        console.log(`Live site synchronized to ${expected.slice(0, 12)} on attempt ${attempt}.`);
        return;
      }
    } catch (error) {
      proof = {
        ok: false,
        checkedAt: new Date().toISOString(),
        attempt,
        attempts,
        expected,
        authenticated: Boolean(adminToken),
        error: String(error?.message || error)
      };
      fs.writeFileSync(reportFile, `${JSON.stringify(proof, null, 2)}\n`);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(proof, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
