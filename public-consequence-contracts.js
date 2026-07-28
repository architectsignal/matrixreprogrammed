(()=>{
  const track=(name,data={})=>{
    const payload=JSON.stringify({name,route:'public_consequence_contracts',page:location.pathname,title:document.title,at:new Date().toISOString(),...data});
    if(navigator.sendBeacon){navigator.sendBeacon('/track-event',new Blob([payload],{type:'application/json'}));return}
    fetch('/track-event',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true}).catch(()=>{});
  };
  async function follow(button){
    const pending={
      entityId:button.dataset.followId,
      entityType:'topic',
      label:'Consequence contract: '+button.dataset.followLabel,
      route:button.dataset.followRoute,
      notificationsEnabled:true
    };
    sessionStorage.setItem('matrixPendingConsequenceFollow',JSON.stringify(pending));
    button.disabled=true;
    button.textContent='Following…';
    try{
      const response=await fetch('/api/member/follows',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(pending)});
      if(response.status===401){
        location.href='/member-login.html?return='+encodeURIComponent('/public-consequence-contracts.html?completeFollow=1#'+pending.entityId);
        return;
      }
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false)throw new Error(data.error||'Follow could not be saved');
      sessionStorage.removeItem('matrixPendingConsequenceFollow');
      button.textContent='Following';
      track('consequence_contract_follow',{contractId:pending.entityId,label:pending.label});
    }catch(error){
      button.disabled=false;
      button.textContent=error.message||'Try again';
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button[data-follow-id]');
    if(button)follow(button);
  });
  if(new URLSearchParams(location.search).get('completeFollow')==='1'){
    const raw=sessionStorage.getItem('matrixPendingConsequenceFollow');
    if(raw){
      try{
        const pending=JSON.parse(raw);
        fetch('/api/member/follows',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(pending)}).then(async response=>{
          if(response.ok){
            sessionStorage.removeItem('matrixPendingConsequenceFollow');
            track('consequence_contract_follow',{contractId:pending.entityId,label:pending.label,resumedAfterLogin:true});
            const target=document.getElementById(pending.entityId);
            if(target)target.scrollIntoView({block:'start'});
          }else if(response.status===401){
            location.href='/member-login.html?return='+encodeURIComponent('/public-consequence-contracts.html?completeFollow=1#'+pending.entityId);
          }
        });
      }catch{}
    }
  }
})();
