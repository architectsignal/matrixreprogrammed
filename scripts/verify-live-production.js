const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const expectedSha = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';
const repository = process.env.GITHUB_REPOSITORY || 'architectsignal/matrixreprogrammed';
const attempts = Number(process.env.LIVE_VERIFY_ATTEMPTS || 36);
const delayMs = Number(process.env.LIVE_VERIFY_DELAY_MS || 10000);
const policy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'production-freshness-policy.json'), 'utf8'));
const routeMarkers = {
  '/': 'MAP THE STRUCTURE. READ THE SIGNALS.',
  '/start-here': 'Open Dark Web Safety',
  '/membership': 'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.',
  '/billing-dashboard': 'billing-dashboard.js',
  '/admin-payment-dashboard': 'admin-payment-dashboard.js',
  '/live-intel': 'LIVE INTEL',
  '/daily-power-conclusions': 'DAILY POWER CONCLUSIONS',
  '/daily-investigation-conclusions': 'DAILY INVESTIGATION CONCLUSIONS.',
  '/security-privacy': 'SECURITY',
  '/dark-web-safety': 'DARK WEB SAFETY',
  '/geographic-power-atlas': 'GEOGRAPHIC POWER ATLAS',
  '/data-lab': 'PUBLIC DATA',
  '/evidence-archive': 'EVIDENCE ARCHIVE',
  '/search': 'SEARCH THE MACHINE',
  '/deploy-health.json': '"workerScript": "src/worker-production.js"'
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchText(route, options = {}) {
  const join = route.includes('?') ? '&' : '?';
  const response = await fetch(`${siteUrl}${route}${join}deployment_check=${Date.now()}`, {
    redirect: 'follow',
    ...options,
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'MatrixProductionVerifier/6.0',
      ...(options.headers || {})
    }
  });
  return { status: response.status, ok: response.ok, text: await response.text(), headers: Object.fromEntries(response.headers.entries()) };
}
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
async function currentMainSha() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'MatrixProductionVerifier/6.0' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, { headers });
  if (!response.ok) throw new Error(`GitHub main lookup failed: HTTP ${response.status}`);
  return (await response.json()).sha;
}
const getField = (object, field) => String(field).split('.').reduce((value, key) => value && value[key], object);
function freshnessChecks(payloads) {
  const results = [];
  for (const item of policy.datasets || []) {
    const data = payloads[item.file];
    if (!data) { results.push({ id: item.id, ok: false, error: 'not fetched' }); continue; }
    const raw = (item.timestampFields || []).map(field => getField(data, field)).find(Boolean);
    const ageHours = (Date.now() - Date.parse(raw || '')) / 3600000;
    results.push({ id: item.id, timestamp: raw, ageHours: Number(ageHours.toFixed(2)), maxAgeHours: item.maxAgeHours, ok: Number.isFinite(ageHours) && ageHours <= Number(item.maxAgeHours) });
  }
  return results;
}

async function forumHealth() {
  const response = await fetchText('/forum-health');
  return { response, data: parseJson(response.text) };
}
async function verifyForumPersistence() {
  const health = await forumHealth();
  const storedPostCount = Number(health.data?.storedPostCount);
  const healthReady = health.response.ok
    && health.response.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && health.data?.backend === 'src/worker-forum-persistence.js'
    && health.data?.persistent === true
    && health.data?.d1Connected === true
    && String(health.data?.authoritativeStorage || '').includes('D1')
    && Number.isFinite(storedPostCount);
  if (!healthReady) return { ok: false, stage: 'health', healthStatus: health.response.status, healthHeaders: health.response.headers, health: health.data };

  const feedResponse = await fetchText('/forum-feed-main');
  const feed = parseJson(feedResponse.text);
  const readOk = feedResponse.ok
    && feedResponse.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && feed?.ok === true
    && feed?.persistent === true
    && String(feed?.authoritativeStorage || '').includes('D1')
    && feed?.board === 'main'
    && Array.isArray(feed?.posts)
    && Number.isFinite(Number(feed?.count));
  if (!readOk) return { ok: false, stage: 'd1-read', storedPostCount, feedStatus: feedResponse.status, feedHeaders: feedResponse.headers, feed };

  const submitted = await fetchText('/submit-main-post', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: `Authentication boundary check ${expectedSha.slice(0, 12)}`,
      message: 'This anonymous verifier request must be rejected before any forum write occurs.',
      category: 'health check',
      name: 'Matrix System Check'
    })
  });
  const submission = parseJson(submitted.text);
  const authGateOk = submitted.status === 401
    && submitted.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && submission?.ok === false
    && submission?.authenticated === false
    && submission?.saved === false
    && submission?.persistent === true
    && String(submission?.error || '').includes('verified free member account');
  if (!authGateOk) return { ok: false, stage: 'verified-member-write-gate', storedPostCount, feedCount: Number(feed.count), submitStatus: submitted.status, submitHeaders: submitted.headers, submission };

  const after = await forumHealth();
  const afterCount = Number(after.data?.storedPostCount);
  const noAnonymousMutation = after.response.ok
    && after.response.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && Number.isFinite(afterCount)
    && afterCount === storedPostCount;
  return {
    ok: noAnonymousMutation,
    stage: noAnonymousMutation ? 'd1-read-and-verified-member-write-gate' : 'anonymous-mutation-detected',
    storedPostCount,
    afterCount,
    feedCount: Number(feed.count),
    postingAccess: 'verified-free-member-session',
    anonymousWriteStatus: submitted.status,
    anonymousWriteRejected: authGateOk,
    authoritativeStorage: feed.authoritativeStorage
  };
}

async function verifyPayPalBoundary() {
  const configResponse = await fetchText('/api/paypal/config');
  const config = parseJson(configResponse.text);
  const checkoutResponse = await fetchText('/api/paypal/checkout-intent', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' })
  });
  const checkout = parseJson(checkoutResponse.text);
  const createResponse = await fetchText('/api/paypal/subscription/create', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' })
  });
  const create = parseJson(createResponse.text);
  const configProtected = configResponse.status === 401
    && configResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
    && config?.ok === false && config?.authenticated === false;
  const checkoutProtected = checkoutResponse.status === 401
    && checkoutResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
    && checkout?.ok === false && checkout?.authenticated === false;
  const createProtected = createResponse.status === 401
    && createResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
    && create?.ok === false && create?.authenticated === false;
  return {
    ok: configProtected && checkoutProtected && createProtected,
    runtimeModel: 'authenticated-member-only server-created subscription; Cloudflare-managed credentials and switches; D1 activation gate',
    config: { status: configResponse.status, origin: configResponse.headers['x-matrix-origin'] || null, data: config },
    checkout: { status: checkoutResponse.status, origin: checkoutResponse.headers['x-matrix-origin'] || null, data: checkout },
    subscriptionCreate: { status: createResponse.status, origin: createResponse.headers['x-matrix-origin'] || null, data: create },
    anonymousChargePossible: false
  };
}

async function verifyEmailAutomationBoundary() {
  const deployLogPath = path.join(root, 'downloads', 'wrangler-deploy.log');
  const deployLog = fs.existsSync(deployLogPath) ? fs.readFileSync(deployLogPath, 'utf8') : '';
  const deployedFalse = /env\.EMAIL_AUTOMATION_ENABLED \("false"\)/.test(deployLog);
  const deployedTrue = /env\.EMAIL_AUTOMATION_ENABLED \("true"\)/.test(deployLog);
  const response = await fetchText('/api/email/admin/health');
  const data = parseJson(response.text);
  const adminHealthProtected = [401, 403, 404].includes(response.status);
  return {
    ok: deployedFalse && !deployedTrue && adminHealthProtected,
    deployedFalse,
    deployedTrue,
    deploymentLogPresent: Boolean(deployLog),
    adminHealth: { status: response.status, origin: response.headers['x-matrix-origin'] || null, data },
    requiredRuntimeValue: false
  };
}

async function verifyOnce() {
  const mainSha = await currentMainSha();
  const manifestResponse = await fetchText('/deploy-manifest.json');
  const manifest = parseJson(manifestResponse.text);
  const healthResponse = await fetchText('/deploy-health.json');
  const health = parseJson(healthResponse.text);
  const routeResults = [];
  for (const [route, marker] of Object.entries(routeMarkers)) {
    const response = await fetchText(route);
    routeResults.push({ route, status: response.status, marker, ok: response.ok && response.text.includes(marker), cacheControl: response.headers['cache-control'] || null });
  }
  const payloads = {};
  for (const item of policy.datasets || []) {
    const response = await fetchText(`/${item.file}`);
    payloads[item.file] = parseJson(response.text);
  }
  const freshness = freshnessChecks(payloads);
  const mainAdvancedDuringRun = Boolean(mainSha && mainSha !== expectedSha);
  const manifestSha = String(manifest?.commitSha || '');
  const manifestIsCommitBound = /^[a-f0-9]{40}$/i.test(manifestSha);
  const manifestMatchesExpected = Boolean(manifestIsCommitBound && manifestSha === expectedSha);
  const manifestMatchesCurrentMain = Boolean(manifestIsCommitBound && mainAdvancedDuringRun && manifestSha === mainSha);
  const manifestMatches = manifestMatchesExpected || manifestMatchesCurrentMain;
  const healthMatches = Boolean(
    healthResponse.ok
    && health?.ok === true
    && manifestIsCommitBound
    && health?.buildSha === manifestSha
    && health?.manifestSha === manifestSha
    && health?.manifestMatches === true
    && health?.workerScript === 'src/worker-production.js'
    && health?.paymentStatus === 'runtime-gated-dashboard-managed'
    && health?.checkoutDefault === 'runtime-d1-gated'
    && health?.runtimeConfigurationOwner === 'Cloudflare dashboard'
    && String(health?.paymentMessage || '').includes('three active plans')
  );
  const coreOk = manifestResponse.ok && manifestMatches && healthMatches && routeResults.every(item => item.ok) && freshness.every(item => item.ok);
  const paypalBoundary = coreOk ? await verifyPayPalBoundary() : { ok: false, skipped: true, reason: 'core production synchronization not proven yet' };
  const emailAutomationBoundary = coreOk ? await verifyEmailAutomationBoundary() : { ok: false, skipped: true, reason: 'core production synchronization not proven yet' };
  const forumPersistence = coreOk && paypalBoundary.ok ? await verifyForumPersistence() : { ok: false, skipped: true, reason: 'core or PayPal boundary not proven yet' };
  const ok = coreOk && paypalBoundary.ok && emailAutomationBoundary.ok && forumPersistence.ok;
  return { ok, checkedAt: new Date().toISOString(), expectedSha, mainSha, mainAdvancedDuringRun, manifestSha, manifestIsCommitBound, manifestMatchesExpected, manifestMatchesCurrentMain, manifest, manifestStatus: manifestResponse.status, manifestMatches, health, healthStatus: healthResponse.status, healthMatches, routeResults, freshness, paypalBoundary, emailAutomationBoundary, forumPersistence };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); }
    catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), expectedSha, error: error.message }; }
    result.attempt = attempt;
    fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
    fs.writeFileSync(path.join(root, 'downloads', 'live-production-verification.json'), JSON.stringify(result, null, 2));
    if (result.ok) {
      const advancement = result.mainAdvancedDuringRun ? `; main advanced to ${String(result.mainSha).slice(0, 12)} during verification` : '';
      console.log(`Live production, runtime-gated PayPal boundaries, Phase 1 email automation safety and authenticated D1 forum persistence verified at ${expectedSha.slice(0, 12)} on attempt ${attempt}${advancement}.`);
      process.exit(0);
    }
    console.log(`Live production not synchronized yet (${attempt}/${attempts}).`);
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
