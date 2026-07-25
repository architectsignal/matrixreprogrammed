(() => {
  'use strict';

  const intro = document.querySelector('[data-homepage-mask-intro]');
  if (!intro) return;

  const sessionKey = 'matrix-homepage-intro-seen-v3';
  const videoParts = [
    'assets/matrix-intro-video-1.txt',
    'assets/matrix-intro-video-2.txt'
  ];
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const timers = new Set();
  let finished = false;

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

  function removeIntro() {
    clearTimers();
    intro.classList.add('is-removed');
    intro.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('mask-intro-active');
    intro.remove();
    document.dispatchEvent(new CustomEvent('matrix:homepage-mask-intro-complete'));
  }

  function finish(reason = 'ended') {
    if (finished) return;
    finished = true;
    clearTimers();
    markSeen();
    intro.dataset.finishReason = reason;
    intro.classList.add('is-dissolving');
    later(removeIntro, reducedMotion ? 120 : 760);
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

  async function loadVideoSource() {
    const parts = await Promise.all(videoParts.map(async url => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Intro video part failed: ${response.status}`);
      return (await response.text()).trim();
    }));
    if (parts.some(part => !part)) throw new Error('Intro video part was empty');
    return `data:video/mp4;base64,${parts.join('')}`;
  }

  if (hasSeen()) {
    removeIntro();
    return;
  }

  document.documentElement.classList.add('mask-intro-active');
  intro.setAttribute('aria-hidden', 'false');
  intro.dataset.mode = 'video';
  prepareWelcomeGate();

  const video = mountVideo();
  intro.querySelector('[data-mask-intro-skip]')?.addEventListener('click', () => finish('skip'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !finished) finish('escape');
  }, { once: true });

  if (!(video instanceof HTMLVideoElement)) {
    finish('video-missing');
    return;
  }

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.addEventListener('ended', () => finish('ended'), { once: true });
  video.addEventListener('error', () => finish('video-error'), { once: true });

  if (reducedMotion) {
    finish('reduced-motion');
    return;
  }

  const startPlayback = async () => {
    try {
      await video.play();
      intro.classList.add('is-playing');
      intro.classList.remove('needs-play');
    } catch {
      intro.classList.add('needs-play');
    }
  };

  loadVideoSource()
    .then(source => {
      if (finished) return;
      video.src = source;
      video.addEventListener('loadeddata', startPlayback, { once: true });
      video.load();
    })
    .catch(() => finish('video-load-error'));

  intro.addEventListener('click', event => {
    if (!intro.classList.contains('needs-play')) return;
    if (event.target instanceof HTMLButtonElement) return;
    startPlayback();
  });

  later(() => {
    if (!finished) finish('timeout');
  }, 15000);
})();
