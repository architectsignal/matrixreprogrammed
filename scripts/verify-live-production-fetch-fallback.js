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
