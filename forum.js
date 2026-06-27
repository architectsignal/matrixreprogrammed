(function(){
  const form = document.getElementById('signal-board-form');
  const status = document.getElementById('signal-form-status');
  const feed = document.getElementById('signal-board-feed');
  const unlockButton = document.getElementById('unlock-signal-pass');
  const passStatus = document.getElementById('signal-pass-status');
  const submitSection = document.getElementById('submit-signal');
  const boardRoot = document.querySelector('[data-board]') || document.body;
  const BOARD = String((boardRoot && boardRoot.getAttribute('data-board')) || (form && form.getAttribute('data-board')) || 'main').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'main';
  const BOARD_LABELS = {
    main: 'Main Signal Board',
    speculation: 'Dark Speculation Board',
    'epstein-alive': 'Epstein Alive / Sighting Board'
  };
  const BOARD_LABEL = BOARD_LABELS[BOARD] || 'Signal Board';
  const PASS_KEY = 'matrix_signal_pass_unlocked_v1';
  const LOCAL_POSTS_KEY = 'matrix_signal_board_posts_v2_' + BOARD;
  const LOCAL_REPORTS_KEY = 'matrix_signal_board_reports_v2_' + BOARD;
  const FEED_ROUTE = '/forum-feed?board=' + encodeURIComponent(BOARD);
  const SUBMIT_ROUTE = '/submit-forum-post';
  const REPORT_ROUTE = '/report-forum-post';
  const HEALTH_ROUTE = '/forum-health';
  let fallbackMode = false;
  let lastBackendError = '';

  function esc(s){ return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function when(value){ try { return new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return ''; } }
  function unlocked(){ try { return localStorage.getItem(PASS_KEY) === 'yes'; } catch { return false; } }
  function localPosts(){ try { return JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY) || '[]'); } catch { return []; } }
  function saveLocalPosts(posts){ try { localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts.slice(0, 50))); } catch {} }
  function saveLocalReport(report){
    try {
      const reports = JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
      reports.unshift(report);
      localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports.slice(0, 50)));
    } catch {}
  }
  async function parse(res){ const text = await res.text(); try { return JSON.parse(text); } catch { return { error: text || ('HTTP ' + res.status) }; } }
  function listFrom(data){ return Array.isArray(data) ? data : (data && Array.isArray(data.posts) ? data.posts : []); }
  function backendErrorLabel(prefix, err){
    const detail = err && err.message ? err.message : String(err || 'backend request failed');
    return prefix + ': ' + detail;
  }

  function applyLock(){
    const ok = unlocked();
    if (submitSection) submitSection.classList.toggle('signal-locked', !ok);
    if (form) Array.from(form.elements).forEach(el => { if (el.name !== 'website') el.disabled = !ok; });
    const lockMessage = document.querySelector('.signal-lock-message');
    if (lockMessage) lockMessage.textContent = ok ? 'Signal Pass unlocked on this device. Posting is open for ' + BOARD_LABEL + '.' : 'Posting is locked until Signal Pass is unlocked on this device.';
    if (passStatus) passStatus.textContent = ok ? 'Signal Pass unlocked. You can now post to ' + BOARD_LABEL + '.' : 'Signal Pass not unlocked on this device yet.';
  }

  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    const local = post.localOnly ? ' <span class="pill">saved on this device</span>' : '';
    const board = post.board ? ' <span class="pill">' + esc(BOARD_LABELS[post.board] || post.board) + '</span>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title || 'Signal') + '</h3><p>' + esc(post.body || post.message || '') + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Anonymous') + '</span> <span class="pill">' + esc(when(post.approvedAt || post.createdAt || post.timestamp)) + '</span>' + board + local + '</p><button class="btn alt report-signal" type="button" data-id="' + esc(post.id) + '">Report post</button></article>';
  }

  function fallbackNotice(){
    const detail = lastBackendError ? '<p><strong>Backend detail:</strong> ' + esc(lastBackendError) + '</p>' : '';
    return '<article class="card redline"><span class="label">Local fallback</span><h3>' + esc(BOARD_LABEL) + ' backend unavailable on this request</h3><p>The board page still works locally, but public posting needs the Worker routes at /forum-feed and /submit-forum-post plus the FORUM_POSTS KV binding.</p>' + detail + '<p>Cloudflare test route: <a href="' + HEALTH_ROUTE + '" target="_blank" rel="noopener">/forum-health</a></p></article>';
  }

  function postBelongsHere(post){
    const board = String(post.board || 'main');
    if (board === BOARD) return true;
    if (BOARD === 'main' && board !== 'speculation' && board !== 'epstein-alive') return true;
    return false;
  }

  async function loadFallback(){
    fallbackMode = true;
    let seed = [];
    try {
      const res = await fetch('data/forum-seed.json', { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        seed = Array.isArray(data.posts) ? data.posts.filter(postBelongsHere) : [];
      }
    } catch {}
    const posts = localPosts().concat(seed).filter(postBelongsHere);
    feed.innerHTML = fallbackNotice() + (posts.length ? posts.map(renderPost).join('') : '');
  }

  async function loadFeed(){
    if (!feed) return;
    try {
      fallbackMode = false;
      lastBackendError = '';
      const res = await fetch(FEED_ROUTE, { headers: { 'Accept': 'application/json' } });
      const data = await parse(res);
      if (!res.ok) throw new Error('GET ' + FEED_ROUTE + ' returned HTTP ' + res.status + ': ' + (data.error || 'feed failed'));
      const posts = listFrom(data).filter(postBelongsHere);
      feed.innerHTML = posts.length ? posts.map(renderPost).join('') : '<article class="card redline"><h3>No signals yet</h3><p>' + esc(BOARD_LABEL) + ' is open. Unlock a Signal Pass and post a source, question, reader note, or public-record lead.</p></article>';
    } catch (err) {
      lastBackendError = backendErrorLabel('Feed route failed', err);
      await loadFallback();
    }
  }

  async function reportPost(id){
    const reason = prompt('Report reason:');
    if (!reason) return;
    if (fallbackMode) {
      saveLocalReport({ id, board: BOARD, reason, createdAt: new Date().toISOString() });
      alert('Report saved on this device.');
      return;
    }
    try {
      const res = await fetch(REPORT_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ id, board: BOARD, reason })
      });
      const data = await parse(res);
      if (!res.ok) throw new Error('POST ' + REPORT_ROUTE + ' returned HTTP ' + res.status + ': ' + (data.error || 'report failed'));
      alert('Report received.');
    } catch (err) {
      saveLocalReport({ id, board: BOARD, reason, createdAt: new Date().toISOString() });
      alert(backendErrorLabel('Report route unavailable; report saved on this device', err));
    }
  }

  if (unlockButton) unlockButton.addEventListener('click', function(){
    try { localStorage.setItem(PASS_KEY, 'yes'); } catch {}
    applyLock();
    if (status) status.textContent = 'Signal Pass unlocked. You can now post to ' + BOARD_LABEL + '.';
    if (submitSection) submitSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (feed) feed.addEventListener('click', function(event){
    const button = event.target.closest('.report-signal');
    if (button) reportPost(button.getAttribute('data-id'));
  });

  if (form) form.addEventListener('submit', async function(event){
    event.preventDefault();
    if (!unlocked()) {
      status.textContent = 'Unlock Signal Pass before posting.';
      const gate = document.getElementById('signal-pass');
      if (gate) gate.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.board = BOARD;
    if (payload.website) { status.textContent = 'Spam trap triggered.'; return; }
    status.textContent = 'Posting to ' + BOARD_LABEL + '...';
    try {
      const res = await fetch(SUBMIT_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await parse(res);
      if (!res.ok) throw new Error('POST ' + SUBMIT_ROUTE + ' returned HTTP ' + res.status + ': ' + (data.error || 'post failed'));
      form.reset();
      status.textContent = 'Signal posted. It is now live on ' + BOARD_LABEL + '.';
      await loadFeed();
      applyLock();
    } catch (err) {
      const post = Object.assign({}, payload, { id: 'local-' + Date.now(), board: BOARD, createdAt: new Date().toISOString(), localOnly: true });
      const posts = localPosts();
      posts.unshift(post);
      saveLocalPosts(posts);
      form.reset();
      lastBackendError = backendErrorLabel('Submit route failed', err);
      status.textContent = lastBackendError + '. Signal saved on this device. Open /forum-health to check whether the latest Worker and FORUM_POSTS binding are live.';
      await loadFallback();
      applyLock();
    }
  });

  applyLock();
  loadFeed();
})();
