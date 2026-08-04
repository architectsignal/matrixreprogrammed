import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, 'data', 'p0-recrawl-priority-urls.json');
const reportPath = path.join(root, 'downloads', 'p0-indexnow-recrawl.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const siteUrl = String(process.env.SITE_URL || config.siteUrl || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const expectedSha = String(process.env.EXPECTED_LIVE_SHA || '').trim().toLowerCase();
const endpoint = String(config.indexNowEndpoint || 'https://api.indexnow.org/indexnow');
const key = String(config.indexNowKey || '');
const keyFile = String(config.indexNowKeyFile || '');
const maximumBatchSize = Math.min(10000, Math.max(1, Number(config.maximumBatchSize || 10000)));
const attempts = Math.max(1, Number(process.env.INDEXNOW_ATTEMPTS || 4));
const delayMs = Math.max(0, Number(process.env.INDEXNOW_DELAY_MS || 3000));

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const forbiddenResidue = [
  'compatibility-marker-vault',
  'public-copy-internal-vault',
  'compatibility-routes-preserved-with-clean-public-copy',
  'preservedaftervisiblede-duplication',
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  ' reader field='
];

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function fetchLive(route, options = {}) {
  const separator = route.includes('?') ? '&' : '?';
  const response = await fetch(`${siteUrl}${route}${separator}p0_recrawl=${Date.now()}-${Math.random().toString(36).slice(2)}`, {
    cache: 'no-store',
    redirect: 'follow',
    ...options,
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'MatrixP0IndexNow/1.0',
      ...(options.headers || {})
    }
  });
  return {
    status: response.status,
    ok: response.ok,
    url: response.url,
    text: await response.text()
  };
}

function validateConfiguration() {
  const errors = [];
  if (!/^https:\/\/matrixreprogrammed\.com$/i.test(siteUrl)) errors.push(`Unexpected site URL: ${siteUrl}`);
  if (endpoint !== 'https://api.indexnow.org/indexnow') errors.push(`Unexpected IndexNow endpoint: ${endpoint}`);
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) errors.push('IndexNow key has an invalid format');
  if (keyFile !== `${key}.txt`) errors.push('IndexNow key filename must equal the public key plus .txt');
  const localKeyPath = path.join(root, keyFile);
  if (!fs.existsSync(localKeyPath) || fs.readFileSync(localKeyPath, 'utf8').trim() !== key) errors.push('Public IndexNow key file is missing or does not match');
  if (!Array.isArray(config.priorityPaths) || config.priorityPaths.length === 0) errors.push('No priority URLs configured');
  if (config.priorityPaths.length > maximumBatchSize) errors.push(`Priority URL count exceeds ${maximumBatchSize}`);
  const unique = new Set(config.priorityPaths);
  if (unique.size !== config.priorityPaths.length) errors.push('Priority URL list contains duplicates');
  for (const item of config.priorityPaths || []) {
    const route = String(item || '');
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('://') || route.includes('?') || route.includes('#')) {
      errors.push(`Invalid priority route: ${route}`);
    }
  }
  return errors;
}

async function verifyLiveRelease() {
  const failures = [];
  const manifestResponse = await fetchLive('/deploy-manifest.json');
  const healthResponse = await fetchLive('/deploy-health.json');
  const keyResponse = await fetchLive(`/${keyFile}`);
  const manifest = parseJson(manifestResponse.text);
  const health = parseJson(healthResponse.text);
  const liveSha = String(manifest?.commitSha || '').toLowerCase();

  if (!manifestResponse.ok || !/^[a-f0-9]{40}$/.test(liveSha)) failures.push('Live deploy manifest is missing a full commit SHA');
  if (!healthResponse.ok || health?.ok !== true || health?.buildSha !== liveSha || health?.manifestSha !== liveSha || health?.manifestMatches !== true) {
    failures.push('Live health does not agree with the commit-bound deploy manifest');
  }
  if (expectedSha && liveSha !== expectedSha) failures.push(`Live SHA ${liveSha || 'missing'} does not match expected ${expectedSha}`);
  if (!keyResponse.ok || keyResponse.text.trim() !== key) failures.push('Public IndexNow ownership key is not live');

  const urls = [];
  const routeChecks = [];
  for (const configuredPath of config.priorityPaths) {
    const route = String(configuredPath);
    const response = await fetchLive(route);
    const residue = forbiddenResidue.filter(token => response.text.includes(token));
    const ok = response.ok && residue.length === 0;
    if (!ok) failures.push(`${route} is not recrawl-ready: HTTP ${response.status}; residue ${residue.join(', ') || 'none'}`);
    urls.push(new URL(route, `${siteUrl}/`).href);
    routeChecks.push({ route, status: response.status, ok, residue });
  }

  return {
    ok: failures.length === 0,
    liveSha,
    manifest: { status: manifestResponse.status, payload: manifest },
    health: { status: healthResponse.status, payload: health },
    key: { route: `/${keyFile}`, status: keyResponse.status, ok: keyResponse.ok && keyResponse.text.trim() === key },
    urls,
    routeChecks,
    failures
  };
}

async function submitIndexNow(urls) {
  const payload = {
    host: new URL(siteUrl).host,
    key,
    keyLocation: `${siteUrl}/${keyFile}`,
    urlList: urls
  };
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'user-agent': 'MatrixP0IndexNow/1.0'
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      last = {
        attempt,
        status: response.status,
        accepted: response.status === 200 || response.status === 202,
        response: text.slice(0, 1000)
      };
      if (last.accepted) return { payload, result: last };
      if (![429, 500, 502, 503, 504].includes(response.status)) return { payload, result: last };
    } catch (error) {
      last = { attempt, status: 0, accepted: false, response: String(error?.message || error) };
    }
    if (attempt < attempts) await sleep(delayMs * attempt);
  }
  return { payload, result: last };
}

const configurationErrors = validateConfiguration();
if (configurationErrors.length) {
  const report = { ok: false, generatedAt: new Date().toISOString(), siteUrl, expectedSha: expectedSha || null, configurationErrors };
  writeReport(report);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

let verification;
try {
  verification = await verifyLiveRelease();
} catch (error) {
  verification = { ok: false, failures: [String(error?.stack || error?.message || error)] };
}
if (!verification.ok) {
  const report = { ok: false, generatedAt: new Date().toISOString(), siteUrl, expectedSha: expectedSha || null, verification };
  writeReport(report);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

const submission = await submitIndexNow(verification.urls);
const report = {
  ok: submission.result?.accepted === true,
  generatedAt: new Date().toISOString(),
  siteUrl,
  expectedSha: expectedSha || null,
  liveSha: verification.liveSha,
  verifiedUrlCount: verification.urls.length,
  verification,
  submission: {
    endpoint,
    keyLocation: submission.payload.keyLocation,
    urlCount: submission.payload.urlList.length,
    result: submission.result
  },
  boundary: 'The request asks participating search engines to revisit already-public canonical pages. HTTP acceptance confirms receipt only; it does not guarantee crawling, indexing or ranking.'
};
writeReport(report);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`P0 INDEXNOW RECRAWL ACCEPTED: ${report.verifiedUrlCount} clean canonical URLs submitted for live SHA ${verification.liveSha.slice(0, 12)}.`);
