(function(){
  function context(form){return [document.title,location.pathname,form.getAttribute('name'),form.id,form.className,form.textContent].join(' ').toLowerCase()}
  function emailInput(form){return form.querySelector('input[type="email"],input[name="email"],input[name="Email"]')}
  function status(form){let s=form.querySelector('.form-status,.newsletter-status');if(!s){s=document.createElement('p');s.className='form-status newsletter-status';form.appendChild(s)}return s}
  function shouldCapture(form){const email=emailInput(form);if(!email)return false;const hay=context(form);return /newsletter|black file|opt.?in|lead magnet|weekly|digest|brief|request|get the file|download|signal path/.test(hay)}
  function ensureConsent(form){
    let consent=form.querySelector('input[type="checkbox"][name="marketingConsent"],input[data-marketing-consent]');
    if(consent){consent.required=true;return consent}
    const label=document.createElement('label');
    label.className='newsletter-consent';
    consent=document.createElement('input');
    consent.type='checkbox';
    consent.name='marketingConsent';
    consent.required=true;
    consent.dataset.marketingConsent='true';
    const text=document.createElement('span');
    text.textContent=' I agree to receive Matrix Reprogrammed reports and updates by email. I can unsubscribe or change preferences at any time.';
    label.appendChild(consent);
    label.appendChild(text);
    const button=form.querySelector('button[type="submit"],input[type="submit"]');
    if(button)form.insertBefore(label,button);else form.appendChild(label);
    return consent
  }
  async function submit(form,event){
    event.preventDefault();
    const email=emailInput(form);
    const consent=ensureConsent(form);
    const s=status(form);
    const consentGranted=Boolean(consent.checked);
    const body={
      email:email.value,
      name:(form.querySelector('[name="name"],[name="Name"]')||{}).value||'',
      source:document.title,
      sourcePage:location.pathname,
      path:location.pathname,
      interest:context(form).slice(0,300),
      consent:consentGranted,
      marketingConsent:consentGranted,
      wordingVersion:'newsletter-explicit-consent-v2'
    };
    if(!body.email||!/@/.test(body.email)){s.textContent='Enter a valid email first.';return}
    if(!consentGranted){s.textContent='Please confirm that you agree to receive email reports and updates.';consent.focus();return}
    s.textContent='Saving your email and preparing verification...';
    try{
      const res=await fetch('/newsletter-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await res.json();
      if(!data.ok)throw new Error(data.error||'Signup failed');
      s.textContent=data.verificationRequired===false?'Saved. Your email preferences are active.':'Saved. Check your inbox to verify your email and activate reports.';
      form.reset();
      if(data.downloadUrl)setTimeout(()=>{location.href=data.downloadUrl},500)
    }catch(err){s.textContent='Email signup failed. Please try again later.'}
  }
  function boot(){document.querySelectorAll('form').forEach(form=>{if(!shouldCapture(form)||form.dataset.newsletterCapture==='active')return;ensureConsent(form);form.dataset.newsletterCapture='active';form.addEventListener('submit',submit.bind(null,form));})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
