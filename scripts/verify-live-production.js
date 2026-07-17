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
  '/admin-paypal-rehearsal': 'PAYPAL SANDBOX REHEARSAL.',
  '/live-intel': 'LIVE INTEL',
  '/daily-power-conclusions': '<!-- conclusion-integrity:start -->',
  '/daily-investigation-conclusions': '<!-- conclusion-integrity:start -->',
  '/security-privacy': 'SECURITY',
  '/dark-web-safety': 'DARK WEB SAFETY',
  '/geographic-power-atlas': 'GEOGRAPHIC POWER ATLAS',
  '/data-lab': 'PUBLIC DATA',
  '/evidence-archive': 'EVIDENCE ARCHIVE',
  '/search': 'SEARCH THE MACHINE',
  '/deploy-health': 'SANDBOX READY / CHECKOUT DISABLED'
};
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function fetchText(route, options = {}) {
  const join = route.includes('?') ? '&' : '?';
  const response = await fetch(`${siteUrl}${route}${join}deployment_check=${Date.now()}`, {
    redirect: 'follow',
    ...options,
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'MatrixProductionVerifier/5.3',
      ...(options.headers || {})
    }
  });
  return { status: response.status, ok: response.ok, text: await response.text(), headers: Object.fromEntries(response.headers.entries()) };
}
function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
async function currentMainSha() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'MatrixProductionVerifier/5.3' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, { headers });
  if (!response.ok) throw new Error(`GitHub main lookup failed: HTTP ${response.status}`);
  return (await response.json()).sha;
}
function getField(object, field) { return String(field).split('.').reduce((value, key) => value && value[key], object); }
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
  const before = await forumHealth();
  const beforeCount = Number(before.data?.storedPostCount);
  const healthReady = before.response.ok
    && before.response.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && before.data?.backend === 'src/worker-forum-persistence.js'
    && before.data?.persistent === true
    && before.data?.d1Connected === true
    && String(before.data?.authoritativeStorage || '').includes('D1')
    && Number.isFinite(beforeCount);
  if (!healthReady) return { ok: false, stage: 'health-before', beforeStatus: before.response.status, beforeHeaders: before.response.headers, before: before.data };

  const probeBody = {
    title: `Health check ${expectedSha.slice(0, 12)}`,
    message: 'Automated deployment persistence health check. Hidden from public feeds by the synthetic-record filter.',
    category: 'health check',
    name: 'Matrix System Check'
  };
  const submitted = await fetchText('/submit-main-post', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(probeBody)
  });
  const submission = parseJson(submitted.text);
  const writeOk = submitted.ok
    && submitted.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && submission?.saved === true
    && submission?.persistent === true
    && String(submission?.storage || '').includes('D1')
    && Boolean(submission?.post?.id);
  if (!writeOk) return { ok: false, stage: 'write', beforeCount, submitStatus: submitted.status, submitHeaders: submitted.headers, submission };

  let after = null;
  for (let check = 1; check <= 5; check++) {
    after = await forumHealth();
    const afterCount = Number(after.data?.storedPostCount);
    if (after.response.ok && after.response.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1' && Number.isFinite(afterCount) && afterCount >= beforeCount + 1) {
      return { ok: true, stage: 'd1-write-read', beforeCount, afterCount, postId: submission.post.id, storage: submission.storage, publicFeedVisibility: 'hidden synthetic health check' };
    }
    await sleep(500);
  }
  return { ok: false, stage: 'read-after-write', beforeCount, postId: submission.post.id, afterStatus: after?.response?.status, afterHeaders: after?.response?.headers, after: after?.data };
}
async function verifyPayPalBoundary() {
  const response = await fetchText('/api/paypal/config');
  const data = parseJson(response.text);
  return {
    ok: response.status === 401
      && response.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
      && data?.ok === false
      && data?.authenticated === false,
    status: response.status,
    origin: response.headers['x-matrix-origin'] || null,
    data
  };
}
async function verifyEmailAutomationBoundary() {
  const response = await fetchText('/api/email/admin/health');
  const data = parseJson(response.text);
  const unauthenticatedSafe = response.status === 401
    && data?.ok === false
    && data?.authenticated === false;
  const publicStatusResponse = await fetchText('/email-status.json');
  const publicStatus = parseJson(publicStatusResponse.text);
  const publicSafe = publicStatusResponse.status === 404
    || publicStatusResponse.status === 410
    || publicStatus?.automationEnabled === false
    || publicStatus?.emailAutomationEnabled === false;
  return {
    ok: unauthenticatedSafe && publicSafe,
    adminHealth: { status: response.status, origin: response.headers['x-matrix-origin'] || null, data },
    publicStatus: { status: publicStatusResponse.status, data: publicStatus },
    requiredRuntimeValue: false,
    boundary: 'Phase 1 requires automated email sending to remain disabled. The public endpoint must not claim automation is active and the administrator health route must remain protected.'
  };
}
async function verifyBootstrapBoundary() {
  const response = await fetchText('/api/paypal/bootstrap-health');
  const data = parseJson(response.text);
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const expected = { supporter: '3.00', intelligence: '6.00', research_pro: '9.00' };
  const pricesValid = Object.entries(expected).every(([tier, amount]) => {
    const row = prices.find(item => item.tier === tier);
    return row
      && String(row.amount) === amount
      && String(row.currency).toUpperCase() === 'EUR'
      && String(row.status).toUpperCase() === 'ACTIVE';
  });
  const originValid = response.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-sandbox-bootstrap';
  const ready = response.status === 200
    && originValid
    && data?.ok === true
    && data?.ready === true
    && data?.environment === 'sandbox'
    && data?.configured === true
    && data?.sandboxSwitchEnabled === true
    && data?.productionSwitchDisabled === true
    && data?.plansReady === true
    && Number(data?.planCount) === 3
    && pricesValid
    && data?.liveChargingEnabled === false;
  const safeDisabled = response.status === 503
    && originValid
    && data?.ok === false
    && data?.ready === false
    && data?.environment === 'sandbox'
    && data?.productionSwitchDisabled === true
    && data?.plansReady === false
    && data?.databaseCheckoutEnabled === false
    && data?.liveChargingEnabled === false;
  return {
    ok: ready || safeDisabled,
    ready,
    safeDisabled,
    mode: ready ? 'sandbox-ready' : safeDisabled ? 'sandbox-pending-disabled' : 'unsafe',
    status: response.status,
    origin: response.headers['x-matrix-origin'] || null,
    data
  };
}
async function verifyRehearsalBoundary() {
  const readinessResponse = await fetchText('/api/paypal/admin/rehearsal/readiness');
  const readiness = parseJson(readinessResponse.text);
  const checkoutResponse = await fetchText('/api/paypal/checkout-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tier: 'supporter' })
  });
  const checkout = parseJson(checkoutResponse.text);
  return {
    ok: readinessResponse.status === 401
      && readinessResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-sandbox-rehearsal'
      && readiness?.ok === false
      && readiness?.authenticated === false
      && checkoutResponse.status === 503
      && checkoutResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-sandbox-rehearsal'
      && checkout?.ok === false
      && checkout?.rehearsalRequired === true
      && checkout?.liveChargingEnabled === false,
    readiness: { status: readinessResponse.status, origin: readinessResponse.headers['x-matrix-origin'] || null, data: readiness },
    checkout: { status: checkoutResponse.status, origin: checkoutResponse.headers['x-matrix-origin'] || null, data: checkout }
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
  const manifestMatches = Boolean(manifest && manifest.commitSha === expectedSha);
  const mainAdvancedDuringRun = Boolean(mainSha && mainSha !== expectedSha);
  const healthMatches = Boolean(
    healthResponse.ok
    && health?.ok === true
    && health?.buildSha === expectedSha
    && health?.manifestSha === expectedSha
    && health?.manifestMatches === true
    && health?.workerScript === 'src/worker-production.js'
    && health?.paymentStatus === 'sandbox-ready-disabled'
    && health?.checkoutDefault === 'disabled'
    && String(health?.paymentMessage || '').includes('checkout remains disabled')
  );
  const coreOk = manifestResponse.ok && manifestMatches && healthMatches && routeResults.every(item => item.ok) && freshness.every(item => item.ok);
  const paypalBoundary = coreOk ? await verifyPayPalBoundary() : { ok: false, skipped: true, reason: 'core production synchronization not proven yet' };
  const emailAutomationBoundary = coreOk ? await verifyEmailAutomationBoundary() : { ok: false, skipped: true, reason: 'core production synchronization not proven yet' };
  const bootstrapBoundary = coreOk && paypalBoundary.ok ? await verifyBootstrapBoundary() : { ok: false, skipped: true, reason: 'core or PayPal boundary not proven yet' };
  const rehearsalBoundary = coreOk && paypalBoundary.ok && bootstrapBoundary.ready
    ? await verifyRehearsalBoundary()
    : bootstrapBoundary.safeDisabled
      ? { ok: true, skipped: true, safeDisabled: true, reason: 'sandbox bootstrap is pending; checkout and live charging remain disabled' }
      : { ok: false, skipped: true, reason: 'core, PayPal or safe bootstrap boundary not proven yet' };
  const forumPersistence = coreOk && paypalBoundary.ok
    ? await verifyForumPersistence()
    : { ok: false, skipped: true, reason: 'core or PayPal fail-closed boundary not proven yet' };
  const ok = coreOk && paypalBoundary.ok && emailAutomationBoundary.ok && bootstrapBoundary.ok && rehearsalBoundary.ok && forumPersistence.ok;
  return { ok, checkedAt: new Date().toISOString(), expectedSha, mainSha, mainAdvancedDuringRun, manifest, manifestStatus: manifestResponse.status, manifestMatches, health, healthStatus: healthResponse.status, healthMatches, routeResults, freshness, paypalBoundary, emailAutomationBoundary, bootstrapBoundary, rehearsalBoundary, forumPersistence };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); } catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), expectedSha, error: error.message }; }
    result.attempt = attempt;
    fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
    fs.writeFileSync(path.join(root, 'downloads', 'live-production-verification.json'), JSON.stringify(result, null, 2));
    if (result.ok) {
      const advancement = result.mainAdvancedDuringRun ? `; main advanced to ${String(result.mainSha).slice(0, 12)} during verification` : '';
      const paypalMode = result.bootstrapBoundary?.ready ? 'autonomous sandbox plans ready' : 'sandbox bootstrap pending with checkout disabled';
      console.log(`Live production, ${paypalMode}, PayPal fail-closed boundaries, Phase 1 email automation safety, and D1 forum persistence verified at ${expectedSha.slice(0, 12)} on attempt ${attempt}${advancement}.`);
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
