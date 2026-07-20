(function(){
  if(document.querySelector('[data-investigation-pulse]'))return;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function route(){return decodeURIComponent(location.pathname.replace(/^\/+/,''))||'index.html';}
  function insert(box){var footer=document.querySelector('footer');if(footer&&footer.parentNode)footer.parentNode.insertBefore(box,footer);else document.body.appendChild(box);}
  function machineBox(status){
    var box=document.createElement('aside');box.setAttribute('data-investigation-pulse','true');box.className='wrap investigation-pulse';
    box.innerHTML='<strong>Investigation Machine:</strong> last source run '+esc(status.lastInvestigationRun||status.updated||'pending')+' · '+esc(status.registeredSources||0)+' sources registered · '+esc(status.ledgerFindings||0)+' evidence findings · <a href="investigation-machine.html">open machine</a> · <a href="daily-investigation-conclusions.html">daily conclusions</a> · <a href="search.html">search</a>';
    insert(box);
  }
  function cardBox(feed){
    var key=route();var card=(feed.byRoute&&feed.byRoute[key])||null;if(!card)return;
    var box=document.createElement('section');box.setAttribute('data-card-live-update','true');box.className='section wrap card-live-update';
    var updates=(card.updates||[]).slice(0,3).map(function(item){var link=item.url?'<a href="'+esc(item.url)+'" target="_blank" rel="noopener">Open source</a>':'';return '<article class="card"><span class="label">'+esc(item.sourceTier||item.origin||'Public record')+'</span><h3>'+esc(item.title)+'</h3><p><strong>Published:</strong> '+esc(item.published||'Date unavailable')+'</p><p>'+esc(item.summary||'Current source match recorded by the machine.')+'</p>'+link+'</article>';}).join('');
    var quiet='<article class="card"><h3>No new verified record in the current window</h3><p>The machine checked this card against current Live Intel, record events, entity observations and entity briefs. It did not invent a change when no qualifying source matched.</p></article>';
    box.innerHTML='<div class="eyebrow">Live Card Intelligence</div><h2>'+esc(card.title)+'</h2><p class="lead"><strong>Status:</strong> '+esc(card.status.replace(/-/g,' '))+' · <strong>Checked:</strong> '+esc(card.checkedAt)+' · <strong>Source window:</strong> '+esc(card.sourceWindowUpdated||'unavailable')+'</p><p><strong>Evidence boundary:</strong> '+esc(card.evidenceBoundary)+'</p><div class="grid">'+(updates||quiet)+'</div><div class="cta-row"><a class="btn alt" href="data/card-live-updates.json">Open card update feed</a><a class="btn alt" href="live-intel.html">Live Intel</a></div>';
    insert(box);
  }
  Promise.all([
    fetch('/data/investigation-status.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).catch(function(){return {lastInvestigationRun:'status feed unavailable',registeredSources:0,ledgerFindings:0};}),
    fetch('/data/card-live-updates.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).catch(function(){return null;})
  ]).then(function(values){machineBox(values[0]);if(values[1])cardBox(values[1]);});
})();
