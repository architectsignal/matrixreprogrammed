const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const expectedSha = String(process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '');
const attempts = Number(process.env.COMPACT_BOUNDARY_VERIFY_ATTEMPTS || 3);
const delayMs = Number(process.env.COMPACT_BOUNDARY_VERIFY_DELAY_MS || 30000);
const timeoutMs = Number(process.env.COMPACT_BOUNDARY_VERIFY_TIMEOUT_MS || 15000);
const reportPath = path.join(root, 'downloads', 'live-protected-boundaries-compact.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parse(text) { try { return JSON.parse(text); } catch { return null; } }
function headers(route, extra = {}) {
  return {
    accept: route.includes('/api/') || route.endsWith('.json') ? 'application/json,text/plain;q=0.9,*/*;q=0.8' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-GB,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    ...extra
  };
}
async function request(route, init = {}) {
  const options = { redirect: 'follow', ...init, headers: headers(route, init.headers || {}) };
  if (typeof AbortSignal?.timeout === 'function' && !options.signal) options.signal = AbortSignal.timeout(timeoutMs);
  const response = await fetch(`${siteUrl}${route}`, options);
  return { route, status: response.status, ok: response.ok, text: await response.text(), headers: Object.fromEntries(response.headers.entries()) };
}

async function verifyOnce() {
  const failures = [];
  const [manifestResponse, healthResponse, paypalConfig, paypalIntent, paypalCreate, emailHealth, forumHealth, forumFeed] = await Promise.all([
    request('/deploy-manifest.json'),
    request('/deploy-health.json'),
    request('/api/paypal/config'),
    request('/api/paypal/checkout-intent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' }) }),
    request('/api/paypal/subscription/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' }) }),
    request('/api/email/admin/health'),
    request('/forum-health'),
    request('/forum-feed-main')
  ]);

  const manifest = parse(manifestResponse.text);
  const health = parse(healthResponse.text);
  if (!manifestResponse.ok || manifest?.commitSha !== expectedSha) failures.push({ route: manifestResponse.route, status: manifestResponse.status, reason: 'manifest SHA mismatch' });
  if (!healthResponse.ok || health?.ok !== true || health?.buildSha !== expectedSha || health?.manifestSha !== expectedSha || health?.workerScript !== 'src/worker-production.js') failures.push({ route: healthResponse.route, status: healthResponse.status, reason: 'health SHA or strict Worker mismatch' });

  for (const response of [paypalConfig, paypalIntent, paypalCreate]) {
    const data = parse(response.text);
    if (response.status !== 401 || response.headers['x-matrix-origin'] !== 'cloudflare-worker-paypal-subscriptions' || data?.ok !== false || data?.authenticated !== false) failures.push({ route: response.route, status: response.status, reason: 'anonymous PayPal boundary not fail-closed' });
  }

  const wranglerLog = fs.existsSync(path.join(root, 'downloads', 'wrangler-deploy.log')) ? fs.readFileSync(path.join(root, 'downloads', 'wrangler-deploy.log'), 'utf8') : '';
  const wranglerConfig = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  if (!/env\.EMAIL_AUTOMATION_ENABLED \("true"\)/.test(wranglerLog) || /env\.EMAIL_AUTOMATION_ENABLED \("false"\)/.test(wranglerLog)) failures.push({ route: 'wrangler-deploy.log', status: 0, reason: 'email automation was not deployed enabled' });
  if (!wranglerConfig.includes('5 6 * * *') || !wranglerConfig.includes('15 7 * * 1')) failures.push({ route: 'wrangler.toml', status: 0, reason: 'daily or weekly email schedule missing' });
  if (![401, 403, 404].includes(emailHealth.status)) failures.push({ route: emailHealth.route, status: emailHealth.status, reason: 'email admin health is not protected' });

  const forumHealthData = parse(forumHealth.text);
  const forumFeedData = parse(forumFeed.text);
  const storedPostCount = Number(forumHealthData?.storedPostCount);
  const healthReady = forumHealth.ok
    && forumHealth.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && forumHealthData?.backend === 'src/worker-forum-persistence.js'
    && forumHealthData?.persistent === true
    && forumHealthData?.d1Connected === true
    && String(forumHealthData?.authoritativeStorage || '').includes('D1')
    && Number.isFinite(storedPostCount);
  if (!healthReady) failures.push({ route: forumHealth.route, status: forumHealth.status, reason: 'authoritative D1 forum health failed' });

  const feedReady = forumFeed.ok
    && forumFeed.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && forumFeedData?.ok === true
    && forumFeedData?.persistent === true
    && String(forumFeedData?.authoritativeStorage || '').includes('D1')
    && forumFeedData?.board === 'main'
    && Array.isArray(forumFeedData?.posts);
  if (!feedReady) failures.push({ route: forumFeed.route, status: forumFeed.status, reason: 'authoritative D1 forum read failed' });

  let anonymousWrite = null;
  let afterHealth = null;
  if (healthReady && feedReady) {
    anonymousWrite = await request('/submit-main-post', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: `Authentication boundary check ${expectedSha.slice(0, 12)}`,
        message: 'This anonymous compact verifier request must be rejected before any forum write occurs.',
        category: 'health check',
        name: 'Matrix System Check'
      })
    });
    const submission = parse(anonymousWrite.text);
    const rejected = anonymousWrite.status === 401
      && anonymousWrite.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
      && submission?.ok === false
      && submission?.authenticated === false
      && submission?.saved === false
      && submission?.persistent === true;
    if (!rejected) failures.push({ route: anonymousWrite.route, status: anonymousWrite.status, reason: 'anonymous forum write was not rejected' });
    afterHealth = await request('/forum-health');
    const afterData = parse(afterHealth.text);
    if (!afterHealth.ok || Number(afterData?.storedPostCount) !== storedPostCount) failures.push({ route: afterHealth.route, status: afterHealth.status, reason: 'anonymous verifier changed D1 forum count' });
  }

  const responses = [manifestResponse, healthResponse, paypalConfig, paypalIntent, paypalCreate, emailHealth, forumHealth, forumFeed, anonymousWrite, afterHealth].filter(Boolean);
  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    expectedSha,
    storedPostCount: Number.isFinite(storedPostCount) ? storedPostCount : null,
    anonymousChargePossible: false,
    anonymousForumWriteRejected: failures.every(item => item.route !== '/submit-main-post'),
    statuses: Object.fromEntries(responses.map(item => [item.route, item.status])),
    cfRays: responses.map(item => item.headers['cf-ray']).filter(Boolean),
    failures
  };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); }
    catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), expectedSha, error: error.stack || error.message, failures: [] }; }
    result.attempt = attempt;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    if (result.ok) {
      console.log(`Compact protected-boundary proof passed at ${expectedSha.slice(0, 12)}: PayPal anonymous access denied, email automation enabled/protected and D1 forum read/write boundary verified.`);
      process.exit(0);
    }
    console.log(`Compact protected-boundary proof not synchronized (${attempt}/${attempts}); ${result.failures?.length ?? 'unknown'} check(s) failing.`);
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
