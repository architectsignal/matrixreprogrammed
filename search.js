(function(){
  const input = document.getElementById('archive-search');
  const results = document.getElementById('search-results');
  const count = document.getElementById('search-count');
  if (!input || !results) return;
  function esc(s){return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function render(items){
    count.textContent = items.length + ' archive door' + (items.length === 1 ? '' : 's') + ' shown';
    results.innerHTML = items.map(b => '<article class="card"><span class="label">'+esc(b.category)+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description)+'</p><p>'+((b.keywords||[]).slice(0,8).map(k => '<span class="pill">'+esc(k)+'</span>').join(''))+'</p><a class="btn" href="'+esc(b.url)+'">Open Door</a></article>').join('');
  }
  fetch('search-index.json').then(r => r.json()).then(data => {
    function run(){
      const q = input.value.trim().toLowerCase();
      const items = !q ? data : data.filter(b => [b.title,b.subtitle,b.series,b.category,b.description,(b.keywords||[]).join(' ')].join(' ').toLowerCase().includes(q));
      render(items);
    }
    input.addEventListener('input', run);
    render(data);
  });
})();
