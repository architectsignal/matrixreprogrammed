(function(){
  const form = document.getElementById('signal-board-form');
  const status = document.getElementById('signal-form-status');
  const feed = document.getElementById('signal-board-feed');
  const memberStatus = document.getElementById('forum-member-status');
  const submitSection = document.getElementById('submit-signal');

  const BOARD_LABELS = { main: 'Main Signal Board', speculation: 'Dark Speculation Board', 'epstein-alive': 'Epstein Alive / Sighting Board' };
  const FEED_ROUTES = { main: '/forum-feed-main', speculation: '/forum-feed-speculation', 'epstein-alive': '/forum-feed-epstein-alive' };
  const SUBMIT_ROUTES = { main: '/submit-main-post', speculation: '/submit-speculation-post', 'epstein-alive': '/submit-epstein-alive-post' };
  const REPORT_ROUTES = { main: '/report-main-post', speculation: '/report-speculation-post', 'epstein-alive': '/report-epstein-alive-post' };
  let member = null;

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
    return raw === 'main' ? 'main' : '';
  }
  const boardRoot = document.querySelector('[data-board]') || document.body;
  const BOARD = cleanBoard((boardRoot && boardRoot.getAttribute('data-board')) || (form && form.getAttribute('data-board')) || '') || boardFromPath();
  const BOARD_LABEL = BOARD_LABELS[BOARD] || 'Signal Board';
  const FEED_ROUTE = FEED_ROUTES[BOARD] || FEED_ROUTES.main;
  const SUBMIT_ROUTE = SUBMIT_ROUTES[BOARD] || SUBMIT_ROUTES.main;
  const REPORT_ROUTE = REPORT_ROUTES[BOARD] || REPORT_ROUTES.main;

  function esc(value){ return String(value || '').replace(/[&<>\"]/g, function(char){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'})[char]; }); }
  function when(value){ try { return new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return ''; } }
  async function parse(response){ const text = await response.text(); try { return JSON.parse(text); } catch { return { error: text || ('HTTP ' + response.status) }; } }
  function listFrom(data){ return Array.isArray(data) ? data : (data && Array.isArray(data.posts) ? data.posts : []); }
  function systemErrorLabel(prefix, error){ return prefix + ': ' + (error && error.message ? error.message : String(error || 'request failed')); }
  function isPublicUserPost(post){
    if (!post || typeof post !== 'object') return false;
    const postStatus = String(post.status || 'live').toLowerCase();
    if (['hidden','test','synthetic','draft','deleted','reported','spam','qa','check'].includes(postStatus)) return false;
    const text = [post.id,post.title,post.body,post.message,post.category,post.name,post.sourceUrl].map(function(value){ return String(value || '').toLowerCase(); }).join(' ');
    return !/synthetic|smoke test|health check|demo post|fixture|qa post|seed post|system check|pressure test/.test(text);
  }
  function lockFormToBoard(){
    if (!form) return;
    form.setAttribute('data-board', BOARD);
    let hidden = form.querySelector('input[name="board"]');
    if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'board'; form.prepend(hidden); }
    hidden.value = BOARD;
  }
  function applyMemberState(){
    lockFormToBoard();
    const active = Boolean(member);
    if (submitSection) submitSection.classList.toggle('signal-locked', !active);
    if (form) Array.from(form.elements).forEach(function(control){ if (control.name !== 'website') control.disabled = !active; });
    const message = document.querySelector('.signal-lock-message');
    if (message) message.innerHTML = active
      ? 'Signed in as <strong>' + esc(member.displayName || 'Matrix Member') + '</strong>. Posts are saved persistently to ' + esc(BOARD_LABEL) + '.'
      : 'Posting requires a verified free member account. <a href="member-login.html?return=' + encodeURIComponent(location.pathname) + '">Sign in</a> or <a href="membership.html">create a free account</a>.';
    if (memberStatus) {
      memberStatus.className = 'form-status ' + (active ? 'ok' : 'pending');
      memberStatus.textContent = active ? 'Verified member session active. Posting is unlocked.' : 'Reading is public. Sign in with a verified free account to post.';
    }
  }
  async function checkMember(){
    try {
      const response = await fetch('/api/member/me', { cache:'no-store', headers:{ Accept:'application/json' } });
      const data = await parse(response);
      member = response.ok && data.authenticated === true && data.member ? data.member : null;
    } catch { member = null; }
    applyMemberState();
  }
  function postBelongsHere(post){ return String(post && post.board || 'main') === BOARD; }
  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    const board = post.board ? ' <span class="pill">' + esc(BOARD_LABELS[post.board] || post.board) + '</span>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title || 'Signal') + '</h3><p>' + esc(post.body || post.message || '') + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Member') + '</span> <span class="pill">' + esc(when(post.approvedAt || post.createdAt || post.timestamp)) + '</span>' + board + ' <span class="pill">persistent D1</span></p><button class="btn alt report-signal" type="button" data-id="' + esc(post.id) + '">Report post</button></article>';
  }
  function offlineNotice(message){ return '<article class="card redline"><h3>' + esc(BOARD_LABEL) + ' cannot load right now</h3><p>No browser-only copy is shown as live. Try again after the D1 backend is healthy.</p><p><strong>Detail:</strong> ' + esc(message || 'feed unavailable') + '</p><p><a class="btn alt" href="/forum-health">Check forum health</a></p></article>'; }
  async function loadFeed(){
    if (!feed) return;
    feed.innerHTML = '<article class="card"><span class="label">pending sync</span><h3>Signal Board is syncing</h3><p>Checking the authoritative Cloudflare D1 feed for ' + esc(BOARD_LABEL) + '.</p></article>';
    try {
      const response = await fetch(FEED_ROUTE + '?t=' + Date.now(), { cache:'no-store', headers:{ Accept:'application/json' } });
      const data = await parse(response);
      if (!response.ok || data.ok === false || data.persistent !== true) throw new Error(data.error || 'persistent feed unavailable');
      const posts = listFrom(data).filter(postBelongsHere).filter(isPublicUserPost);
      feed.innerHTML = posts.length ? posts.map(renderPost).join('') : '<article class="card redline"><h3>No persistent signals yet</h3><p>' + esc(BOARD_LABEL) + ' is connected. Verified members can post a source, question or public-record lead.</p></article>';
    } catch (error) { feed.innerHTML = offlineNotice(systemErrorLabel('Feed failed', error)); }
  }
  async function postLive(payload){
    const response = await fetch(SUBMIT_ROUTE, { method:'POST', cache:'no-store', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(payload) });
    const data = await parse(response);
    if (response.status === 401) { member = null; applyMemberState(); }
    if (!response.ok || data.ok === false || data.persistent !== true || !data.post || !data.post.id) throw new Error(data.error || ('persistent post failed HTTP ' + response.status));
    return data.post;
  }
  async function reportPost(id){
    const reason = prompt('Report reason:'); if (!reason) return;
    try {
      const response = await fetch(REPORT_ROUTE, { method:'POST', cache:'no-store', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify({ id:id, board:BOARD, reason:reason }) });
      const data = await parse(response);
      if (!response.ok || data.ok === false) throw new Error(data.error || 'persistent report failed');
      alert('Report saved persistently.');
    } catch (error) { alert(systemErrorLabel('Report not saved', error)); }
  }

  if (feed) feed.addEventListener('click', function(event){ const button = event.target.closest('.report-signal'); if (button) reportPost(button.getAttribute('data-id')); });
  if (form) form.addEventListener('submit', async function(event){
    event.preventDefault();
    lockFormToBoard();
    if (!member) { status.innerHTML = 'Sign in with a <a href="member-login.html?return=' + encodeURIComponent(location.pathname) + '">verified free member account</a> before posting.'; return; }
    const payload = Object.fromEntries(new FormData(form).entries()); payload.board = BOARD;
    if (payload.website) { status.textContent = 'Spam trap triggered.'; return; }
    status.textContent = 'Saving persistent post to ' + BOARD_LABEL + '...';
    try {
      const livePost = await postLive(payload);
      form.reset(); lockFormToBoard();
      status.textContent = 'Signal posted live and saved persistently on ' + BOARD_LABEL + '.';
      if (feed && isPublicUserPost(livePost)) feed.innerHTML = renderPost(livePost) + (feed.innerHTML || '');
      await loadFeed(); applyMemberState();
    } catch (error) { status.textContent = systemErrorLabel('Post not saved persistently', error); applyMemberState(); }
  });

  lockFormToBoard();
  Promise.all([checkMember(), loadFeed()]);
})();
