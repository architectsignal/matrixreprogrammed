(()=>{
  const cards=[...document.querySelectorAll('.consequence-contract-card[id]')];
  if(!cards.length)return;
  const text=value=>String(value||'').replace(/-/g,' ');
  const date=value=>{if(!value)return'not scheduled';try{return new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch{return String(value||'')}};
  function statusClass(value){return ['reviewed','complete','supported','partially-supported','not-supported','mixed'].includes(value)?'is-published':['due','evidence-collected','awaiting-editorial-review'].includes(value)?'is-due':'is-scheduled';}
  function liveBadge(contract){
    const div=document.createElement('div');div.className='consequence-live-status';
    const checkpoint=contract.nextCheckpointDays?'<span class="'+statusClass(contract.reviewState)+'">'+Number(contract.nextCheckpointDays)+'-day check: '+text(contract.reviewState)+' · '+date(contract.nextDueAt)+'</span>':'<span class="'+statusClass(contract.reviewState)+'">'+text(contract.reviewState)+'</span>';
    div.innerHTML='<strong>Live D1 record</strong><span>'+text(contract.termsLock)+'</span>'+checkpoint+'<small>Persistent version '+Number(contract.version||1)+' · updated '+date(contract.updatedAt)+'</small>';
    return div;
  }
  function updateCard(card,contract){
    card.dataset.contractId=contract.id;
    const old=card.querySelector('.consequence-live-status');if(old)old.remove();
    const meta=card.querySelector('.consequence-contract-meta');(meta||card).insertAdjacentElement(meta?'afterend':'afterbegin',liveBadge(contract));
    const rows=[...card.querySelectorAll('.consequence-checkpoints li')];
    for(const row of rows){const strong=row.querySelector('strong');const days=Number(String(strong?.textContent||'').match(/\d+/)?.[0]||0);if(days===Number(contract.nextCheckpointDays)){row.classList.add(statusClass(contract.reviewState));const span=row.querySelector('span');if(span)span.textContent=date(contract.nextDueAt)+' · '+text(contract.reviewState);}}
    const prior=card.querySelector('.consequence-published-finding');if(prior)prior.remove();
    if(contract.latestAssessment){
      const finding=document.createElement('div');finding.className='consequence-published-finding';finding.innerHTML='<strong>Latest reviewed outcome</strong><span>'+text(contract.latestAssessment.overallFinding)+' · confidence '+Number(contract.latestAssessment.confidence||0)+'/100</span><p>'+String(contract.latestAssessment.summary||'')+'</p>';
      card.append(finding);
    }
  }
  fetch('/api/public/consequence-contracts?limit=100',{headers:{Accept:'application/json'},cache:'no-store'}).then(async response=>{
    if(!response.ok)throw new Error('Live tracker unavailable');const data=await response.json();const byId=new Map((data.items||[]).map(item=>[item.id,item]));
    for(const card of cards){const contract=byId.get(card.id);if(contract)updateCard(card,contract);}
    document.documentElement.dataset.accountabilityTracker='connected';
  }).catch(()=>{document.documentElement.dataset.accountabilityTracker='static-fallback';});
})();
