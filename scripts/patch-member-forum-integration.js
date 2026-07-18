const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = relative => path.join(root, relative);
const changed = [];

function read(relative) {
  return fs.readFileSync(at(relative), 'utf8');
}
function write(relative, content) {
  fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
  const before = fs.existsSync(at(relative)) ? fs.readFileSync(at(relative), 'utf8') : '';
  if (before === content) return false;
  fs.writeFileSync(at(relative), content);
  changed.push(relative);
  return true;
}
function replaceOrFail(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`${label} anchor is missing`);
  return source.replace(anchor, replacement);
}

// Export the same secure session resolver used by the member dashboard so the
// forum cannot invent a second authentication system.
{
  const relative = 'src/worker-member-experience.js';
  let source = read(relative);
  if (!source.includes('export async function memberSessionContext')) {
    source = replaceOrFail(
      source,
      'async function requireAuth(request,env)',
      'export async function memberSessionContext(request,env){return authContext(request,env);}\nasync function requireAuth(request,env)',
      'member-session export'
    );
  }
  write(relative, source);
}

// Make D1 forum posting accountable to a verified free member session while
// leaving all reading routes public.
{
  const relative = 'src/worker-forum-persistence.js';
  let source = read(relative);
  if (!source.includes("memberSessionContext")) {
    source = replaceOrFail(
      source,
      "import legacyWorker from './worker.js';",
      "import legacyWorker from './worker.js';\nimport { memberSessionContext } from './worker-member-experience.js';",
      'forum member import'
    );
  }
  if (!source.includes("member_id TEXT NOT NULL DEFAULT ''")) {
    source = replaceOrFail(
      source,
      '          id TEXT PRIMARY KEY,\n          board TEXT NOT NULL,',
      "          id TEXT PRIMARY KEY,\n          member_id TEXT NOT NULL DEFAULT '',\n          board TEXT NOT NULL,",
      'forum member column'
    );
  }
  if (!source.includes('idx_forum_posts_member_created')) {
    source = replaceOrFail(
      source,
      '      for (const sql of statements) await env.MEMBERS_DB.prepare(sql).run();\n      return true;',
      "      for (const sql of statements) await env.MEMBERS_DB.prepare(sql).run();\n      await env.MEMBERS_DB.prepare(\"ALTER TABLE forum_posts ADD COLUMN member_id TEXT NOT NULL DEFAULT ''\").run().catch(() => null);\n      await env.MEMBERS_DB.prepare('CREATE INDEX IF NOT EXISTS idx_forum_posts_member_created ON forum_posts(member_id, created_at DESC)').run();\n      return true;",
      'forum member migration'
    );
  }
  source = source.replace(
    "async function insertPost(env, post, origin = 'd1') {",
    "async function insertPost(env, post, origin = 'd1', memberId = '') {"
  );
  source = source.replace(
    '(id, board, title, body, category, display_name, source_url, created_at, approved_at, status, storage_origin, updated_at)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    '(id, member_id, board, title, body, category, display_name, source_url, created_at, approved_at, status, storage_origin, updated_at)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  source = source.replace(
    ').bind(p.id, p.board, p.title, p.body, p.category, p.name, p.sourceUrl, p.createdAt, p.approvedAt, p.status, origin, now).run();',
    ").bind(p.id, clean(memberId, 160), p.board, p.title, p.body, p.category, p.name, p.sourceUrl, p.createdAt, p.approvedAt, p.status, origin, now).run();"
  );
  if (!source.includes("postingAccess: 'verified-free-member-session'")) {
    source = replaceOrFail(
      source,
      "      persistent: true,\n      indexSelfHealing: 'D1 authoritative; KV mirror rebuilt from D1',",
      "      persistent: true,\n      postingAccess: 'verified-free-member-session',\n      readingAccess: 'public',\n      indexSelfHealing: 'D1 authoritative; KV mirror rebuilt from D1',",
      'forum health access policy'
    );
  }
  const submitStart = source.indexOf("  if (route.action === 'submit') {");
  const reportStart = source.indexOf("  if (route.action === 'report') {", submitStart);
  if (submitStart < 0 || reportStart < 0) throw new Error('forum submit block is missing');
  const currentSubmit = source.slice(submitStart, reportStart);
  if (!currentSubmit.includes('verified free member account')) {
    const replacement = `  if (route.action === 'submit') {
    const auth = await memberSessionContext(request, env);
    if (!auth || !auth.member || !auth.member.email_verified_at) {
      return response({
        ok: false,
        authenticated: false,
        saved: false,
        persistent: true,
        error: 'A verified free member account is required to post.',
        loginUrl: '/member-login.html',
        signupUrl: '/membership.html'
      }, 401);
    }
    const input = await body(request);
    if (input.website) return response({ ok: false, error: 'Spam trap triggered' }, 400);
    const post = safePost({
      id: makeId(),
      board: route.board || input.board,
      title: input.title || 'Reader Signal',
      body: input.body || input.message || 'Reader submitted a source lead for review.',
      category: input.category || 'Signal',
      name: input.name || auth.member.display_name || 'Matrix Member',
      sourceUrl: input.sourceUrl || input.source || '',
      status: 'live'
    });
    await insertPost(env, post, 'd1-member-submit', auth.member.id);
    await env.MEMBERS_DB.prepare('INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(makeId('audit'), auth.member.id, 'forum.post.created', 'forum_post', post.id, JSON.stringify({ board: post.board, sourceUrl: post.sourceUrl || '' }), new Date().toISOString()).run().catch(() => null);
    if (ctx?.waitUntil) ctx.waitUntil(Promise.allSettled([mirrorPost(env, post), syncKvMirror(env)]));
    return response({
      ok: true,
      authenticated: true,
      persistent: true,
      saved: true,
      storage: 'Cloudflare D1 MEMBERS_DB.forum_posts',
      mirroredToKv: Boolean(env.FORUM_POSTS),
      board: post.board,
      boardLabel: boardLabels[post.board],
      memberTier: auth.entitlement?.effective_tier || 'registered',
      post
    }, 201);
  }
`;
    source = source.slice(0, submitStart) + replacement + source.slice(reportStart);
  }
  write(relative, source);
}

const forumClient = String.raw`(function(){
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
`;
write('forum.js', forumClient);

const forumPages = ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html'];
for (const relative of forumPages) {
  if (!fs.existsSync(at(relative))) continue;
  let html = read(relative);
  html = html
    .replace(/Reading is free\. Posting uses a small Signal Pass anti-spam gate for posting\./gi, 'Reading is public. Posting requires a verified free member account.')
    .replace(/Reading is free\. Posting uses a small Signal Pass anti-spam gate\./gi, 'Reading is public. Posting requires a verified free member account.')
    .replace(/Signal Pass required to post/gi, 'Verified free member account required to post')
    .replace(/Posts appear publicly by default after Signal Pass unlock\./gi, 'Posts appear publicly after verified member sign-in.')
    .replace(/Signal Pass is an anti-spam gate, not ideological approval\./gi, 'Verified member posting provides accountability without charging for speech.')
    .replace(/Posting is locked until Signal Pass is unlocked on this device\./gi, 'Posting requires a verified free member account.')
    .replace(/<aside class="card redline"><h2>Signal Pass<\/h2>[\s\S]*?<\/aside>/i, '<aside class="card redline"><h2>Verified Member Posting</h2><p>Reading stays public. Posting uses the free passwordless member account so the server can enforce session controls and record abuse without pretending a browser button proves payment.</p><div class="cta-row small"><a class="btn" href="member-login.html">Sign In</a><a class="btn alt" href="membership.html">Create Free Account</a></div></aside>')
    .replace(/<section id="signal-pass"[\s\S]*?<\/section>/i, '<section id="signal-pass" class="section wrap split"><div class="card redline"><h2>Verified Member Posting</h2><p>The board is free to read. A verified Free Member account unlocks posting across devices and gives you session controls.</p><p id="forum-member-status" class="form-status pending">Checking your member session…</p><div class="cta-row small"><a class="btn" href="member-login.html">Sign In</a><a class="btn alt" href="membership.html">Create Free Account</a></div></div><aside class="card"><h2>Reader Promise</h2><p>Membership does not buy agreement or ideological approval. The hard floor remains: no threats, doxxing, private victim names, spam or illegal content.</p></aside></section>');
  html = html.replace(/<a[^>]+href="https:\/\/www\.paypal\.me\/njmgroup\/1"[^>]*>[^<]*<\/a>/gi, '');
  html = html.replace(/Pay €1[^<]*/gi, '');
  html = html.replace(/I(?:’|')ve Paid[^<]*/gi, '');
  if (!html.includes('id="forum-member-status"')) throw new Error(`${relative} member status block was not installed`);
  if (/paypal\.me|I(?:’|')ve Paid|localStorage/i.test(html)) throw new Error(`${relative} still exposes the false Signal Pass`);
  write(relative, html);
}

fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/member-forum-integration-patch.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  membershipPrices: { free: 0, supporter: 3, intelligence: 6, researchPro: 9 },
  forumReading: 'public',
  forumPosting: 'verified free member session',
  paymentGateRemoved: true,
  boundary: 'No browser-only switch may claim that payment, authentication or entitlement has been verified.'
}, null, 2));
console.log(`Member/forum integration patched: ${changed.length ? changed.join(', ') : 'already current'}.`);
