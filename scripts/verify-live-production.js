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
  '/': 'FOLLOW THE FILES',
  '/start-here': 'Open Dark Web Safety',
  '/live-intel': 'LIVE INTEL',
  '/daily-power-conclusions': '<!-- conclusion-integrity:start -->',
  '/daily-investigation-conclusions': '<!-- conclusion-integrity:start -->',
  '/security-privacy': 'SECURITY',
  '/dark-web-safety': 'DARK WEB SAFETY',
  '/geographic-power-atlas': 'GEOGRAPHIC POWER ATLAS',
  '/data-lab': 'PUBLIC DATA',
  '/evidence-archive': 'EVIDENCE ARCHIVE'
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
      'user-agent': 'MatrixProductionVerifier/1.0',
      ...(options.headers || {})
    }
  });
  return { status: response.status, ok: response.ok, text: await response.text(), headers: Object.fromEntries(response.headers.entries()) };
}
function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
async function currentMainSha() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'MatrixProductionVerifier/1.0' };
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
    && before.data?.persistent === true
    && before.data?.d1Connected === true
    && String(before.data?.authoritativeStorage || '').includes('D1')
    && Number.isFinite(beforeCount);
  if (!healthReady) return { ok: false, stage: 'health-before', beforeStatus: before.response.status, before: before.data };

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
    && submission?.saved === true
    && submission?.persistent === true
    && String(submission?.storage || '').includes('D1')
    && Boolean(submission?.post?.id);
  if (!writeOk) return { ok: false, stage: 'write', beforeCount, submitStatus: submitted.status, submission };

  let after = null;
  for (let check = 1; check <= 5; check++) {
    after = await forumHealth();
    const afterCount = Number(after.data?.storedPostCount);
    if (after.response.ok && Number.isFinite(afterCount) && afterCount >= beforeCount + 1) {
      return {
        ok: true,
        stage: 'd1-write-read',
        beforeCount,
        afterCount,
        postId: submission.post.id,
        storage: submission.storage,
        publicFeedVisibility: 'hidden synthetic health check'
      };
    }
    await sleep(500);
  }
  return { ok: false, stage: 'read-after-write', beforeCount, postId: submission.post.id, afterStatus: after?.response?.status, after: after?.data };
}
async function verifyOnce() {
  const mainSha = await currentMainSha();
  const manifestResponse = await fetchText('/deploy-manifest.json');
  const manifest = parseJson(manifestResponse.text);
  const routeResults = [];
  for (const [route, marker] of Object.entries(routeMarkers)) {
    const response = await fetchText(route);
    routeResults.push({ route, status: response.status, marker, ok: response.ok && response.text.includes(marker) });
  }
  const payloads = {};
  for (const item of policy.datasets || []) {
    const response = await fetchText(`/${item.file}`);
    payloads[item.file] = parseJson(response.text);
  }
  const freshness = freshnessChecks(payloads);
  const manifestMatches = Boolean(manifest && manifest.commitSha === expectedSha && manifest.commitSha === mainSha);
  const coreOk = manifestResponse.ok && manifestMatches && routeResults.every(item => item.ok) && freshness.every(item => item.ok);
  const forumPersistence = coreOk ? await verifyForumPersistence() : { ok: false, skipped: true, reason: 'core production synchronization not proven yet' };
  const ok = coreOk && forumPersistence.ok;
  return { ok, checkedAt: new Date().toISOString(), expectedSha, mainSha, manifest, manifestStatus: manifestResponse.status, manifestMatches, routeResults, freshness, forumPersistence };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); } catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), expectedSha, error: error.message }; }
    result.attempt = attempt;
    fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
    fs.writeFileSync(path.join(root, 'downloads', 'live-production-verification.json'), JSON.stringify(result, null, 2));
    if (result.ok) {
      console.log(`Live production and D1 forum persistence verified at ${expectedSha.slice(0, 12)} on attempt ${attempt}.`);
      process.exit(0);
    }
    console.log(`Live production not synchronized yet (${attempt}/${attempts}).`);
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
