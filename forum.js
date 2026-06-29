(function(){
  const form = document.getElementById('signal-board-form');
  const status = document.getElementById('signal-form-status');
  const feed = document.getElementById('signal-board-feed');
  const unlockButton = document.getElementById('unlock-signal-pass');
  const passStatus = document.getElementById('signal-pass-status');
  const submitSection = document.getElementById('submit-signal');

  const BOARD_LABELS = { main: 'Main Signal Board', speculation: 'Dark Speculation Board', 'epstein-alive': 'Epstein Alive / Sighting Board' };
  const FEED_ROUTES = { main: '/forum-feed-main', speculation: '/forum-feed-speculation', 'epstein-alive': '/forum-feed-epstein-alive' };
  const SUBMIT_ROUTES = { main: '/submit-main-post', speculation: '/submit-speculation-post', 'epstein-alive': '/submit-epstein-alive-post' };
  const REPORT_ROUTES = { main: '/report-main-post', speculation: '/report-speculation-post', 'epstein-alive': '/report-epstein-alive-post' };
  const PASS_KEY = 'matrix_signal_pass_unlocked_v1';

  function boardFromPath(){
    const p = String(location.pathname || '').toLowerCase();
    if (p.includes('dark-speculation') || p.includes('speculation-board')) return 'speculation';
    if (p.includes('epstein-alive') || p.includes('epstein-sighting')) return 'epstein-alive';
    return 'main';
  }
  function cleanBoard(value){
    const raw = String(value || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    if (raw === 'speculation' || raw === 'darkspeculation' || raw === 'dark-speculation') return 'speculation';
    if (raw === 'epsteinalive' || raw === 'epstein-alive' || raw === 'epsteinsighting' || raw === 'epstein-sighting') return 'epstein-alive';
    if (raw === 'main') return 'main';
    return '';
  }
  const boardRoot = document.querySelector('[data-board]') || document.body;
  const BOARD = cleanBoard((boardRoot && boardRoot.getAttribute('data-board')) || (form && form.getAttribute('data-board')) || '') || boardFromPath();
  const BOARD_LABEL = BOARD_LABELS[BOARD] || 'Signal Board';
  const FEED_ROUTE = FEED_ROUTES[BOARD] || FEED_ROUTES.main;
  const SUBMIT_ROUTE = SUBMIT_ROUTES[BOARD] || SUBMIT_ROUTES.main;
  const REPORT_ROUTE = REPORT_ROUTES[BOARD] || REPORT_ROUTES.main;

  function esc(s){ return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function when(value){ try { return new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return ''; } }
  function unlocked(){ try { return localStorage.getItem(PASS_KEY) === 'yes'; } catch { return false; } }
  async function parse(res){ const text = await res.text(); try { return JSON.parse(text); } catch { return { error: text || ('HTTP ' + res.status) }; } }
  function listFrom(data){ return Array.isArray(data) ? data : (data && Array.isArray(data.posts) ? data.posts : []); }
  function systemErrorLabel(prefix, err){ const detail = err && err.message ? err.message : String(err || 'request failed'); return prefix + ': ' + detail; }

  function lockFormToBoard(){
    if (!form) return;
    form.setAttribute('data-board', BOARD);
    let hidden = form.querySelector('input[name="board"]');
    if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'board'; form.prepend(hidden); }
    hidden.value = BOARD;
  }
  function applyLock(){
    lockFormToBoard();
    const ok = unlocked();
    if (submitSection) submitSection.classList.toggle('signal-locked', !ok);
    if (form) Array.from(form.elements).forEach(el => { if (el.name !== 'website') el.disabled = !ok; });
    const lockMessage = document.querySelector('.signal-lock-message');
    if (lockMessage) lockMessage.textContent = ok ? 'Signal Pass unlocked. Persistent posting is open for ' + BOARD_LABEL + '.' : 'Posting is locked until Signal Pass is unlocked.';
    if (passStatus) passStatus.textContent = ok ? 'Signal Pass unlocked. Posts must save live to Cloudflare KV.' : 'Signal Pass not unlocked yet.';
  }
  function postBelongsHere(post){ return String(post && post.board || 'main') === BOARD; }
  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    const board = post.board ? ' <span class="pill">' + esc(BOARD_LABELS[post.board] || post.board) + '</span>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title || 'Signal') + '</h3><p>' + esc(post.body || post.message || '') + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Anonymous') + '</span> <span class="pill">' + esc(when(post.approvedAt || post.createdAt || post.timestamp)) + '</span>' + board + ' <span class="pill">persistent</span></p><button class="btn alt report-signal" type="button" data-id="' + esc(post.id) + '">Report post</button></article>';
  }
  function offlineNotice(message){
    return '<article class="card redline"><span class="label">Persistent Signal Board</span><h3>' + esc(BOARD_LABEL) + ' cannot save right now</h3><p>Posts are not saved in this browser. This board only accepts persistent Cloudflare KV posts. Try again after the live backend is healthy.</p><p><strong>Detail:</strong> ' + esc(message || 'feed unavailable') + '</p><p><a class="btn alt" href="/forum-health">Check forum health</a></p></article>';
  }
  async function loadFeed(){
    if (!feed) return;
    lockFormToBoard();
    try {
      const res = await fetch(FEED_ROUTE + '?t=' + Date.now(), { cache:'no-store', headers:{ 'Accept':'application/json' } });
      const data = await parse(res);
      if (!res.ok || data.ok === false || data.configured === false || data.persistent !== true) throw new Error((data && data.error) || 'persistent feed unavailable');
      const posts = listFrom(data).filter(postBelongsHere);
      feed.innerHTML = posts.length ? posts.map(renderPost).join('') : '<article class="card redline"><h3>No persistent signals yet</h3><p>' + esc(BOARD_LABEL) + ' is connected. Unlock a Signal Pass and post a source, question, reader note, or public-record lead.</p></article>';
    } catch (err) {
      feed.innerHTML = offlineNotice(systemErrorLabel('Feed failed', err));
    }
  }
  async function postLive(payload){
    const res = await fetch(SUBMIT_ROUTE, { method:'POST', cache:'no-store', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' }, body: JSON.stringify(payload) });
    const data = await parse(res);
    if (!res.ok || data.ok === false || data.persistent !== true || !data.post || !data.post.id) throw new Error((data && data.error) || ('persistent post failed HTTP ' + res.status));
    return data.post;
  }
  async function reportPost(id){
    const reason = prompt('Report reason:'); if (!reason) return;
    try {
      const res = await fetch(REPORT_ROUTE, { method:'POST', cache:'no-store', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' }, body: JSON.stringify({ id, board: BOARD, reason }) });
      const data = await parse(res);
      if (!res.ok || data.ok === false) throw new Error((data && data.error) || 'persistent report failed');
      alert('Report saved persistently.');
    } catch (err) { alert(systemErrorLabel('Report not saved', err)); }
  }

  if (unlockButton) unlockButton.addEventListener('click', function(){ try { localStorage.setItem(PASS_KEY, 'yes'); } catch {} applyLock(); if (status) status.textContent = 'Signal Pass unlocked. Persistent posting is open for ' + BOARD_LABEL + '.'; if (submitSection) submitSection.scrollIntoView({ behavior:'smooth', block:'start' }); });
  if (feed) feed.addEventListener('click', function(event){ const button = event.target.closest('.report-signal'); if (button) reportPost(button.getAttribute('data-id')); });
  if (form) form.addEventListener('submit', async function(event){
    event.preventDefault();
    lockFormToBoard();
    if (!unlocked()) { status.textContent = 'Unlock Signal Pass before posting.'; const gate = document.getElementById('signal-pass'); if (gate) gate.scrollIntoView({ behavior:'smooth', block:'start' }); return; }
    const payload = Object.fromEntries(new FormData(form).entries()); payload.board = BOARD;
    if (payload.website) { status.textContent = 'Spam trap triggered.'; return; }
    status.textContent = 'Saving persistent post to ' + BOARD_LABEL + '...';
    try {
      const livePost = await postLive(payload);
      form.reset();
      lockFormToBoard();
      status.textContent = 'Signal posted live and saved persistently on ' + BOARD_LABEL + '.';
      if (feed) feed.innerHTML = renderPost(livePost) + (feed.innerHTML || '');
      await loadFeed();
      applyLock();
    } catch (err) {
      status.textContent = systemErrorLabel('Post not saved persistently', err);
      if (feed) feed.innerHTML = offlineNotice(status.textContent) + (feed.innerHTML || '');
      applyLock();
    }
  });

  lockFormToBoard();
  applyLock();
  loadFeed();
})();
