(function(){
  const form = document.getElementById('signal-board-form');
  const status = document.getElementById('signal-form-status');
  const feed = document.getElementById('signal-board-feed');

  function esc(s){
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function shortDate(value){
    try { return new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return ''; }
  }

  function renderPost(post){
    const source = post.sourceUrl ? '<p class="source-list"><a href="' + esc(post.sourceUrl) + '" target="_blank" rel="noopener">Open source</a></p>' : '';
    return '<article class="card news-item"><span class="label">' + esc(post.category || 'Signal') + '</span><h3>' + esc(post.title) + '</h3><p>' + esc(post.body) + '</p>' + source + '<p><span class="pill">' + esc(post.name || 'Anonymous') + '</span> <span class="pill">' + esc(shortDate(post.approvedAt || post.createdAt)) + '</span></p></article>';
  }

  async function loadFeed(){
    if (!feed) return;
    try {
      const res = await fetch('/.netlify/functions/forum-feed', { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      if (!posts.length) {
        feed.innerHTML = '<article class="card redline"><h3>No approved signals yet</h3><p>The board is open. Submit a clean source, question, or reader note for review.</p></article>';
        return;
      }
      feed.innerHTML = posts.map(renderPost).join('');
    } catch (err) {
      feed.innerHTML = '<article class="card redline"><h3>Signal feed offline</h3><p>Approved posts could not be loaded right now.</p></article>';
    }
  }

  if (form) {
    form.addEventListener('submit', async function(event){
      event.preventDefault();
      status.textContent = 'Submitting for review...';
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const res = await fetch('/.netlify/functions/submit-forum-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submission failed');
        form.reset();
        status.textContent = 'Signal received. It will appear publicly only if approved.';
      } catch (err) {
        status.textContent = err.message || 'Could not submit signal.';
      }
    });
  }

  loadFeed();
})();
