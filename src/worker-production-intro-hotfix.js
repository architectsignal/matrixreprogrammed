import productionWorker from './worker-production.js';

const VERSION = '20260725-video-v6';
const RAW_BASE = 'https://raw.githubusercontent.com/architectsignal/matrixreprogrammed/1bdd748d4968ab9b260e6cbc928fb2286139f261/assets';

const HOTFIX_CSS = `
html.matrix-intro-v6-active,html.matrix-intro-v6-active body{overflow:hidden!important;overscroll-behavior:none}
.matrix-intro-v6{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#000;color:#ead7a2;opacity:1;visibility:visible;transition:opacity .75s ease,visibility .75s ease;isolation:isolate}
.matrix-intro-v6::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at center,rgba(0,255,102,.09),transparent 42%),#000;pointer-events:none}
.matrix-intro-v6::after{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.014) 0,rgba(255,255,255,.014) 1px,transparent 1px,transparent 4px),radial-gradient(circle,transparent 36%,rgba(0,0,0,.72) 100%);opacity:.42;mix-blend-mode:screen}
.matrix-intro-v6.is-dissolving{opacity:0;visibility:hidden;pointer-events:none}
.matrix-intro-v6__stage{position:relative;z-index:2;width:100%;height:100%;display:grid;place-items:center;background:#000}
.matrix-intro-v6__video{width:100%;height:100%;object-fit:contain;background:#000;opacity:0;transition:opacity .45s ease}
.matrix-intro-v6.is-ready .matrix-intro-v6__video{opacity:1}
.matrix-intro-v6__controls{position:absolute;z-index:5;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:12px;flex-wrap:wrap;justify-content:center;width:min(92vw,720px)}
.matrix-intro-v6__button{min-height:48px;padding:12px 18px;border:1px solid rgba(234,215,162,.72);border-radius:999px;background:rgba(0,0,0,.72);color:#f4e7bd;font:800 13px/1.1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;box-shadow:0 0 22px rgba(234,215,162,.12)}
.matrix-intro-v6__button:hover,.matrix-intro-v6__button:focus-visible{background:rgba(234,215,162,.14);outline:none}
.matrix-intro-v6__status{position:absolute;z-index:5;top:max(22px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);margin:0;color:#d8c89e;font:700 12px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;text-align:center}
.matrix-intro-v6.has-error .matrix-intro-v6__status{color:#ffb7b7}
@media(max-width:560px){.matrix-intro-v6__controls{display:grid;grid-template-columns:1fr;width:min(88vw,420px)}.matrix-intro-v6__button{width:100%}}
@media(prefers-reduced-motion:reduce){.matrix-intro-v6,.matrix-intro-v6__video{transition:none}}
`;

const HOTFIX_JS = `(() => {
  'use strict';
  if (window.__MATRIX_INTRO_V6_ACTIVE__) return;
  window.__MATRIX_INTRO_V6_ACTIVE__ = true;

  const VERSION = '${VERSION}';
  const SESSION_KEY = 'matrix-homepage-intro-seen-v6';
  const params = new URLSearchParams(location.search);
  const forceReplay = params.get('intro') === '1';
  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const intro = document.querySelector('[data-homepage-intro-v6]');
  if (!intro) return;

  document.querySelectorAll('[data-homepage-mask-intro]').forEach(node => node.remove());

  let finished = false;
  let objectUrl = '';
  let timeoutId = 0;
  const video = intro.querySelector('[data-intro-video-v6]');
  const status = intro.querySelector('[data-intro-status-v6]');
  const enter = intro.querySelector('[data-intro-enter-v6]');
  const skip = intro.querySelector('[data-intro-skip-v6]');

  const hasSeen = () => {
    if (forceReplay) return false;
    try { return sessionStorage.getItem(SESSION_KEY) === 'true'; } catch { return false; }
  };
  const remember = () => { try { sessionStorage.setItem(SESSION_KEY, 'true'); } catch {} };
  const cleanup = () => {
    clearTimeout(timeoutId);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    document.documentElement.classList.remove('matrix-intro-v6-active');
    intro.remove();
    document.dispatchEvent(new CustomEvent('matrix:homepage-mask-intro-complete'));
  };
  const finish = (reason) => {
    if (finished) return;
    finished = true;
    if (reason === 'ended' || reason === 'skip' || reason === 'escape') remember();
    intro.dataset.finishReason = reason;
    intro.classList.add('is-dissolving');
    setTimeout(cleanup, reducedMotion ? 50 : 780);
  };
  const fail = (reason, error) => {
    if (finished) return;
    console.error('[Matrix intro v6]', reason, error || '');
    intro.dataset.error = reason;
    intro.classList.add('has-error');
    if (status) status.textContent = 'Opening sequence unavailable — entering Matrix Reprogrammed';
    setTimeout(() => finish(reason), 1000);
  };

  if (hasSeen()) { cleanup(); return; }
  document.documentElement.classList.add('matrix-intro-v6-active');

  const start = async (withSound = false) => {
    try {
      if (withSound) video.muted = false;
      await video.play();
      intro.classList.add('is-ready', 'is-playing');
      intro.classList.remove('needs-play');
      if (status) status.textContent = withSound ? 'Signal acquired' : 'Matrix Reprogrammed';
    } catch (error) {
      video.muted = true;
      intro.classList.add('is-ready', 'needs-play');
      if (status) status.textContent = 'Tap ENTER THE MATRIX to play';
      console.warn('[Matrix intro v6] playback requires interaction', error);
    }
  };

  const load = async () => {
    if (!(video instanceof HTMLVideoElement)) throw new Error('Video element missing');
    const urls = [
      '/_matrix-intro-part/1?v=' + VERSION,
      '/_matrix-intro-part/2?v=' + VERSION
    ];
    const parts = await Promise.all(urls.map(async url => {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Video part failed: ' + response.status);
      return (await response.text()).trim();
    }));
    const base64 = parts.join('').replace(/\\s+/g, '');
    if (base64.length < 1000) throw new Error('Video data incomplete');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') throw new Error('Video data is not MP4');
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.src = objectUrl;
    video.addEventListener('loadeddata', () => {
      intro.classList.add('is-ready');
      if (reducedMotion) {
        intro.classList.add('needs-play');
        if (status) status.textContent = 'Tap ENTER THE MATRIX to play';
      } else {
        start(false);
      }
    }, { once: true });
    video.addEventListener('ended', () => finish('ended'), { once: true });
    video.addEventListener('error', () => fail('video-error', video.error), { once: true });
    video.load();
  };

  enter?.addEventListener('click', () => start(true));
  skip?.addEventListener('click', () => finish('skip'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish('escape');
  }, { once: true });

  timeoutId = setTimeout(() => {
    if (!intro.classList.contains('is-ready')) fail('video-timeout');
  }, 15000);

  load().catch(error => fail('video-load-error', error));
})();`;

const OVERLAY = `<section class="matrix-intro-v6" data-homepage-intro-v6 data-intro-version="${VERSION}" aria-label="Matrix Reprogrammed cinematic opening"><div class="matrix-intro-v6__stage"><video class="matrix-intro-v6__video" muted autoplay playsinline preload="auto" data-intro-video-v6></video><p class="matrix-intro-v6__status" data-intro-status-v6>Loading Matrix Reprogrammed</p><div class="matrix-intro-v6__controls"><button class="matrix-intro-v6__button" type="button" data-intro-enter-v6>Enter the Matrix</button><button class="matrix-intro-v6__button" type="button" data-intro-skip-v6>Skip Intro</button></div></div></section>`;

function textResponse(body, contentType, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': `${contentType}; charset=utf-8`,
      'cache-control': 'no-store, max-age=0',
      'x-matrix-intro-version': VERSION
    }
  });
}

async function proxyVideoPart(part) {
  const source = `${RAW_BASE}/matrix-intro-video-${part}.txt`;
  const response = await fetch(source, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) return textResponse(`video part ${part} unavailable`, 'text/plain', response.status);
  const body = await response.text();
  return textResponse(body, 'text/plain');
}

async function transformHomepage(response) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store, max-age=0, must-revalidate');
  headers.set('x-matrix-intro-version', VERSION);
  const cleanResponse = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter()
    .on('head', { element(element) { element.append(`<link rel="stylesheet" href="/homepage-intro-hotfix-v6.css?v=${VERSION}" data-matrix-intro-v6-style>`, { html: true }); } })
    .on('body', { element(element) {
      element.prepend(OVERLAY, { html: true });
      element.append(`<script src="/homepage-intro-hotfix-v6.js?v=${VERSION}" data-matrix-intro-v6-runtime></script>`, { html: true });
    } })
    .transform(cleanResponse);
}

async function homepageAsset(request, env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
  const assetUrl = new URL('/index.html', request.url);
  const assetRequest = new Request(assetUrl.toString(), {
    method: 'GET',
    headers: request.headers,
    redirect: 'follow'
  });
  return env.ASSETS.fetch(assetRequest);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/homepage-intro-hotfix-v6.css') return textResponse(HOTFIX_CSS, 'text/css');
    if (url.pathname === '/homepage-intro-hotfix-v6.js') return textResponse(HOTFIX_JS, 'application/javascript');
    if (url.pathname === '/_matrix-intro-part/1') return proxyVideoPart(1);
    if (url.pathname === '/_matrix-intro-part/2') return proxyVideoPart(2);

    const isHomepage = request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html');
    if (isHomepage) {
      const response = await homepageAsset(request, env);
      if (response?.ok) return transformHomepage(response);
    }
    return productionWorker.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof productionWorker.scheduled === 'function') return productionWorker.scheduled(event, env, ctx);
  }
};
