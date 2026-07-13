(function(){
  function context(form){return [document.title,location.pathname,form.getAttribute('name'),form.id,form.className,form.textContent].join(' ').toLowerCase()}
  function emailInput(form){return form.querySelector('input[type="email"],input[name="email"],input[name="Email"]')}
  function status(form){let node=form.querySelector('.form-status,.newsletter-status');if(!node){node=document.createElement('p');node.className='form-status newsletter-status';node.setAttribute('aria-live','polite');form.appendChild(node)}return node}
  function shouldCapture(form){const email=emailInput(form);if(!email)return false;return /newsletter|black file|opt.?in|lead magnet|weekly|digest|brief|request|get the file|download|signal path|membership/.test(context(form))}
  function ensureConsent(form){
    let consent=form.querySelector('input[name="consent"]');
    if(consent)return consent;
    const wrap=document.createElement('label');
    wrap.className='email-consent-control';
    wrap.style.cssText='display:flex;gap:.6rem;align-items:flex-start;width:100%;font-size:.82rem;line-height:1.45;color:#c8b98c;margin:.45rem 0';
    consent=document.createElement('input');
    consent.type='checkbox';
    consent.name='consent';
    consent.required=true;
    consent.value='true';
    consent.style.marginTop='.2rem';
    const text=document.createElement('span');
    text.textContent='I consent to receive the Matrix Reprogrammed briefings selected below. I can change preferences or unsubscribe at any time.';
    wrap.append(consent,text);
    const button=form.querySelector('button[type="submit"],input[type="submit"]');
    form.insertBefore(wrap,button||form.firstChild);
    return consent;
  }
  function ensureCadence(form){
    let group=form.querySelector('[data-email-cadence]');
    if(group)return group;
    group=document.createElement('div');
    group.dataset.emailCadence='true';
    group.style.cssText='display:flex;flex-wrap:wrap;gap:.8rem;width:100%;font-size:.82rem;color:#c8b98c';
    const hay=context(form);
    const dailyDefault=/daily control brief|daily brief/.test(hay);
    const weeklyDefault=!dailyDefault;
    group.innerHTML='<label><input type="checkbox" name="public_daily_brief" '+(dailyDefault?'checked':'')+'> Daily Control Brief</label><label><input type="checkbox" name="public_weekly_digest" '+(weeklyDefault?'checked':'')+'> Weekly Signal Drop</label><label><input type="checkbox" name="release_notices" checked> Release notices</label>';
    const consent=form.querySelector('.email-consent-control');
    form.insertBefore(group,consent||form.querySelector('button[type="submit"]')||null);
    return group;
  }
  function checked(form,name,fallback){const input=form.querySelector('[name="'+name+'"]');return input?Boolean(input.checked):fallback}
  async function submit(form,event){
    event.preventDefault();
    const email=emailInput(form);
    const consent=ensureConsent(form);
    const message=status(form);
    const payload={
      email:email.value.trim(),
      name:(form.querySelector('[name="name"],[name="Name"]')||{}).value||'',
      source:document.title,
      path:location.pathname,
      interest:context(form).slice(0,300),
      consent:Boolean(consent.checked),
      public_daily_brief:checked(form,'public_daily_brief',false),
      public_weekly_digest:checked(form,'public_weekly_digest',true),
      release_notices:checked(form,'release_notices',true),
      locale:document.documentElement.lang||'en',
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Paris',
      website:(form.querySelector('[name="website"]')||{}).value||''
    };
    if(!payload.email||!/@/.test(payload.email)){message.textContent='Enter a valid email first.';return}
    if(!payload.consent){message.textContent='Please tick the consent box before joining.';return}
    message.textContent='Saving your preferences and sending the verification email...';
    try{
      const response=await fetch('/newsletter-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Signup failed');
      message.textContent=data.verification&&data.verification.sent
        ? 'Saved. Check your inbox and verify your email to activate the selected briefings.'
        : 'Your subscriber record is saved. Verification delivery is queued and will retry when email delivery is available.';
      form.dataset.signupAccepted='true';
      if(data.downloadUrl)setTimeout(function(){location.href=data.downloadUrl},700);
    }catch(error){
      message.textContent='Signup could not be completed: '+(error&&error.message?error.message:'service unavailable')+'. No success was recorded unless the service confirmed it.';
    }
  }
  function boot(){document.querySelectorAll('form').forEach(function(form){if(!shouldCapture(form)||form.dataset.newsletterCapture==='active')return;form.dataset.newsletterCapture='active';ensureCadence(form);ensureConsent(form);form.addEventListener('submit',submit.bind(null,form));});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
