(function(){
  if(document.querySelector('[data-investigation-pulse]'))return;
  function esc(s){return String(s||'').replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';});}
  fetch('/data/investigation-status.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(s){
    var box=document.createElement('aside');box.setAttribute('data-investigation-pulse','true');box.className='wrap investigation-pulse';
    box.innerHTML='<strong>Investigation Machine:</strong> last source run '+esc(s.lastInvestigationRun||'pending')+' · '+esc(s.registeredSources)+' sources registered · '+esc(s.ledgerFindings)+' evidence findings · <a href="investigation-machine.html">open machine</a> · <a href="daily-investigation-conclusions.html">daily conclusions</a> · <a href="search.html">search</a>';
    var footer=document.querySelector('footer');if(footer&&footer.parentNode)footer.parentNode.insertBefore(box,footer);else document.body.appendChild(box);
  }).catch(function(){var box=document.createElement('aside');box.setAttribute('data-investigation-pulse','true');box.className='wrap investigation-pulse';box.innerHTML='<strong>Investigation Machine:</strong> status feed unavailable · <a href="investigation-source-ledger.html">check source ledger</a>';var footer=document.querySelector('footer');if(footer&&footer.parentNode)footer.parentNode.insertBefore(box,footer);});
})();