(() => {
  const intro = document.querySelector('[data-homepage-mask-intro]');
  if (!intro) return;

  const sessionKey = 'matrix-homepage-intro-seen-v2';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const timing = reducedMotion
    ? { eye: 800, burn: 220, mask: 1000, dissolve: 220 }
    : { eye: 3000, burn: 1100, mask: 3000, dissolve: 1200 };

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

  function setPhase(phase) {
    intro.classList.remove('phase-eye', 'phase-burn', 'phase-mask');
    intro.classList.add(`phase-${phase}`);
    intro.dataset.phase = phase;
    document.dispatchEvent(new CustomEvent('matrix:homepage-intro-phase', { detail: { phase } }));
  }

  function removeIntro() {
    clearTimers();
    intro.classList.add('is-removed');
    intro.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('mask-intro-active');
    intro.remove();
    document.dispatchEvent(new CustomEvent('matrix:homepage-mask-intro-complete'));
  }

  function finish(reason = 'timer') {
    if (finished) return;
    finished = true;
    clearTimers();
    markSeen();
    intro.dataset.finishReason = reason;
    intro.classList.add('is-dissolving');
    later(removeIntro, timing.dissolve + 90);
  }

  function startSequence() {
    setPhase('eye');
    later(() => setPhase('burn'), timing.eye);
    later(() => setPhase('mask'), timing.eye + timing.burn);
    later(() => finish('timer'), timing.eye + timing.burn + timing.mask);
  }

  function waitForAssets() {
    const images = [...intro.querySelectorAll('[data-intro-asset]')];
    if (!images.length) return Promise.reject(new Error('No intro assets found'));
    return Promise.all(images.map(image => new Promise(resolve => {
      if (image.complete && image.naturalWidth > 0) return resolve({ ok: true, image });
      const done = ok => resolve({ ok, image });
      image.addEventListener('load', () => done(true), { once: true });
      image.addEventListener('error', () => done(false), { once: true });
    })));
  }

  if (hasSeen()) {
    removeIntro();
    return;
  }

  document.documentElement.classList.add('mask-intro-active');
  intro.setAttribute('aria-hidden', 'false');
  prepareWelcomeGate();

  intro.querySelector('[data-mask-intro-skip]')?.addEventListener('click', () => finish('skip'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !finished) finish('escape');
  }, { once: true });

  waitForAssets()
    .then(results => {
      const failures = results.filter(result => !result.ok);
      if (failures.length === results.length) return finish('asset-error');
      if (failures.length) intro.dataset.assetWarning = String(failures.length);
      startSequence();
    })
    .catch(() => finish('asset-error'));

  later(() => {
    if (!intro.dataset.phase && !finished) startSequence();
  }, 1800);
})();
