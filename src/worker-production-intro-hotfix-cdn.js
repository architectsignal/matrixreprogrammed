import introWorker from './worker-production-intro-hotfix.js';

const VERSION = '20260725-video-v6';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/architectsignal/matrixreprogrammed@1bdd748d4968ab9b260e6cbc928fb2286139f261/assets';

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'access-control-allow-origin': '*',
      'x-matrix-intro-version': VERSION,
      'x-matrix-intro-source': 'jsdelivr-cdn'
    }
  });
}

async function servePart(part) {
  const response = await fetch(`${CDN_BASE}/matrix-intro-video-${part}.txt`, {
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!response.ok) {
    return textResponse(`intro video part ${part} unavailable`, response.status);
  }
  const body = (await response.text()).trim();
  if (body.length < 1000) {
    return textResponse(`intro video part ${part} incomplete`, 502);
  }
  return textResponse(body);
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/_matrix-intro-part/1') return servePart(1);
    if (path === '/_matrix-intro-part/2') return servePart(2);
    return introWorker.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof introWorker.scheduled === 'function') {
      return introWorker.scheduled(event, env, ctx);
    }
  }
};
