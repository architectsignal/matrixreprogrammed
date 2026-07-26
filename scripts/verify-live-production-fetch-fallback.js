const path = require('path');
const { spawnSync } = require('child_process');
const nativeFetch = global.fetch;

if (typeof nativeFetch !== 'function') {
  throw new Error('Global fetch is unavailable');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function browserHeaders(rawUrl, init = {}, inheritedHeaders) {
  const headers = new Headers(init.headers || inheritedHeaders || {});
  headers.set('accept-language', 'en-GB,en;q=0.9');
  headers.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
  headers.set('cache-control', 'no-cache');
  headers.set('pragma', 'no-cache');
  if (!headers.has('accept')) {
    headers.set(
      'accept',
      rawUrl.includes('/api/') || rawUrl.endsWith('.json') || rawUrl.includes('.json?')
        ? 'application/json,text/plain;q=0.9,*/*;q=0.8'
        : rawUrl.endsWith('.csv') || rawUrl.includes('.csv?')
          ? 'text/csv,text/plain;q=0.9,*/*;q=0.8'
          : 'text/html,application/xhtml+xml,application/javascript,application/json;q=0.9,image/avif,image/webp,*/*;q=0.8'
    );
  }
  if (!rawUrl.includes('/api/') && !/\.(?:json|csv|js|css|svg|png|jpe?g|webp|pdf)(?:\?|$)/i.test(rawUrl)) {
    headers.set('upgrade-insecure-requests', '1');
    headers.set('sec-fetch-dest', 'document');
    headers.set('sec-fetch-mode', 'navigate');
    headers.set('sec-fetch-site', 'none');
    headers.set('sec-fetch-user', '?1');
  }
  return headers;
}
function retryUrls(rawUrl) {
  const original = new URL(rawUrl);
  const candidates = [];
  const add = url => {
    const value = String(url);
    if (!candidates.includes(value)) candidates.push(value);
  };
  const clean = new URL(original);
  clean.searchParams.delete('deployment_check');
  clean.searchParams.delete('criminal_conduct_verify');
  clean.searchParams.delete('predators_in_power_verify');
  add(clean);
  const toggled = new URL(clean);
  if (!/\.[a-z0-9]{1,8}$/i.test(toggled.pathname) && toggled.pathname !== '/') {
    toggled.pathname = `${toggled.pathname.replace(/\/$/, '')}.html`;
    add(toggled);
  } else if (/\.html$/i.test(toggled.pathname)) {
    toggled.pathname = toggled.pathname.replace(/\.html$/i, '');
    add(toggled);
  }
  for (let index = 1; index <= 3; index++) {
    const cacheBust = new URL(clean);
    cacheBust.searchParams.set('verification_retry', `${Date.now()}-${index}`);
    add(cacheBust);
  }
  return candidates;
}

global.fetch = async function matrixProductionFetch(input, init = {}) {
  const rawUrl = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');

  if (!rawUrl.startsWith('https://matrixreprogrammed.com')) {
    return nativeFetch(input, init);
  }

  const inheritedHeaders = typeof input === 'object' && input?.headers ? input.headers : undefined;
  const method = String(init.method || (typeof input === 'object' ? input?.method : '') || 'GET').toUpperCase();
  const options = { ...init, headers: browserHeaders(rawUrl, init, inheritedHeaders) };
  const first = await nativeFetch(rawUrl, options);
  if (first.status !== 403 || !['GET', 'HEAD'].includes(method)) return first;

  let last = first;
  let attempt = 0;
  for (const url of retryUrls(rawUrl)) {
    attempt += 1;
    await sleep(Math.min(1000, 175 * attempt));
    const retryOptions = { ...options, headers: browserHeaders(url, options) };
    last = await nativeFetch(url, retryOptions);
    if (last.status !== 403) return last;
  }
  return last;
};

function runProof(script, maxBuffer = 1024 * 1024 * 30) {
  const verifier = path.join(process.cwd(), script);
  const result = spawnSync(process.execPath, [verifier], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return Number.isInteger(result.status) ? result.status : 1;
}

// The existing production verifier is the authoritative Worker, D1, PayPal,
// email and SHA proof. A successful exit is not allowed to complete until the
// restored public surfaces, Criminal Conduct & Allegations engine, dossier
// cross-links and Predators in Power page/exports are all proven live.
const originalExit = process.exit.bind(process);
let runningSupplementalProofs = false;
process.exit = function matrixVerifiedExit(code = 0) {
  const numeric = Number(code || 0);
  const productionVerifier = path.basename(String(process.argv[1] || '')) === 'verify-live-production.js';
  if (numeric === 0 && productionVerifier && !runningSupplementalProofs) {
    runningSupplementalProofs = true;
    const restoredStatus = runProof('scripts/verify-live-restored-surfaces.js');
    if (restoredStatus !== 0) return originalExit(restoredStatus);
    const criminalConductStatus = runProof('scripts/verify-live-criminal-conduct-engine.js', 1024 * 1024 * 50);
    if (criminalConductStatus !== 0) return originalExit(criminalConductStatus);
    const predatorsStatus = runProof('scripts/verify-live-predators-in-power.js', 1024 * 1024 * 40);
    return originalExit(predatorsStatus);
  }
  return originalExit(numeric);
};
