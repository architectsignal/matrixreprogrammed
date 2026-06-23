(() => {
  const gate = document.querySelector('[data-signal-gate]');
  if (!gate) return;

  const enterButtons = gate.querySelectorAll('[data-enter-archive]');
  const replayButton = document.querySelector('[data-replay-gate]');
  const typeTarget = gate.querySelector('[data-gate-type]');
  const storageKey = 'matrix-reprogrammed-signal-gate-entered';
  const introLines = [
    '> WELCOME TO MATRIX REPROGRAMMED',
    '> Reality is edited.',
    '> The headline is not the machine.',
    '> Symbols. Files. War. Intelligence. Crime. Psychology. Source.',
    '> The truth is not hidden. It is encoded.'
  ];

  function hideGate(save = true) {
    gate.classList.add('is-hidden');
    gate.setAttribute('aria-hidden', 'true');
    if (save) localStorage.setItem(storageKey, 'true');
  }

  function showGate(reset = false) {
    gate.classList.remove('is-hidden');
    gate.setAttribute('aria-hidden', 'false');
    if (reset) localStorage.removeItem(storageKey);
  }

  async function typeIntro() {
    if (!typeTarget) return;
    typeTarget.innerHTML = '';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      typeTarget.innerHTML = introLines.map(line => `<p>${line}</p>`).join('') + '<span class="gate-cursor"></span>';
      return;
    }

    for (const line of introLines) {
      const p = document.createElement('p');
      typeTarget.appendChild(p);
      for (const char of line) {
        p.textContent += char;
        await new Promise(resolve => setTimeout(resolve, char === ' ' ? 8 : 18));
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const cursor = document.createElement('span');
    cursor.className = 'gate-cursor';
    typeTarget.appendChild(cursor);
  }

  if (localStorage.getItem(storageKey) === 'true') {
    hideGate(false);
  } else {
    showGate(false);
    typeIntro();
  }

  enterButtons.forEach(button => {
    button.addEventListener('click', () => hideGate(true));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !gate.classList.contains('is-hidden')) hideGate(true);
  });

  if (replayButton) {
    replayButton.addEventListener('click', () => {
      showGate(true);
      typeIntro();
    });
  }
})();
