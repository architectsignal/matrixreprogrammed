(function(){
'use strict';
const cards=[...document.querySelectorAll('[data-donation-card]')];
const globalStatus=document.querySelector('[data-donation-global-status]');
let config={enabled:false,environment:'sandbox',liveChargingEnabled:false};
function money(value){const n=Number(value);return Number.isFinite(n)?n.toFixed(2):'';}
function setStatus(node,message,kind){if(!node)return;node.textContent=message||'';node.dataset.kind=kind||'info';}
function validAmount(input){const value=Number(String(input?.value||'').replace(',','.'));return Number.isFinite(value)&&value>=1&&value<=5000?value:null;}
function loginUrl(){const returnTo=location.pathname+location.search+location.hash;return 'member-login.html?return='+encodeURIComponent(returnTo);}
async function api(path,options={}){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',...(options.headers||{})},...options});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok){const error=new Error(data.error||data.message||`Request failed (${response.status})`);error.status=response.status;error.data=data;throw error;}
  return data;
}
function applyConfig(){
  cards.forEach(card=>{
    const button=card.querySelector('[data-donation-submit]');
    const state=card.querySelector('[data-donation-status]');
    if(button)button.disabled=!config.enabled;
    if(!config.enabled)setStatus(state,'Paid support is opening soon. Create a free account to save reports and receive launch news.','pending');
    else setStatus(state,config.environment==='sandbox'?'Sandbox rehearsal checkout is active. No real payment will be taken.':'Secure PayPal support is available. Review the amount and merchant details before approval.','ready');
  });
  if(globalStatus)setStatus(globalStatus,config.enabled?(config.environment==='sandbox'?'Sandbox rehearsal checkout is active; no real charges.':'Secure PayPal support is available.'):'Paid support is opening soon. Public evidence and previews remain free.',config.enabled?'ready':'pending');
}
async function loadConfig(){
  try{config=await api('/api/paypal/donation/config',{method:'GET',headers:{}});}catch(error){config={enabled:false,configured:false,environment:'sandbox',liveChargingEnabled:false};}
  applyConfig();
}
function bindCard(card){
  const input=card.querySelector('[data-donation-amount]');
  const button=card.querySelector('[data-donation-submit]');
  const status=card.querySelector('[data-donation-status]');
  card.querySelectorAll('[data-donation-quick]').forEach(quick=>quick.addEventListener('click',()=>{input.value=quick.dataset.donationQuick;setStatus(status,`Selected €${money(input.value)}. Review it before continuing.`,'info');}));
  if(!button||!input)return;
  button.addEventListener('click',async()=>{
    const amount=validAmount(input);
    if(!amount){setStatus(status,'Choose an amount between €1.00 and €5,000.00.','error');input.focus();return;}
    button.disabled=true;setStatus(status,'Opening secure PayPal approval…','working');
    try{
      const result=await api('/api/paypal/donation/order',{method:'POST',body:JSON.stringify({amount:money(amount),productKey:card.dataset.donationKey,label:card.dataset.donationLabel})});
      if(!result.approveUrl)throw new Error('PayPal approval link was not returned.');
      sessionStorage.setItem('matrixDonationLabel',card.dataset.donationLabel||'Matrix Reprogrammed research');
      sessionStorage.setItem('matrixDonationAmount',money(amount));
      location.assign(result.approveUrl);
    }catch(error){
      if(error.status===401){setStatus(status,'Create or access your free member account before opening PayPal.','error');location.assign(loginUrl());return;}
      setStatus(status,error.message||'PayPal support could not start. No payment was taken.','error');button.disabled=!config.enabled;
    }
  });
}
async function captureReturn(){
  const params=new URLSearchParams(location.search);
  const state=params.get('donation');
  const token=params.get('token');
  if(state==='cancelled'){
    setStatus(globalStatus,'PayPal was cancelled. No payment was taken.','info');
    history.replaceState(null,'',location.pathname+location.hash);
    return;
  }
  if(state!=='approved'||!token)return;
  setStatus(globalStatus,'Confirming the PayPal support payment…','working');
  try{
    const result=await api('/api/paypal/donation/capture',{method:'POST',body:JSON.stringify({orderId:token})});
    setStatus(globalStatus,`Thank you. PayPal confirmed €${result.amount} of voluntary project support.`,'success');
  }catch(error){
    if(error.status===401){setStatus(globalStatus,'Sign back into your free member account to confirm the approved PayPal payment.','error');location.assign(loginUrl());return;}
    setStatus(globalStatus,error.message||'PayPal approval was received but the payment could not be confirmed.','error');
  }finally{
    history.replaceState(null,'',location.pathname+location.hash);
  }
}
cards.forEach(bindCard);
loadConfig().then(captureReturn);
})();
