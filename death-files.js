(function(){
  'use strict';
  const root = document.querySelector('[data-death-dossier]');
  const dossierSlug = root ? String(root.getAttribute('data-death-dossier') || '') : '';
  const dossierName = root ? String(root.getAttribute('data-dossier-name') || '') : '';
  const form = document.getElementById('death-signal-form');
  const feed = document.getElementById('death-signal-feed');
  const status = document.getElementById('death-signal-status');
  const memberStatus = document.getElementById('death-member-status');
  const liveFeed = document.getElementById('death-live-feed');
  let member = null;

  function esc(value){ return String(value || '').replace(/[&<>"']/g, function(char){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]; }); }
  async function parse(response){ const text = await response.text(); try { return JSON.parse(text); } catch { return { error:text || ('HTTP ' + response.status) }; } }
  function normalize(value){ return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function dateLabel(value){ const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
  function loginUrl(){ return '/member-login.html?return=' + encodeURIComponent(location.pathname + location.search + location.hash); }
  function caseCategory(){ return 'Death File: ' + dossierSlug; }
  function caseMarker(){ return '[DEATH FILE:' + dossierSlug + ']'; }

  async function checkMember(){
    if (!form) return;
    try {
      const response = await fetch('/api/member/me?death_file_session=' + Date.now(), {credentials:'include',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
      const data = await parse(response);
      member = response.ok && data.authenticated === true && data.member && data.member.emailVerifiedAt ? data.member : null;
    } catch { member = null; }
    const active = Boolean(member && member.emailVerifiedAt);
    Array.from(form.elements).forEach(function(control){ if (control.name !== 'website') control.disabled = !active; });
    if (memberStatus) memberStatus.innerHTML = active
      ? '<strong>Verified member session active.</strong> Your case-scoped signal can be submitted to the persistent intelligence board.'
      : 'Posting requires a verified free member account. <a href="' + esc(loginUrl()) + '">Sign in to submit intelligence</a>.';
  }

  function belongs(post){
    const category = normalize(post && post.category);
    const body = String(post && (post.body || post.message) || '');
    return category === normalize(caseCategory()) || body.includes(caseMarker());
  }
  function publicPost(post){
    const state = String(post && post.status || 'live').toLowerCase();
    if (['hidden','deleted','reported','spam','test','synthetic','draft'].includes(state)) return false;
    const blob = normalize([post.id,post.title,post.body,post.category,post.name].join(' '));
    return !/smoke test|health check|fixture|pressure test|demo post/.test(blob);
  }
  function renderSignal(post){
    const source = post.sourceUrl ? '<p><a class="btn alt" href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open submitted source</a></p>' : '';
    return '<article class="card death-signal-card"><span class="label">Community intelligence · ' + esc(post.category || 'Death File signal') + '</span><h3>' + esc(post.title || 'Submitted signal') + '</h3><p>' + esc(String(post.body || post.message || '').replace(caseMarker(),'').trim()) + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Member') + '</span> <span class="pill">' + esc(dateLabel(post.approvedAt || post.createdAt)) + '</span></p></article>';
  }
  async function loadSignals(){
    if (!feed || !dossierSlug) return;
    feed.innerHTML = '<article class="card"><h3>Checking the persistent Signal Board…</h3></article>';
    try {
      const response = await fetch('/forum-feed-main?t=' + Date.now(), {credentials:'include',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
      const data = await parse(response);
      const posts = (Array.isArray(data) ? data : (data.posts || [])).filter(belongs).filter(publicPost);
      feed.innerHTML = posts.length ? posts.map(renderSignal).join('') : '<article class="card redline"><h3>No public signals attached yet</h3><p>This case-scoped feed is connected. Submit a source, correction, counter-source, timeline detail, or relationship lead.</p></article>';
    } catch (error) {
      feed.innerHTML = '<article class="card redline"><h3>Signal feed unavailable</h3><p>' + esc(error && error.message || 'The persistent board could not be reached.') + '</p></article>';
    }
  }
  async function submitSignal(event){
    event.preventDefault();
    if (!member || !member.emailVerifiedAt) {
      if (status) status.innerHTML = 'Sign in before posting. <a href="' + esc(loginUrl()) + '">Open member login</a>.';
      return;
    }
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.website) return;
    const bodyParts = [caseMarker(), 'Case: ' + dossierName, 'Submission type: ' + (values.signalType || 'Source lead'), 'Evidence position: ' + (values.position || 'Adds context'), 'Evidence level claimed by submitter: ' + (values.evidenceLevel || 'Unclassified'), '', values.body || ''];
    const payload = {board:'main',category:caseCategory(),name:values.name || member.displayName || 'Member',title:values.title || ('Signal for ' + dossierName),sourceUrl:values.sourceUrl || '',body:bodyParts.join('\n')};
    if (status) status.textContent = 'Saving the case-scoped signal to the persistent board…';
    try {
      const response = await fetch('/submit-main-post', {method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-cache'},body:JSON.stringify(payload)});
      const data = await parse(response);
      if (!response.ok || data.ok === false || data.saved === false) throw new Error(data.error || 'Signal was not confirmed as saved.');
      form.reset();
      if (status) status.textContent = 'Signal saved. It is now attached to this Death File feed.';
      await loadSignals();
    } catch (error) {
      if (status) status.textContent = 'Signal not saved: ' + (error && error.message || 'request failed');
    }
  }

  function itemText(item){ return normalize([item.title,item.summary,item.lane,item.sourceLabel,item.evidenceBoundary,item.url,item.published].join(' ')); }
  async function loadLiveMatches(){
    if (!liveFeed || !dossierSlug) return;
    const rawKeywords = root.getAttribute('data-dossier-keywords') || '[]';
    let keywords = [];
    try { keywords = JSON.parse(rawKeywords).map(normalize).filter(Boolean); } catch { keywords = [normalize(dossierName)]; }
    try {
      const response = await fetch('/data/live-intel.json?t=' + Date.now(), {cache:'no-store',headers:{Accept:'application/json'}});
      const data = await response.json();
      const items = (data.items || []).map(function(item){ const hay = itemText(item); const score = keywords.reduce(function(total,key){ return total + (key && hay.includes(key) ? 1 : 0); },0); return {item:item,score:score}; }).filter(function(row){ return row.score > 0; }).sort(function(a,b){ return b.score-a.score; }).slice(0,8);
      liveFeed.innerHTML = items.length ? items.map(function(row){ const item=row.item; return '<article class="card"><span class="label">Automatic site match · score ' + row.score + '</span><h3>' + esc(item.title || 'Relevant intelligence item') + '</h3><p>' + esc(item.summary || item.evidenceBoundary || '') + '</p>' + (item.url ? '<a class="btn alt" href="' + esc(item.url) + '">Open connected item</a>' : '') + '</article>'; }).join('') : '<article class="card"><h3>No current live-intelligence match</h3><p>The automated matcher will recheck this dossier whenever the site intelligence feed changes.</p></article>';
    } catch {
      liveFeed.innerHTML = '<article class="card"><h3>Live match scan pending</h3><p>The static dossier remains available while the current intelligence feed is unavailable.</p></article>';
    }
  }

  function installArchiveFilter(){
    const input = document.getElementById('death-file-search');
    if (!input) return;
    const cards = Array.from(document.querySelectorAll('[data-death-card]'));
    input.addEventListener('input', function(){ const q=normalize(input.value); cards.forEach(function(card){ card.hidden = Boolean(q && !normalize(card.textContent).includes(q)); }); });
  }

  if (form) form.addEventListener('submit', submitSignal);
  installArchiveFilter();
  Promise.all([checkMember(),loadSignals(),loadLiveMatches()]);
})();