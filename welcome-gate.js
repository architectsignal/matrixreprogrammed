(() => {
  'use strict';

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
    '> Power leaves a paper trail.',
    '> Follow the money. Check the record.',
    '> The machine watches what changes.',
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

  function mountHomepageCommandRail() {
    if (document.querySelector('[data-home-command-rail]')) return;
    const anchor = document.querySelector('.cinematic-command') || document.querySelector('.topbar');
    if (!anchor || !anchor.parentNode) return;

    const section = document.createElement('section');
    section.className = 'home-signal-rail wrap';
    section.dataset.homeCommandRail = 'true';
    section.setAttribute('aria-label', 'Money, investigation and briefing command links');
    section.innerHTML = `
      <div class="home-signal-copy">
        <span class="eyebrow">Live Intelligence Command Rail</span>
        <h2>FOLLOW THE MONEY. FOLLOW THE MACHINE.</h2>
        <p>See who holds the assets, study how wealth is built, and open the evidence-bounded conclusions published by the investigation system.</p>
      </div>
      <nav class="home-signal-grid" aria-label="Featured intelligence routes">
        <a class="home-signal-card" href="follow-the-money.html"><span>01</span><strong>Follow the Money</strong><small>World Top 100 wealth holders</small></a>
        <a class="home-signal-card" href="making-money.html"><span>02</span><strong>How to Make Money</strong><small>Evidence-led wealth building guide</small></a>
        <a class="home-signal-card" href="investigation-machine.html"><span>03</span><strong>AI Investigation Bot</strong><small>Open the live investigation machine</small></a>
        <a class="home-signal-card" href="ai-speculative-conclusions.html"><span>04</span><strong>AI Detective · Epstein</strong><small>Active hypotheses, counter-evidence and missing proof</small></a><a class="home-signal-card" href="daily-investigation-conclusions.html"><span>05</span><strong>Published Conclusions</strong><small>What the machine concluded today</small></a>
        <a class="home-signal-card" href="daily-command-brief.html"><span>05</span><strong>Emails & Briefs</strong><small>Daily command brief and report routes</small></a>
      </nav>`;
    anchor.insertAdjacentElement('afterend', section);
  }

  addVoiceButton();
  mountHomepageCommandRail();

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