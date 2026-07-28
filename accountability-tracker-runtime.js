(()=>{
  const cards=[...document.querySelectorAll('.consequence-contract-card[id]')];
  if(!cards.length)return;
  const text=value=>String(value||'').replace(/-/g,' ');
  const date=value=>{try{return new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch{return String(value||'')}};
  function statusClass(value){return ['published','completed'].includes(value)?'is-published':['due-for-evidence','evidence-collected','awaiting-editorial-review'].includes(value)?'is-due':'is-scheduled';}
  function liveBadge(contract){
    const nearest=(contract.checkpoints||[]).slice().sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)).find(item=>item.status!=='published')||(contract.checkpoints||[]).slice(-1)[0];
    const div=document.createElement('div');div.className='consequence-live-status';
    div.innerHTML='<strong>Live D1 record</strong><span>'+text(contract.termsLock)+'</span>'+(nearest?'<span class="'+statusClass(nearest.status)+'">'+nearest.daysAfterAction+'-day check: '+text(nearest.status)+' · '+date(nearest.dueAt)+'</span>':'')+'<small>Persistent version '+Number(contract.version||1)+' · synced '+date(contract.lastSyncedAt)+'</small>';
    return div;
  }
  function updateCard(card,contract){
    card.dataset.contractId=contract.id;
    const old=card.querySelector('.consequence-live-status');if(old)old.remove();
    const meta=card.querySelector('.consequence-contract-meta');(meta||card).insertAdjacentElement(meta?'afterend':'afterbegin',liveBadge(contract));
    const rows=[...card.querySelectorAll('.consequence-checkpoints li')];
    (contract.checkpoints||[]).slice().sort((a,b)=>a.daysAfterAction-b.daysAfterAction).forEach((checkpoint,index)=>{
      const row=rows[index];if(!row)return;row.dataset.checkpointId=checkpoint.id;row.classList.add(statusClass(checkpoint.status));
      const span=row.querySelector('span');if(span)span.textContent=date(checkpoint.dueAt)+' · '+text(checkpoint.status);
      if(checkpoint.lastCheckedAt){let small=row.querySelector('.checkpoint-last-checked');if(!small){small=document.createElement('small');small.className='checkpoint-last-checked';row.append(small)}small.textContent='Last checked '+date(checkpoint.lastCheckedAt);}
    });
    if(contract.latestAssessment){
      const finding=document.createElement('div');finding.className='consequence-published-finding';finding.innerHTML='<strong>Latest reviewed outcome</strong><span>'+text(contract.latestAssessment.overallFinding)+' · confidence '+Number(contract.latestAssessment.confidence||0)+'/100</span><p>'+String(contract.latestAssessment.summary||'')+'</p>';
      card.append(finding);
    }
  }
  fetch('/api/accountability/contracts?limit=200',{headers:{Accept:'application/json'},cache:'no-store'}).then(async response=>{
    if(!response.ok)throw new Error('Live tracker unavailable');const data=await response.json();const byId=new Map((data.items||[]).map(item=>[item.id,item]));
    for(const card of cards){const contract=byId.get(card.id);if(contract)updateCard(card,contract);}
    document.documentElement.dataset.accountabilityTracker='connected';
  }).catch(()=>{document.documentElement.dataset.accountabilityTracker='static-fallback';});
})();
