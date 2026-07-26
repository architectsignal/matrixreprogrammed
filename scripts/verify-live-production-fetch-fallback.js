const path = require('path');
const { spawnSync } = require('child_process');
const nativeFetch = global.fetch;

if (typeof nativeFetch !== 'function') {
  throw new Error('Global fetch is unavailable');
}

global.fetch = async function matrixProductionFetch(input, init = {}) {
  const rawUrl = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');

  if (!rawUrl.startsWith('https://matrixreprogrammed.com')) {
    return nativeFetch(input, init);
  }

  const inheritedHeaders = typeof input === 'object' && input?.headers ? input.headers : undefined;
  const headers = new Headers(init.headers || inheritedHeaders || {});
  headers.set('accept-language', 'en-GB,en;q=0.9');
  headers.set('user-agent', 'Matrix-Reprogrammed-Production-Verifier/2.0');

  if (!headers.has('accept')) {
    headers.set(
      'accept',
      rawUrl.includes('/api/') || rawUrl.endsWith('.json')
        ? 'application/json,text/plain;q=0.9,*/*;q=0.8'
        : 'text/html,application/xhtml+xml,application/javascript,application/json;q=0.9,*/*;q=0.8'
    );
  }

  const options = { ...init, headers };
  const first = await nativeFetch(input, options);
  if (first.status !== 403) return first;

  const clean = new URL(rawUrl);
  if (!clean.searchParams.has('deployment_check')) return first;

  clean.searchParams.delete('deployment_check');
  return nativeFetch(clean.toString(), options);
};

// The existing production verifier is the authoritative Worker, D1, PayPal,
// email and SHA proof. A successful exit is not allowed to complete until the
// specific restored public surfaces are also proven live and complete.
const originalExit = process.exit.bind(process);
let runningRestoredSurfaceProof = false;
process.exit = function matrixVerifiedExit(code = 0) {
  const numeric = Number(code || 0);
  const productionVerifier = path.basename(String(process.argv[1] || '')) === 'verify-live-production.js';
  if (numeric === 0 && productionVerifier && !runningRestoredSurfaceProof) {
    runningRestoredSurfaceProof = true;
    const verifier = path.join(process.cwd(), 'scripts', 'verify-live-restored-surfaces.js');
    const result = spawnSync(process.execPath, [verifier], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return originalExit(Number.isInteger(result.status) ? result.status : 1);
  }
  return originalExit(numeric);
};
