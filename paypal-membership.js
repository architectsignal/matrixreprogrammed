(() => {
  const state={config:null,sdk:null};
  const $=id=>document.getElementById(id);
  const api=async(path,options={})=>{const response=await fetch(path,{cache:'no-store',headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{})},...options,body:options.body?JSON.stringify(options.body):undefined});const text=await response.text();let data={};try{data=JSON.parse(text||'{}')}catch{data={ok:false,error:text||'Invalid response'}}if(response.status===401)throw Object.assign(new Error('Log in to choose a paid membership.'),{authentication:true});if(!response.ok||data.ok===false)throw new Error(data.error||'Payment request failed');return data};
  const status=(message,type='')=>{const node=$('paypal-membership-status');if(node){node.className='membership-status '+type;node.textContent=message}};
  function checkoutConsent(){
    const section=$('membership-checkout-consent');
    const accepted={
      termsAccepted:Boolean($('membership-terms-accepted')?.checked),
      recurringPaymentAcknowledged:Boolean($('membership-recurring-acknowledged')?.checked),
      immediateServiceRequested:Boolean($('membership-immediate-service-requested')?.checked),
      withdrawalNoticeAcknowledged:Boolean($('membership-withdrawal-notice-acknowledged')?.checked)
    };
    const complete=Object.values(accepted).every(Boolean);
    const termsVersion=section?.dataset.termsVersion||'';
    const withdrawalNoticeVersion=section?.dataset.withdrawalVersion||'';
    const versionsCurrent=Boolean(state.config&&termsVersion===state.config.termsVersion&&withdrawalNoticeVersion===state.config.withdrawalNoticeVersion);
    return{complete:complete&&versionsCurrent,payload:{...accepted,termsVersion,withdrawalNoticeVersion},section};
  }
  function requireCheckoutConsent(){
    const consent=checkoutConsent();
    if(consent.complete)return consent.payload;
    status('Accept the current membership terms, recurring-payment notice, immediate-service request and withdrawal notice before opening PayPal.','warning');
    consent.section?.scrollIntoView({behavior:'smooth',block:'center'});
    throw new Error('Required membership consent is incomplete or out of date.');
  }
  function loadSdk(clientId){if(state.sdk)return state.sdk;state.sdk=new Promise((resolve,reject)=>{if(window.paypal)return resolve(window.paypal);const script=document.createElement('script');script.src=`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&vault=true&intent=subscription&components=buttons`;script.async=true;script.onload=()=>window.paypal?resolve(window.paypal):reject(new Error('PayPal SDK did not initialise'));script.onerror=()=>reject(new Error('PayPal checkout could not be loaded'));document.head.append(script)});return state.sdk}
  async function renderTier(paypal,tier,plan){const container=$(`paypal-button-${tier}`);if(!container)return;container.replaceChildren();paypal.Buttons({style:{shape:'rect',layout:'vertical',label:'subscribe'},createSubscription:async(_data,actions)=>{const consent=requireCheckoutConsent();const intent=await api('/api/paypal/checkout-intent',{method:'POST',body:{tier,...consent}});if(!intent.consentRecorded)throw new Error('Checkout consent was not recorded.');container.dataset.intentId=intent.intentId;return actions.subscription.create({plan_id:intent.planId,custom_id:intent.customId,application_context:{brand_name:'Matrix Reprogrammed',shipping_preference:'NO_SHIPPING',user_action:'SUBSCRIBE_NOW',return_url:`${location.origin}/billing-dashboard.html`,cancel_url:`${location.origin}/membership.html?cancelled=1`}})},onApprove:async data=>{const intentId=container.dataset.intentId;const result=await api('/api/paypal/subscription/confirm',{method:'POST',body:{subscriptionId:data.subscriptionID,checkoutIntentId:intentId}});status(result.message||'PayPal subscription confirmed.','good');setTimeout(()=>location.href='/billing-dashboard.html',1000)},onCancel:()=>status('PayPal checkout was cancelled. No charge or entitlement change was recorded.','warning'),onError:error=>status(error?.message||'PayPal checkout failed safely.','danger')}).render(container)}
  async function start(){try{status('Checking PayPal checkout readiness…');state.config=await api('/api/paypal/config');if(!state.config.configured){status('PayPal credentials and webhook are not configured yet. No payment can be taken.','warning');return}if(!state.config.checkoutEnabled){const legal=state.config.environment==='live'&&!state.config.commercialLegalReady?' Commercial legal readiness is also blocked.':'';status(`PayPal ${state.config.environment} checkout is installed but disabled behind the activation switches.${legal} No payment can be taken.`, 'warning');return}const paypal=await loadSdk(state.config.clientId);for(const [tier,definition] of Object.entries(state.config.tiers||{})){if(definition.planId)await renderTier(paypal,tier,definition)}status(`PayPal ${state.config.environment} checkout is enabled. Accept the membership notices before approving inside PayPal.`,state.config.environment==='live'?'good':'warning')}catch(error){if(error.authentication){status('Log in first, then return here to choose a membership.','warning');document.querySelectorAll('[data-paypal-login]').forEach(node=>node.hidden=false)}else status(error.message||'PayPal checkout is unavailable.','danger')}}
  start();
})();
