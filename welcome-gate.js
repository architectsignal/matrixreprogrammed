(() => {
  const gate = document.querySelector('[data-signal-gate]');
  if (!gate) return;

  const enterButtons = gate.querySelectorAll('[data-enter-archive]');
  const replayButton = document.querySelector('[data-replay-gate]');
  const typeTarget = gate.querySelector('[data-gate-type]');
  const actions = gate.querySelector('.gate-actions');
  const storageKey = 'matrix-reprogrammed-signal-gate-entered';
  const voicePreferenceKey = 'matrix-reprogrammed-signal-gate-voice';
  const introLines = [
    '> WELCOME TO MATRIX REPROGRAMMED',
    '> Reality is edited.',
    '> The headline is not the machine.',
    '> Symbols. Files. War. Intelligence. Crime. Psychology. Source.',
    '> The truth is not hidden. It is encoded.'
  ];
  const introSpeechText = introLines
    .map(line => line.replace(/^>\s*/, ''))
    .join(' ');

  let typeRun = 0;
  let currentAudio = null;
  let voiceButton = null;

  function stopVoice() {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
      currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (voiceButton) {
      voiceButton.classList.remove('is-speaking');
      voiceButton.textContent = 'Voice Intro';
      voiceButton.setAttribute('aria-pressed', 'false');
    }
  }

  function hideGate(save = true) {
    stopVoice();
    gate.classList.add('is-hidden');
    gate.setAttribute('aria-hidden', 'true');
    if (save) localStorage.setItem(storageKey, 'true');
  }

  function showGate(reset = false) {
    gate.classList.remove('is-hidden');
    gate.setAttribute('aria-hidden', 'false');
    if (reset) localStorage.removeItem(storageKey);
  }

  function setVoiceStatus(label, speaking = false) {
    if (!voiceButton) return;
    voiceButton.textContent = label;
    voiceButton.classList.toggle('is-speaking', speaking);
    voiceButton.setAttribute('aria-pressed', speaking ? 'true' : 'false');
  }

  function browserSpeechFallback() {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(introSpeechText);
    utterance.rate = 0.86;
    utterance.pitch = 0.72;
    utterance.volume = 0.9;
    utterance.onend = () => setVoiceStatus('Voice Intro', false);
    utterance.onerror = () => setVoiceStatus('Voice Intro', false);
    window.speechSynthesis.speak(utterance);
    setVoiceStatus('Browser Voice', true);
    return true;
  }

  async function playElevenLabsIntro() {
    stopVoice();
    setVoiceStatus('Loading Voice…', true);
    localStorage.setItem(voicePreferenceKey, 'enabled');
    try {
      const response = await fetch('/intro-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: introSpeechText }),
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Voice endpoint returned ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      currentAudio = new Audio(url);
      currentAudio.addEventListener('ended', () => {
        URL.revokeObjectURL(url);
        setVoiceStatus('Voice Intro', false);
      });
      currentAudio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        if (!browserSpeechFallback()) setVoiceStatus('Voice Intro', false);
      });
      await currentAudio.play();
      setVoiceStatus('ElevenLabs Voice', true);
      return true;
    } catch (error) {
      if (!browserSpeechFallback()) setVoiceStatus('Voice Intro', false);
      return false;
    }
  }

  async function typeIntro(options = {}) {
    if (!typeTarget) return;
    const run = ++typeRun;
    typeTarget.innerHTML = '';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (options.voice) {
      playElevenLabsIntro();
    }

    if (reducedMotion) {
      typeTarget.innerHTML = introLines.map(line => `<p>${line}</p>`).join('') + '<span class="gate-cursor"></span>';
      return;
    }

    for (const line of introLines) {
      if (run !== typeRun) return;
      const p = document.createElement('p');
      typeTarget.appendChild(p);
      for (const char of line) {
        if (run !== typeRun) return;
        p.textContent += char;
        await new Promise(resolve => setTimeout(resolve, char === ' ' ? 8 : 18));
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (run !== typeRun) return;
    const cursor = document.createElement('span');
    cursor.className = 'gate-cursor';
    typeTarget.appendChild(cursor);
  }

  function addVoiceButton() {
    if (!actions || actions.querySelector('[data-gate-voice]')) return;
    voiceButton = document.createElement('button');
    voiceButton.className = 'gate-voice';
    voiceButton.type = 'button';
    voiceButton.dataset.gateVoice = 'true';
    voiceButton.textContent = 'Voice Intro';
    voiceButton.setAttribute('aria-pressed', 'false');
    voiceButton.addEventListener('click', () => {
      if (voiceButton.classList.contains('is-speaking')) {
        localStorage.setItem(voicePreferenceKey, 'disabled');
        stopVoice();
        return;
      }
      showGate(true);
      typeIntro({ voice: true });
    });
    actions.appendChild(voiceButton);
  }

  addVoiceButton();

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
      typeIntro({ voice: localStorage.getItem(voicePreferenceKey) === 'enabled' });
    });
  }
})();
