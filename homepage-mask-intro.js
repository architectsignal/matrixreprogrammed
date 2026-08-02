(() => {
  'use strict';

  const intro = document.querySelector('[data-homepage-mask-intro]');
  if (!intro) return;

  // Retired release-test markers only: matrix-homepage-intro-seen-v2; eye: 3000; burn: 1100; mask: 3000.
  const runtimeVersion = '20260803-video-v6';
  const sessionKey = 'matrix-homepage-intro-seen-v6';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const forceReplay = new URLSearchParams(window.location.search).get('intro') === '1';
  const timers = new Set();
  let finished = false;
  let objectUrl = '';

  function later(callback, delay) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      callback();
    }, delay);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  }

  function hasSeen() {
    if (forceReplay) return false;
    try { return sessionStorage.getItem(sessionKey) === 'true'; }
    catch { return false; }
  }

  function markSeen() {
    try { sessionStorage.setItem(sessionKey, 'true'); }
    catch {}
  }

  // This deliberately preserves the separate Matrix Reprogrammed
  // welcome gate and its optional ElevenLabs voice intro.
  function prepareWelcomeGate() {
    const replay = document.querySelector('[data-replay-gate]');
    const gate = document.querySelector('[data-signal-gate]');
    if (replay instanceof HTMLElement) {
      try { replay.click(); return; } catch {}
    }
    if (gate instanceof HTMLElement) {
      gate.classList.remove('is-hidden');
      gate.setAttribute('aria-hidden', 'false');
    }
  }

  function releaseVideoData() {
    try { delete globalThis.__MATRIX_INTRO_BASE64__; } catch {}
    try { delete globalThis.__MATRIX_INTRO_META__; } catch {}
  }

  function removeIntro() {
    clearTimers();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    releaseVideoData();
    intro.classList.add('is-removed');
    intro.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('mask-intro-active');
    intro.remove();
    document.dispatchEvent(new CustomEvent('matrix:homepage-mask-intro-complete'));
  }

  function shouldRemember(reason) {
    return reason === 'ended' || reason === 'skip' || reason === 'escape';
  }

  function finish(reason = 'ended') {
    if (finished) return;
    finished = true;
    clearTimers();
    if (shouldRemember(reason)) markSeen();
    intro.dataset.finishReason = reason;
    intro.classList.add('is-dissolving');
    later(removeIntro, reducedMotion ? 120 : 760);
  }

  function failGracefully(reason, error) {
    if (finished) return;
    intro.dataset.error = reason;
    intro.classList.add('has-error');
    console.error('[Matrix intro]', reason, error || '');
    later(() => finish(reason), 900);
  }

  function mountVideo() {
    const stage = intro.querySelector('.homepage-mask-intro__stage') || intro;
    stage.innerHTML = `
      <video class="homepage-mask-intro__video" muted autoplay playsinline preload="auto" aria-label="Matrix Reprogrammed cinematic opening" data-homepage-intro-video></video>
      <div class="homepage-mask-intro__controls" aria-label="Intro controls">
        <button class="homepage-mask-intro__skip" type="button" data-mask-intro-skip>Skip intro</button>
      </div>`;
    return stage.querySelector('[data-homepage-intro-video]');
  }

  function normalizeBase64(base64) {
    let clean = String(base64 || '')
      .trim()
      .replace(/^data:[^,]*;base64,/i, '')
      .replace(/\s+/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    if (clean.length < 1000) throw new Error('Build-generated intro video data is missing or incomplete');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('Build-generated intro video data contains invalid Base64 characters');

    // Some historic build assets carried redundant terminal padding. Node's
    // Buffer decoder accepted it, but browsers correctly reject it in atob().
    clean = clean.replace(/=+$/, '');
    if (clean.length % 4 === 1) throw new Error('Build-generated intro video data has an invalid Base64 length');
    return clean + '='.repeat((4 - (clean.length % 4)) % 4);
  }

  function base64ToObjectUrl(base64) {
    const clean = normalizeBase64(base64);
    const binary = window.atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') {
      throw new Error('Build-generated intro video data is not an MP4');
    }
    return URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  }

  function loadVideoSource() {
    const embedded = globalThis.__MATRIX_INTRO_BASE64__;
    if (typeof embedded !== 'string') throw new Error('Intro video data runtime did not load');
    const source = base64ToObjectUrl(embedded);
    releaseVideoData();
    return source;
  }

  if (hasSeen()) {
    removeIntro();
    return;
  }

  document.documentElement.classList.add('mask-intro-active');
  intro.setAttribute('aria-hidden', 'false');
  intro.dataset.mode = 'video';
  intro.dataset.version = runtimeVersion;
  prepareWelcomeGate();

  const video = mountVideo();
  intro.querySelector('[data-mask-intro-skip]')?.addEventListener('click', () => finish('skip'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !finished) finish('escape');
  }, { once: true });

  if (!(video instanceof HTMLVideoElement)) {
    failGracefully('video-missing');
    return;
  }

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.addEventListener('ended', () => finish('ended'), { once: true });
  video.addEventListener('error', () => failGracefully('video-error', video.error), { once: true });

  const startPlayback = async () => {
    try {
      await video.play();
      intro.classList.add('is-ready', 'is-playing');
      intro.classList.remove('needs-play');
    } catch (error) {
      intro.classList.add('is-ready', 'needs-play');
      intro.dataset.autoplay = 'blocked';
      console.warn('[Matrix intro] autoplay blocked; tap to play', error);
    }
  };

  try {
    objectUrl = loadVideoSource();
    video.src = objectUrl;
    video.addEventListener('loadeddata', () => {
      intro.classList.add('is-ready');
      if (reducedMotion) {
        intro.classList.add('needs-play');
        video.pause();
        return;
      }
      startPlayback();
    }, { once: true });
    video.load();
  } catch (error) {
    failGracefully('video-data-error', error);
  }

  intro.addEventListener('click', event => {
    if (!intro.classList.contains('needs-play')) return;
    if (event.target instanceof HTMLButtonElement) return;
    startPlayback();
  });

  later(() => {
    if (!finished && !intro.classList.contains('is-ready')) failGracefully('video-timeout');
  }, 12000);
})();
