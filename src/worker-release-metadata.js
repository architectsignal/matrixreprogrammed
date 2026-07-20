const routeAssets = new Map([
  ['/deploy-manifest.json', '/runtime/deploy-manifest-current.json'],
  ['/deploy-health.json', '/runtime/deploy-health-current.json']
]);

const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': 'cloudflare-worker-release-metadata'
};

export function isReleaseMetadataRoute(path = '') {
  return routeAssets.has(String(path || ''));
}

export async function serveReleaseMetadata(request, env, path = '') {
  const target = routeAssets.get(String(path || ''));
  if (!target) return null;
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Cloudflare release metadata assets are unavailable.',
      route: path,
      target
    }, null, 2), {
      status: 503,
      headers: { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const url = new URL(request.url);
  url.pathname = target;
  url.search = '';
  const assetRequest = new Request(url.toString(), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });
  const asset = await env.ASSETS.fetch(assetRequest);
  if (!asset.ok) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Current release metadata asset was not found.',
      route: path,
      target,
      assetStatus: asset.status
    }, null, 2), {
      status: 503,
      headers: { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const headers = new Headers(asset.headers);
  for (const [key, value] of Object.entries(responseHeaders)) headers.set(key, value);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Matrix-Release-Asset', target);
  return new Response(request.method === 'HEAD' ? null : asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers
  });
}
