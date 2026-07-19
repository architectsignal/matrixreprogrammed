(function(){
  function addSpeculationRoute(){
    var path=(window.location.pathname||'').toLowerCase();
    if(!/(^|\/)answer-engine\.html$/.test(path))return;
    var hero=document.querySelector('main .hero .cta-row');
    if(hero&&!hero.querySelector('[data-ai-speculation-link]')){
      var link=document.createElement('a');
      link.href='ai-speculative-conclusions.html';
      link.className='btn';
      link.setAttribute('data-ai-speculation-link','true');
      link.textContent='AI Speculative Conclusions';
      hero.insertBefore(link,hero.firstChild);
    }
    var governor=document.querySelector('.reader-governor-strip nav');
    if(governor&&!governor.querySelector('[data-ai-speculation-link]')){
      var navLink=document.createElement('a');
      navLink.href='ai-speculative-conclusions.html';
      navLink.setAttribute('data-ai-speculation-link','true');
      navLink.textContent='AI Hypotheses';
      governor.appendChild(navLink);
    }
  }
  addSpeculationRoute();
  if(document.querySelector('[data-investigation-pulse]'))return;
  function esc(s){return String(s||'').replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';});}
  fetch('/data/investigation-status.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(s){
    var box=document.createElement('aside');box.setAttribute('data-investigation-pulse','true');box.className='wrap investigation-pulse';
    box.innerHTML='<strong>Investigation Machine:</strong> last source run '+esc(s.lastInvestigationRun||'pending')+' · '+esc(s.registeredSources)+' sources registered · '+esc(s.ledgerFindings)+' evidence findings · <a href="investigation-machine.html">open machine</a> · <a href="daily-investigation-conclusions.html">daily conclusions</a> · <a href="ai-speculative-conclusions.html">AI hypotheses</a> · <a href="search.html">search</a>';
    var footer=document.querySelector('footer');if(footer&&footer.parentNode)footer.parentNode.insertBefore(box,footer);else document.body.appendChild(box);
  }).catch(function(){var box=document.createElement('aside');box.setAttribute('data-investigation-pulse','true');box.className='wrap investigation-pulse';box.innerHTML='<strong>Investigation Machine:</strong> status feed unavailable · <a href="investigation-source-ledger.html">check source ledger</a> · <a href="ai-speculative-conclusions.html">AI hypotheses</a>';var footer=document.querySelector('footer');if(footer&&footer.parentNode)footer.parentNode.insertBefore(box,footer);else document.body.appendChild(box);});
})();