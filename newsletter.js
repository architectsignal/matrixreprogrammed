(function(){
  function context(form){return[document.title,location.pathname,form.getAttribute('name'),form.id,form.className,form.textContent].join(' ').toLowerCase()}
  function emailInput(form){return form.querySelector('input[type="email"],input[name="email"],input[name="Email"]')}
  function status(form){let s=form.querySelector('.form-status,.newsletter-status');if(!s){s=document.createElement('p');s.className='form-status newsletter-status';form.appendChild(s)}return s}
  function shouldCapture(form){const email=emailInput(form);if(!email)return false;const hay=context(form);return/newsletter|black file|opt.?in|lead magnet|weekly|digest|brief|request|get the file|download|signal path/.test(hay)}
  function ensureConsent(form){
    let consent=form.querySelector('input[name="marketingConsent"],input[data-marketing-consent]');
    if(consent)return consent;
    const label=document.createElement('label');
    label.className='newsletter-consent';
    consent=document.createElement('input');
    consent.type='checkbox';
    consent.name='marketingConsent';
    consent.value='yes';
    consent.required=true;
    consent.setAttribute('data-marketing-consent','true');
    label.append(consent,document.createTextNode(' I agree to receive Matrix Reprogrammed email briefings. I can unsubscribe or change preferences at any time.'));
    const button=form.querySelector('button[type="submit"],button');
    if(button)form.insertBefore(label,button);else form.appendChild(label);
    return consent;
  }
  async function submit(form,event){
    event.preventDefault();
    const email=emailInput(form);const consent=ensureConsent(form);const s=status(form);
    const granted=Boolean(consent.checked);
    const body={email:email.value,name:(form.querySelector('[name="name"],[name="Name"]')||{}).value||'',source:document.title,path:location.pathname,interest:context(form).slice(0,300),consent:granted,consentVersion:'newsletter-consent-v2'};
    if(!body.email||!/@/.test(body.email)){s.textContent='Enter a valid email first.';return}
    if(!granted){s.textContent='Confirm the email consent box before joining.';consent.focus();return}
    s.textContent='Saving your consent and email…';
    try{
      const res=await fetch('/newsletter-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await res.json();
      if(!data.ok)throw new Error(data.error||'Signup failed');
      s.textContent='Saved. Your email preferences and unsubscribe controls are active.';
      if(data.downloadUrl)setTimeout(()=>{location.href=data.downloadUrl},500)
    }catch(err){s.textContent='Email signup failed. Use the direct download and try again later.'}
  }
  function boot(){document.querySelectorAll('form').forEach(form=>{if(!shouldCapture(form)||form.dataset.newsletterCapture==='active')return;form.dataset.newsletterCapture='active';ensureConsent(form);form.addEventListener('submit',submit.bind(null,form))})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()
})();
