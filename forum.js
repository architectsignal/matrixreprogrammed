(function(){
  const form = document.getElementById('signal-board-form');
  const status = document.getElementById('signal-form-status');
  const feed = document.getElementById('signal-board-feed');
  const unlockButton = document.getElementById('unlock-signal-pass');
  const passStatus = document.getElementById('signal-pass-status');
  const submitSection = document.getElementById('submit-signal');
  const PASS_KEY = 'matrix_signal_pass_unlocked_v1';

  function esc(s){
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function shortDate(value){
    try { return new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return ''; }
  }

  function hasSignalPass(){
    return localStorage.getItem(PASS_KEY) === 'yes';
  }

  function applySignalPassState(){
    const unlocked = hasSignalPass();
    if (submitSection) submitSection.classList.toggle('signal-locked', !unlocked);
    if (form) {
      Array.from(form.elements).forEach(el => {
        if (el.name === 'website') return;
        el.disabled = !unlocked;
      });
    }
    const lockMessage = document.querySelector('.signal-lock-message');
    if (lockMessage) {
      lockMessage.textContent = unlocked ? 'Signal Pass unlocked on this device. Posting is open.' : 'Posting is locked until Signal Pass is unlocked on this device.';
    }
    if (passStatus) {
      passStatus.textContent = unlocked ? 'Signal Pass unlocked. You can now post.' : 'Signal Pass not unlocked on this device yet.';
    }
  }

  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title) + '</h3><p>' + esc(post.body) + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Anonymous') + '</span> <span class="pill">' + esc(shortDate(post.approvedAt || post.createdAt)) + '</span></p><button class="btn alt report-signal" type="button" data-id="' + esc(post.id) + '">Report hard-floor violation</button></article>';
  }

  async function loadFeed(){
    if (!feed) return;
    try {
      const res = await fetch('/.netlify/functions/forum-feed', { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      if (!posts.length) {
        feed.innerHTML = '<article class="card redline"><h3>No signals yet</h3><p>The board is open. Unlock a Signal Pass and post a source, question, reader note, or human-cost update.</p></article>';
        return;
      }
      feed.innerHTML = posts.map(renderPost).join('');
    } catch (err) {
      feed.innerHTML = '<article class="card redline"><h3>Signal feed offline</h3><p>Posts could not be loaded right now.</p></article>';
    }
  }

  async function reportPost(id){
    const reason = prompt('Report reason: threats, doxxing, private victim names, explicit exploitation material, spam, or illegal content?');
    if (!reason) return;
    try {
      await fetch('/.netlify/functions/report-forum-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ id, reason })
      });
      alert('Report received. The post remains public unless removed after review.');
    } catch (err) {
      alert('Report could not be sent right now.');
    }
  }

  if (unlockButton) {
    unlockButton.addEventListener('click', function(){
      localStorage.setItem(PASS_KEY, 'yes');
      applySignalPassState();
      if (submitSection) submitSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (feed) {
    feed.addEventListener('click', function(event){
      const button = event.target.closest('.report-signal');
      if (!button) return;
      reportPost(button.getAttribute('data-id'));
    });
  }

  if (form) {
    form.addEventListener('submit', async function(event){
      event.preventDefault();
      if (!hasSignalPass()) {
        status.textContent = 'Unlock Signal Pass before posting.';
        const gate = document.getElementById('signal-pass');
        if (gate) gate.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      status.textContent = 'Posting signal...';
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.signalPass = 'local-unlocked';
      try {
        const res = await fetch('/.netlify/functions/submit-forum-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submission failed');
        form.reset();
        status.textContent = 'Signal posted. It is now live on the board.';
        await loadFeed();
      } catch (err) {
        status.textContent = err.message || 'Could not post signal.';
      }
    });
  }

  applySignalPassState();
  loadFeed();
})();
