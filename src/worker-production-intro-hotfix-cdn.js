import introWorker from './worker-production-intro-hotfix.js';
import introVideoPart1 from '../assets/matrix-intro-video-1.txt';
import introVideoPart2 from '../assets/matrix-intro-video-2.txt';

const VERSION = '20260725-video-v7';
const SESSION_KEY = 'matrix-homepage-intro-seen-v7';
const INTRO_VIDEO_PARTS = Object.freeze([introVideoPart1, introVideoPart2]);
let decodedVideo = null;

const DIRECT_RUNTIME = `(() => {
  'use strict';
  if (window.__MATRIX_INTRO_DIRECT_V7_ACTIVE__) return;
  window.__MATRIX_INTRO_DIRECT_V7_ACTIVE__ = true;
  window.__MATRIX_INTRO_V6_ACTIVE__ = true;

  const VERSION = '${VERSION}';
  const SESSION_KEY = '${SESSION_KEY}';
  const params = new URLSearchParams(location.search);
  const forceReplay = params.get('intro') === '1';
  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const intro = document.querySelector('[data-homepage-intro-v6]');
  if (!intro) return;

  document.querySelectorAll('[data-homepage-mask-intro]').forEach(node => node.remove());

  let finished = false;
  let timeoutId = 0;
  let readyHandled = false;
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
    document.documentElement.classList.remove('matrix-intro-v6-active');
    intro.remove();
    document.dispatchEvent(new CustomEvent('matrix:homepage-mask-intro-complete'));
  };
  const finish = reason => {
    if (finished) return;
    finished = true;
    if (reason === 'ended' || reason === 'skip' || reason === 'escape') remember();
    intro.dataset.finishReason = reason;
    intro.classList.add('is-dissolving');
    setTimeout(cleanup, reducedMotion ? 50 : 780);
  };
  const fail = (reason, error) => {
    if (finished) return;
    console.error('[Matrix intro direct v7]', reason, error || '');
    intro.dataset.error = reason;
    intro.classList.add('has-error');
    if (status) status.textContent = 'Opening sequence unavailable — entering Matrix Reprogrammed';
    setTimeout(() => finish(reason), 1000);
  };
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
      console.warn('[Matrix intro direct v7] playback requires interaction', error);
    }
  };
  const ready = () => {
    if (readyHandled || finished) return;
    readyHandled = true;
    intro.classList.add('is-ready');
    if (reducedMotion) {
      intro.classList.add('needs-play');
      if (status) status.textContent = 'Tap ENTER THE MATRIX to play';
    } else {
      start(false);
    }
  };

  if (hasSeen()) { cleanup(); return; }
  if (!(video instanceof HTMLVideoElement)) { fail('video-missing'); return; }
  document.documentElement.classList.add('matrix-intro-v6-active');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.addEventListener('loadeddata', ready, { once: true });
  video.addEventListener('canplay', ready, { once: true });
  video.addEventListener('ended', () => finish('ended'), { once: true });
  video.addEventListener('error', () => fail('video-error', video.error), { once: true });
  video.src = '/_matrix-intro.mp4?v=' + VERSION;
  video.load();

  enter?.addEventListener('click', () => start(true));
  skip?.addEventListener('click', () => finish('skip'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish('escape');
  }, { once: true });

  timeoutId = setTimeout(() => {
    if (!readyHandled && !finished) fail('video-timeout');
  }, 15000);
})();`;

function textResponse(body, contentType = 'text/plain; charset=utf-8', source = 'worker-bundled-payload') {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store, max-age=0, must-revalidate',
      'access-control-allow-origin': '*',
      'x-matrix-intro-version': VERSION,
      'x-matrix-intro-source': source
    }
  });
}

function cleanPart(body, part = 0) {
  const clean = String(body || '').replace(/\s+/g, '');
  if (clean.length < 1000 || !/^[A-Za-z0-9+/=]+$/.test(clean)) return '';
  if (part === 1) {
    try {
      const prefix = atob(clean.slice(0, Math.min(clean.length, 128)));
      if (prefix.length < 8 || prefix.slice(4, 8) !== 'ftyp') return '';
    } catch {
      return '';
    }
  }
  return clean;
}

function introPart(part) {
  return cleanPart(INTRO_VIDEO_PARTS[part - 1], part);
}

function introVideoBytes() {
  if (decodedVideo) return decodedVideo;
  const parts = [introPart(1), introPart(2)];
  if (parts.some(part => !part)) throw new Error('Bundled intro video payload is invalid');
  const binary = atob(parts.join(''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.length < 10000 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') {
    throw new Error('Bundled intro video does not decode to MP4');
  }
  decodedVideo = bytes;
  return decodedVideo;
}

function videoResponse(request) {
  let bytes;
  try {
    bytes = introVideoBytes();
  } catch (error) {
    return new Response(String(error?.message || error), { status: 500, headers: { 'cache-control': 'no-store' } });
  }

  const headers = new Headers({
    'content-type': 'video/mp4',
    'cache-control': 'no-store, max-age=0, must-revalidate',
    'accept-ranges': 'bytes',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'x-matrix-intro-version': VERSION,
    'x-matrix-intro-source': 'worker-bundled-mp4'
  });
  const range = request.headers.get('range') || '';
  const match = range.match(/^bytes=(\d+)-(\d*)$/i);
  if (match) {
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : bytes.length - 1;
    if (!Number.isFinite(start) || start < 0 || start >= bytes.length) {
      headers.set('content-range', `bytes */${bytes.length}`);
      return new Response(null, { status: 416, headers });
    }
    const end = Math.min(Math.max(start, requestedEnd), bytes.length - 1);
    const slice = bytes.slice(start, end + 1);
    headers.set('content-range', `bytes ${start}-${end}/${bytes.length}`);
    headers.set('content-length', String(slice.length));
    return new Response(request.method === 'HEAD' ? null : slice, { status: 206, headers });
  }
  headers.set('content-length', String(bytes.length));
  return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
}

async function rewriteHomepage(response) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store, max-age=0, must-revalidate');
  headers.set('x-matrix-intro-version', VERSION);
  const clean = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter()
    .on('script[data-matrix-intro-v6-runtime]', {
      element(element) {
        element.setAttribute('src', `/homepage-intro-direct-v7.js?v=${VERSION}`);
        element.setAttribute('data-matrix-intro-v7-runtime', '');
      }
    })
    .transform(clean);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/homepage-intro-direct-v7.js' || path === '/homepage-intro-hotfix-v6.js') {
      return textResponse(DIRECT_RUNTIME, 'application/javascript; charset=utf-8', 'worker-direct-runtime');
    }
    if (path === '/_matrix-intro.mp4') return videoResponse(request);
    if (path === '/_matrix-intro-part/1') return textResponse(introPart(1));
    if (path === '/_matrix-intro-part/2') return textResponse(introPart(2));

    const response = await introWorker.fetch(request, env, ctx);
    const isHomepage = request.method === 'GET' && (path === '/' || path === '/index.html');
    if (isHomepage && response.ok) return rewriteHomepage(response);
    return response;
  },
  async scheduled(event, env, ctx) {
    if (typeof introWorker.scheduled === 'function') {
      return introWorker.scheduled(event, env, ctx);
    }
  }
};
