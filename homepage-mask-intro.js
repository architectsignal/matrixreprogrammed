(() => {
  const intro = document.querySelector('[data-homepage-mask-intro]');
  if (!intro) return;

  const sessionKey = 'matrix-homepage-mask-intro-seen-v1';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const holdMs = reducedMotion ? 1200 : 3600;
  const dissolveMs = reducedMotion ? 220 : 1200;
  let finished = false;
  let holdTimer = null;
  let removeTimer = null;

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

  function removeIntro() {
    intro.classList.add('is-removed');
    intro.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('mask-intro-active');
    intro.remove();
    document.dispatchEvent(new CustomEvent('matrix:homepage-mask-intro-complete'));
  }

  function finish(options = {}) {
    if (finished) return;
    finished = true;
    clearTimeout(holdTimer);
    clearTimeout(removeTimer);
    markSeen();
    intro.classList.add('is-dissolving');
    intro.dataset.finishReason = options.reason || 'timer';
    removeTimer = window.setTimeout(removeIntro, dissolveMs + 80);
  }

  if (hasSeen()) {
    removeIntro();
    return;
  }

  document.documentElement.classList.add('mask-intro-active');
  intro.setAttribute('aria-hidden', 'false');
  prepareWelcomeGate();

  const skip = intro.querySelector('[data-mask-intro-skip]');
  skip?.addEventListener('click', () => finish({ reason: 'skip' }));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !finished) finish({ reason: 'escape' });
  }, { once: true });

  const image = intro.querySelector('img');
  image?.addEventListener('error', () => finish({ reason: 'asset-error' }), { once: true });

  holdTimer = window.setTimeout(() => finish({ reason: 'timer' }), holdMs);
})();
