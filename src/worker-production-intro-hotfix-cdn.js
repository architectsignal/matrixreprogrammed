import introWorker from './worker-production-intro-hotfix.js';

const VERSION = '20260725-video-v6';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/architectsignal/matrixreprogrammed@1bdd748d4968ab9b260e6cbc928fb2286139f261/assets';
const RAW_BASE = 'https://raw.githubusercontent.com/architectsignal/matrixreprogrammed/1bdd748d4968ab9b260e6cbc928fb2286139f261/assets';

function textResponse(body, status = 200, source = 'unavailable') {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'access-control-allow-origin': '*',
      'x-matrix-intro-version': VERSION,
      'x-matrix-intro-source': source
    }
  });
}

function validBody(body) {
  const clean = String(body || '').trim();
  return clean.length >= 1000 ? clean : '';
}

async function loadFromCloudflareAssets(part, request, env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
  try {
    const assetUrl = new URL(`/assets/matrix-intro-video-${part}.txt`, request.url);
    assetUrl.search = '';
    const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), {
      method: 'GET',
      headers: { accept: 'text/plain,*/*;q=0.8' },
      redirect: 'follow'
    }));
    if (!response.ok) return null;
    const body = validBody(await response.text());
    return body ? { body, source: 'cloudflare-assets' } : null;
  } catch {
    return null;
  }
}

async function loadFromRemote(base, part, source) {
  try {
    const response = await fetch(`${base}/matrix-intro-video-${part}.txt`, {
      cf: { cacheTtl: 3600, cacheEverything: true },
      headers: { accept: 'text/plain,*/*;q=0.8' }
    });
    if (!response.ok) return null;
    const body = validBody(await response.text());
    return body ? { body, source } : null;
  } catch {
    return null;
  }
}

async function servePart(part, request, env) {
  const loaded = await loadFromCloudflareAssets(part, request, env)
    || await loadFromRemote(CDN_BASE, part, 'jsdelivr-cdn')
    || await loadFromRemote(RAW_BASE, part, 'github-raw-fallback');

  if (!loaded) return textResponse(`intro video part ${part} unavailable`, 502);
  return textResponse(loaded.body, 200, loaded.source);
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/_matrix-intro-part/1') return servePart(1, request, env);
    if (path === '/_matrix-intro-part/2') return servePart(2, request, env);
    return introWorker.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof introWorker.scheduled === 'function') {
      return introWorker.scheduled(event, env, ctx);
    }
  }
};
