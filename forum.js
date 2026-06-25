(function(){
  const form = document.getElementById('signal-board-form');
  const status = document.getElementById('signal-form-status');
  const feed = document.getElementById('signal-board-feed');
  const unlockButton = document.getElementById('unlock-signal-pass');
  const passStatus = document.getElementById('signal-pass-status');
  const submitSection = document.getElementById('submit-signal');
  const PASS_KEY = 'matrix_signal_pass_unlocked_v1';
  const LOCAL_POSTS_KEY = 'matrix_signal_board_posts_v1';
  const LOCAL_REPORTS_KEY = 'matrix_signal_board_reports_v1';
  const API_ROUTE = '/api/forum';
  let staticMode = false;

  function esc(s){
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function shortDate(value){
    try { return new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return ''; }
  }

  function hasSignalPass(){
    try { return localStorage.getItem(PASS_KEY) === 'yes'; } catch { return false; }
  }

  function readLocalPosts(){
    try { return JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY) || '[]'); } catch { return []; }
  }

  function writeLocalPosts(posts){
    try { localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts.slice(0, 50))); } catch {}
  }

  function writeLocalReport(report){
    try {
      const reports = JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
      reports.unshift(report);
      localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports.slice(0, 50)));
    } catch {}
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
    if (lockMessage) lockMessage.textContent = unlocked ? 'Signal Pass unlocked on this device. Posting is open.' : 'Posting is locked until Signal Pass is unlocked on this device.';
    if (passStatus) passStatus.textContent = unlocked ? 'Signal Pass unlocked. You can now post.' : 'Signal Pass not unlocked on this device yet.';
  }

  async function readResponse(res){
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { error: text || ('HTTP ' + res.status) }; }
  }

  function normalizePosts(data){
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.posts)) return data.posts;
    return [];
  }

  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    const local = post.localOnly ? ' <span class="pill">saved on this device</span>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title || 'Signal') + '</h3><p>' + esc(post.body || post.message || '') + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Anonymous') + '</span> <span class="pill">' + esc(shortDate(post.approvedAt || post.createdAt || post.timestamp)) + '</span>' + local + '</p><button class="btn alt report-signal" type="button" data-id="' + esc(post.id) + '">Report hard-floor violation</button></article>';
  }

  function staticNotice(){
    return '<article class="card redline"><span class="label">Local fallback</span><h3>Board backend unavailable on this request</h3><p>The forum page still works. Public posting uses the Cloudflare Pages API at /api/forum when the FORUM_POSTS KV binding is connected. If the API is unavailable, new posts are saved on this device.</p><div class="cta-row small"><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="live-intel.html">Live Intel</a></div></article>';
  }

  async function loadStaticFeed(){
    staticMode = true;
    let seed = [];
    try {
      const res = await fetch('data/forum-seed.json', { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        seed = Array.isArray(data.posts) ? data.posts : [];
      }
    } catch {}
    const local = readLocalPosts();
    const posts = local.concat(seed);
    if (!posts.length) {
      feed.innerHTML = staticNotice();
      return;
    }
    feed.innerHTML = staticNotice() + posts.map(renderPost).join('');
  }

  async function loadFeed(){
    if (!feed) return;
    try {
      staticMode = false;
      const res = await fetch(API_ROUTE, { headers: { 'Accept': 'application/json' } });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || ('Feed failed with HTTP ' + res.status));
      const posts = normalizePosts(data);
      if (!posts.length) {
        feed.innerHTML = '<article class="card redline"><h3>No signals yet</h3><p>The board is open. Unlock a Signal Pass and post a source, question, reader note, or human-cost update.</p></article>';
        return;
      }
      feed.innerHTML = posts.map(renderPost).join('');
    } catch (err) {
      await loadStaticFeed();
    }
  }

  async function reportPost(id){
    const reason = prompt('Report reason: hard-floor violation?');
    if (!reason) return;
    if (staticMode) {
      writeLocalReport({ id, reason, createdAt: new Date().toISOString() });
      alert('Report saved on this device. Public moderation requires the Worker/KV backend.');
      return;
    }
    try {
      const res = await fetch(API_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ action: 'report', id, reason })
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || ('Report failed with HTTP ' + res.status));
      alert('Report received. The post remains public unless removed after review.');
    } catch (err) {
      writeLocalReport({ id, reason, createdAt: new Date().toISOString() });
      alert('Report saved on this device. Public moderation backend is not available on this host yet.');
    }
  }

  if (unlockButton) {
    unlockButton.addEventListener('click', function(){
      try { localStorage.setItem(PASS_KEY, 'yes'); } catch {}
      applySignalPassState();
      if (status) status.textContent = 'Signal Pass unlocked. You can now post.';
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
      if (payload.website) {
        status.textContent = 'Spam trap triggered.';
        return;
      }
      try {
        const res = await fetch(API_ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await readResponse(res);
        if (!res.ok) throw new Error(data.error || ('Post failed with HTTP ' + res.status));
        form.reset();
        status.textContent = 'Signal posted. It is now live on the board.';
        await loadFeed();
        applySignalPassState();
      } catch (err) {
        const localPost = Object.assign({}, payload, {
          id: 'local-' + Date.now(),
          createdAt: new Date().toISOString(),
          localOnly: true
        });
        const posts = readLocalPosts();
        posts.unshift(localPost);
        writeLocalPosts(posts);
        form.reset();
        status.textContent = 'Forum API unavailable: signal saved on this device. Add/check the FORUM_POSTS KV binding for public posting.';
        await loadStaticFeed();
        applySignalPassState();
      }
    });
  }

  applySignalPassState();
  loadFeed();
})();
