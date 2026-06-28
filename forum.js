(function(){
  const form = document.getElementById('signal-board-form');
  const status = document.getElementById('signal-form-status');
  const feed = document.getElementById('signal-board-feed');
  const unlockButton = document.getElementById('unlock-signal-pass');
  const passStatus = document.getElementById('signal-pass-status');
  const submitSection = document.getElementById('submit-signal');
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
  const BOARD_LABELS = { main: 'Main Signal Board', speculation: 'Dark Speculation Board', 'epstein-alive': 'Epstein Alive / Sighting Board' };
  const BOARD_LABEL = BOARD_LABELS[BOARD] || 'Signal Board';
  const PASS_KEY = 'matrix_signal_pass_unlocked_v1';
  const LOCAL_POSTS_KEY = 'matrix_signal_board_posts_v2_' + BOARD;
  const LOCAL_REPORTS_KEY = 'matrix_signal_board_reports_v2_' + BOARD;
  const FEED_ROUTES = { main: '/forum-feed-main', speculation: '/forum-feed-speculation', 'epstein-alive': '/forum-feed-epstein-alive' };
  const SUBMIT_ROUTES = { main: '/submit-main-post', speculation: '/submit-speculation-post', 'epstein-alive': '/submit-epstein-alive-post' };
  const REPORT_ROUTES = { main: '/report-main-post', speculation: '/report-speculation-post', 'epstein-alive': '/report-epstein-alive-post' };
  const FEED_ROUTE = FEED_ROUTES[BOARD] || '/forum-feed-main';
  const SUBMIT_ROUTE = SUBMIT_ROUTES[BOARD] || '/submit-main-post';
  const REPORT_ROUTE = REPORT_ROUTES[BOARD] || '/report-main-post';
  let fallbackMode = false;
  let lastSystemError = '';

  function esc(s){ return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function when(value){ try { return new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return ''; } }
  function unlocked(){ try { return localStorage.getItem(PASS_KEY) === 'yes'; } catch { return false; } }
  function localPosts(){ try { return JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY) || '[]'); } catch { return []; } }
  function saveLocalPosts(posts){ try { localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts.slice(0, 50))); } catch {} }
  function saveLocalReport(report){ try { const reports = JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]'); reports.unshift(report); localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports.slice(0, 50))); } catch {} }
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
    if (lockMessage) lockMessage.textContent = ok ? 'Signal Pass unlocked. Posting is open for ' + BOARD_LABEL + '.' : 'Posting is locked until Signal Pass is unlocked.';
    if (passStatus) passStatus.textContent = ok ? 'Signal Pass unlocked. You can now post to ' + BOARD_LABEL + '.' : 'Signal Pass not unlocked yet.';
  }
  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    const local = post.localOnly ? ' <span class="pill">pending sync</span>' : '';
    const board = post.board ? ' <span class="pill">' + esc(BOARD_LABELS[post.board] || post.board) + '</span>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title || 'Signal') + '</h3><p>' + esc(post.body || post.message || '') + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Anonymous') + '</span> <span class="pill">' + esc(when(post.approvedAt || post.createdAt || post.timestamp)) + '</span>' + board + local + '</p><button class="btn alt report-signal" type="button" data-id="' + esc(post.id) + '">Report post</button></article>';
  }
  function fallbackNotice(){
    return '<article class="card redline"><span class="label">Signal Board</span><h3>' + esc(BOARD_LABEL) + ' is syncing</h3><p>Fresh signals may take a moment to appear. You can keep reading the board or submit a source drop; it will be held safely while the live feed refreshes.</p></article>';
  }
  function postBelongsHere(post){ const board = String(post.board || 'main'); if (board === BOARD) return true; if (BOARD === 'main' && board !== 'speculation' && board !== 'epstein-alive') return true; return false; }
  async function loadFallback(){
    fallbackMode = true;
    let seed = [];
    try { const res = await fetch('data/forum-seed.json', { headers: { 'Accept': 'application/json' } }); if (res.ok) { const data = await res.json(); seed = Array.isArray(data.posts) ? data.posts.filter(postBelongsHere) : []; } } catch {}
    const posts = localPosts().concat(seed).filter(postBelongsHere);
    feed.innerHTML = fallbackNotice() + (posts.length ? posts.map(renderPost).join('') : '');
  }
  async function loadFeed(){
    if (!feed) return;
    lockFormToBoard();
    try {
      fallbackMode = false;
      lastSystemError = '';
      const res = await fetch(FEED_ROUTE, { headers: { 'Accept': 'application/json' } });
      const data = await parse(res);
      if (!res.ok || data.ok === false) throw new Error('feed unavailable');
      const posts = listFrom(data).filter(postBelongsHere);
      feed.innerHTML = posts.length ? posts.map(renderPost).join('') : '<article class="card redline"><h3>No signals yet</h3><p>' + esc(BOARD_LABEL) + ' is open. Unlock a Signal Pass and post a source, question, reader note, or public-record lead.</p></article>';
    } catch (err) { lastSystemError = systemErrorLabel('Feed refresh delayed', err); await loadFallback(); }
  }
  async function reportPost(id){
    const reason = prompt('Report reason:'); if (!reason) return;
    if (fallbackMode) { saveLocalReport({ id, board: BOARD, reason, createdAt: new Date().toISOString() }); alert('Report received.'); return; }
    try { const res = await fetch(REPORT_ROUTE, { method:'POST', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' }, body: JSON.stringify({ id, board: BOARD, reason }) }); const data = await parse(res); if (!res.ok || data.ok === false) throw new Error('report unavailable'); alert('Report received.'); }
    catch (err) { saveLocalReport({ id, board: BOARD, reason, createdAt: new Date().toISOString() }); alert('Report received.'); }
  }
  if (unlockButton) unlockButton.addEventListener('click', function(){ try { localStorage.setItem(PASS_KEY, 'yes'); } catch {} applyLock(); if (status) status.textContent = 'Signal Pass unlocked. You can now post to ' + BOARD_LABEL + '.'; if (submitSection) submitSection.scrollIntoView({ behavior:'smooth', block:'start' }); });
  if (feed) feed.addEventListener('click', function(event){ const button = event.target.closest('.report-signal'); if (button) reportPost(button.getAttribute('data-id')); });
  if (form) form.addEventListener('submit', async function(event){
    event.preventDefault();
    lockFormToBoard();
    if (!unlocked()) { status.textContent = 'Unlock Signal Pass before posting.'; const gate = document.getElementById('signal-pass'); if (gate) gate.scrollIntoView({ behavior:'smooth', block:'start' }); return; }
    const payload = Object.fromEntries(new FormData(form).entries()); payload.board = BOARD;
    if (payload.website) { status.textContent = 'Spam trap triggered.'; return; }
    status.textContent = 'Posting to ' + BOARD_LABEL + '...';
    try { const res = await fetch(SUBMIT_ROUTE, { method:'POST', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' }, body: JSON.stringify(payload) }); const data = await parse(res); if (!res.ok || data.ok === false) throw new Error('post unavailable'); form.reset(); lockFormToBoard(); status.textContent = 'Signal posted. It is now live on ' + BOARD_LABEL + '.'; await loadFeed(); applyLock(); }
    catch (err) { const post = Object.assign({}, payload, { id:'local-' + Date.now(), board: BOARD, createdAt: new Date().toISOString(), localOnly:true }); const posts = localPosts(); posts.unshift(post); saveLocalPosts(posts); form.reset(); lockFormToBoard(); lastSystemError = systemErrorLabel('Post sync delayed', err); status.textContent = 'Signal received. It may take a moment to appear on the live board.'; await loadFallback(); applyLock(); }
  });
  lockFormToBoard();
  applyLock();
  loadFeed();
})();
