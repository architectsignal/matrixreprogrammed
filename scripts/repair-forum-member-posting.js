const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
const VERSION = '20260720-forum-member-posting-v3';
const CANONICAL_ORIGIN = 'https://matrixreprogrammed.com';

function at(relative) {
  return path.join(root, relative);
}
function read(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) throw new Error(`Required forum file is missing: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}
function write(relative, content) {
  const file = at(relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (before === content) return false;
  fs.writeFileSync(file, content);
  changed.push(relative);
  return true;
}
function replaceOrFail(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label} anchor is missing`);
  return source.replace(before, after);
}

// Use a new domain-wide session cookie so apex and www never become two
// different logged-in states. Keep the old cookie as a temporary read fallback.
{
  const relative = 'src/worker.js';
  let source = read(relative);
  source = replaceOrFail(
    source,
    "function authCookieValue(request){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const pair=part.trim().split('=');if(pair.shift()==='matrix_session')return decodeURIComponent(pair.join('='))}return''}",
    "function authCookieValue(request){const raw=request.headers.get('cookie')||'';const values={};for(const part of raw.split(';')){const pair=part.trim().split('=');const name=pair.shift();if(name&&!Object.prototype.hasOwnProperty.call(values,name))values[name]=decodeURIComponent(pair.join('='))}return values.matrix_session_v2||values.matrix_session||''}",
    'legacy Worker session-cookie reader'
  );
  source = replaceOrFail(
    source,
    "function authSessionCookie(token,maxAge=2592000){return 'matrix_session='+encodeURIComponent(token)+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax'}",
    "function authSessionCookie(token,maxAge=2592000){return 'matrix_session_v2='+encodeURIComponent(token)+'; Domain=matrixreprogrammed.com; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax'}",
    'domain-wide session cookie'
  );
  source = replaceOrFail(
    source,
    "function authClearCookie(){return 'matrix_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'}",
    "function authClearCookie(){return 'matrix_session_v2=; Domain=matrixreprogrammed.com; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'}",
    'domain-wide session clear cookie'
  );
  source = replaceOrFail(
    source,
    "function authOrigin(request){const url=new URL(request.url);return ['matrixreprogrammed.com','www.matrixreprogrammed.com'].includes(url.hostname)?url.origin:'https://matrixreprogrammed.com'}",
    "function authOrigin(request){return 'https://matrixreprogrammed.com'}",
    'canonical member origin'
  );
  write(relative, source);
}

// The member dashboard and the forum must resolve exactly the same v2 session.
{
  const relative = 'src/worker-member-experience.js';
  let source = read(relative);
  source = replaceOrFail(
    source,
    "  const rawToken=cookieValue(request,'matrix_session');",
    "  const rawToken=cookieValue(request,'matrix_session_v2')||cookieValue(request,'matrix_session');",
    'member session v2 fallback'
  );
  write(relative, source);
}

// A forum write is successful only after the exact row can be read back from D1.
{
  const relative = 'src/worker-forum-persistence.js';
  let source = read(relative);
  source = source.replace('INSERT OR IGNORE INTO forum_posts', 'INSERT INTO forum_posts');
  const before = `  await env.MEMBERS_DB.prepare(
    \`INSERT INTO forum_posts
      (id, member_id, board, title, body, category, display_name, source_url, created_at, approved_at, status, storage_origin, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`
  ).bind(p.id, clean(memberId, 160), p.board, p.title, p.body, p.category, p.name, p.sourceUrl, p.createdAt, p.approvedAt, p.status, origin, now).run();
  return p;`;
  const after = `  const memberKey = clean(memberId, 160);
  const result = await env.MEMBERS_DB.prepare(
    \`INSERT INTO forum_posts
      (id, member_id, board, title, body, category, display_name, source_url, created_at, approved_at, status, storage_origin, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`
  ).bind(p.id, memberKey, p.board, p.title, p.body, p.category, p.name, p.sourceUrl, p.createdAt, p.approvedAt, p.status, origin, now).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('D1 did not confirm the forum insert');
  const stored = await env.MEMBERS_DB.prepare(
    \`SELECT id, board, title, body, category, display_name AS name, source_url AS sourceUrl,
            created_at AS createdAt, approved_at AS approvedAt, status
       FROM forum_posts WHERE id=? AND member_id=? LIMIT 1\`
  ).bind(p.id, memberKey).first();
  if (!stored || stored.id !== p.id) throw new Error('D1 forum read-after-write confirmation failed');
  return safePost(stored);`;
  source = replaceOrFail(source, before, after, 'D1 forum read-after-write confirmation');
  write(relative, source);
}

const forumClient = `(function(){
  'use strict';
  const CANONICAL_ORIGIN = '${CANONICAL_ORIGIN}';
  if (location.hostname === 'www.matrixreprogrammed.com') {
    location.replace(CANONICAL_ORIGIN + location.pathname + location.search + location.hash);
    return;
  }

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
  const LOGIN_URL = CANONICAL_ORIGIN + '/member-login.html?return=' + encodeURIComponent(location.pathname + location.search + location.hash);

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
    const active = Boolean(member && member.emailVerifiedAt);
    if (submitSection) submitSection.classList.toggle('signal-locked', !active);
    if (form) Array.from(form.elements).forEach(function(control){ if (control.name !== 'website') control.disabled = !active; });
    const message = document.querySelector('.signal-lock-message');
    if (message) message.innerHTML = active
      ? 'Signed in as <strong>' + esc(member.displayName || 'Matrix Member') + '</strong>. Every accepted post is confirmed by a D1 read-after-write check.'
      : 'Posting requires a verified free member account. <a href="' + esc(LOGIN_URL) + '">Sign in again</a> to establish the shared secure session.';
    if (memberStatus) {
      memberStatus.className = 'form-status ' + (active ? 'ok' : 'pending');
      memberStatus.textContent = active ? 'Verified member session active. Persistent posting is unlocked.' : 'No verified shared session was found on this domain. Sign in again to post.';
    }
  }
  async function checkMember(){
    try {
      const response = await fetch('/api/member/me?forum_session=' + Date.now(), { credentials:'include', cache:'no-store', headers:{ Accept:'application/json', 'Cache-Control':'no-cache' } });
      const data = await parse(response);
      member = response.ok && data.authenticated === true && data.member && data.member.emailVerifiedAt ? data.member : null;
    } catch { member = null; }
    applyMemberState();
    return member;
  }
  function postBelongsHere(post){ return String(post && post.board || 'main') === BOARD; }
  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    const board = post.board ? ' <span class="pill">' + esc(BOARD_LABELS[post.board] || post.board) + '</span>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title || 'Signal') + '</h3><p>' + esc(post.body || post.message || '') + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Member') + '</span> <span class="pill">' + esc(when(post.approvedAt || post.createdAt || post.timestamp)) + '</span>' + board + ' <span class="pill">persistent D1 confirmed</span></p><button class="btn alt report-signal" type="button" data-id="' + esc(post.id) + '">Report post</button></article>';
  }
  function offlineNotice(message){ return '<article class="card redline"><h3>' + esc(BOARD_LABEL) + ' cannot load right now</h3><p>No browser-only copy is shown as live.</p><p><strong>Detail:</strong> ' + esc(message || 'feed unavailable') + '</p><p><a class="btn alt" href="/forum-health">Check forum health</a></p></article>'; }
  async function loadFeed(){
    if (!feed) return;
    feed.innerHTML = '<article class="card"><span class="label">pending sync</span><h3>Signal Board is syncing</h3><p>Checking the authoritative Cloudflare D1 feed for ' + esc(BOARD_LABEL) + '.</p></article>';
    try {
      const response = await fetch(FEED_ROUTE + '?t=' + Date.now(), { credentials:'include', cache:'no-store', headers:{ Accept:'application/json', 'Cache-Control':'no-cache' } });
      const data = await parse(response);
      if (!response.ok || data.ok === false || data.persistent !== true) throw new Error(data.error || 'persistent feed unavailable');
      const posts = listFrom(data).filter(postBelongsHere).filter(isPublicUserPost);
      feed.innerHTML = posts.length ? posts.map(renderPost).join('') : '<article class="card redline"><h3>No persistent signals yet</h3><p>' + esc(BOARD_LABEL) + ' is connected. Verified members can post a source, question or public-record lead.</p></article>';
    } catch (error) { feed.innerHTML = offlineNotice(systemErrorLabel('Feed failed', error)); }
  }
  async function postLive(payload){
    const response = await fetch(SUBMIT_ROUTE, { method:'POST', credentials:'include', cache:'no-store', headers:{ 'Content-Type':'application/json', Accept:'application/json', 'Cache-Control':'no-cache' }, body:JSON.stringify(payload) });
    const data = await parse(response);
    if (response.status === 401) { member = null; applyMemberState(); }
    if (!response.ok || data.ok === false || data.persistent !== true || data.saved !== true || data.storage !== 'Cloudflare D1 MEMBERS_DB.forum_posts' || !data.post || !data.post.id) throw new Error(data.error || ('persistent post failed HTTP ' + response.status));
    return data.post;
  }
  async function reportPost(id){
    const reason = prompt('Report reason:'); if (!reason) return;
    try {
      const response = await fetch(REPORT_ROUTE, { method:'POST', credentials:'include', cache:'no-store', headers:{ 'Content-Type':'application/json', Accept:'application/json', 'Cache-Control':'no-cache' }, body:JSON.stringify({ id:id, board:BOARD, reason:reason }) });
      const data = await parse(response);
      if (!response.ok || data.ok === false || data.persistent !== true) throw new Error(data.error || 'persistent report failed');
      alert('Report saved persistently.');
    } catch (error) { alert(systemErrorLabel('Report not saved', error)); }
  }

  if (feed) feed.addEventListener('click', function(event){ const button = event.target.closest('.report-signal'); if (button) reportPost(button.getAttribute('data-id')); });
  if (form) form.addEventListener('submit', async function(event){
    event.preventDefault();
    lockFormToBoard();
    if (!member || !member.emailVerifiedAt) {
      if (status) status.innerHTML = 'Your shared session is not active. <a href="' + esc(LOGIN_URL) + '">Sign in again</a>, then return to this board.';
      return;
    }
    const payload = Object.fromEntries(new FormData(form).entries()); payload.board = BOARD;
    if (payload.website) { if (status) status.textContent = 'Spam trap triggered.'; return; }
    if (status) status.textContent = 'Writing to D1 and confirming the saved row...';
    try {
      const livePost = await postLive(payload);
      form.reset(); lockFormToBoard();
      if (status) status.textContent = 'Signal posted live. D1 persistence was confirmed by read-after-write.';
      await loadFeed();
      applyMemberState();
    } catch (error) {
      if (status) status.innerHTML = esc(systemErrorLabel('Post not saved persistently', error)) + (member ? '' : ' <a href="' + esc(LOGIN_URL) + '">Sign in again</a>.');
      await checkMember();
    }
  });

  lockFormToBoard();
  Promise.all([checkMember(), loadFeed()]);
})();
`;
write('forum.js', forumClient);

for (const relative of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {
  let html = read(relative);
  html = html.replace(/<script src="forum\.js(?:\?[^\"]*)?"><\/script>/g, `<script src="forum.js?v=${VERSION}"></script>`);
  html = html.replace(/href="member-login\.html"/g, `href="${CANONICAL_ORIGIN}/member-login.html?return=${encodeURIComponent('/' + relative)}"`);
  if (!html.includes(`forum.js?v=${VERSION}`)) throw new Error(`${relative} did not receive the versioned forum client`);
  write(relative, html);
}

// The login request itself should stay on the canonical origin and explicitly
// carry credentials. The one-time link then creates the shared v2 cookie.
{
  const relative = 'member-login.html';
  let html = read(relative);
  html = html.replace("const response = await fetch('/api/auth/request-link', {", `const response = await fetch('${CANONICAL_ORIGIN}/api/auth/request-link', {`);
  html = html.replace("method:'POST', headers:{'content-type':'application/json'},", "method:'POST', credentials:'include', cache:'no-store', headers:{'content-type':'application/json','cache-control':'no-cache'},");
  write(relative, html);
}

fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/forum-member-posting-repair.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  version: VERSION,
  canonicalOrigin: CANONICAL_ORIGIN,
  changed,
  sessionCookie: 'matrix_session_v2; Domain=matrixreprogrammed.com; HttpOnly; Secure; SameSite=Lax',
  legacyCookieReadFallback: true,
  browserCredentials: 'include',
  persistence: 'Cloudflare D1 insert plus read-after-write confirmation',
  boards: ['main', 'speculation', 'epstein-alive'],
  boundary: 'A browser success message is forbidden unless the authenticated Worker confirms the exact forum row exists in D1.'
}, null, 2));
console.log(`Forum member posting repair applied: ${changed.length ? changed.join(', ') : 'already current'}.`);
