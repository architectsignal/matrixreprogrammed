const fs = require('fs');
const path = require('path');

const root = process.cwd();
const clientPath = path.join(root, 'newsletter.js');
const reportPath = path.join(root, 'downloads', 'newsletter-preference-runtime-repair.json');
const sitePath = path.join(root, '_site');

const client = `(function(){
  'use strict';

  function context(form){
    return [document.title,location.pathname,form.getAttribute('name'),form.id,form.className,form.dataset.source,form.dataset.tags,form.textContent].join(' ').toLowerCase();
  }
  function emailInput(form){return form.querySelector('input[type="email"],input[name="email"],input[name="Email"]');}
  function status(form){
    let node=form.querySelector('.form-status,.newsletter-status,[data-newsletter-status]');
    if(!node){node=document.createElement('p');node.className='form-status newsletter-status';form.appendChild(node);}
    return node;
  }
  function truthy(value){return ['1','true','yes','on','selected'].includes(String(value||'').trim().toLowerCase());}
  function shouldCapture(form){
    if(!emailInput(form))return false;
    return /newsletter|black file|opt.?in|lead magnet|weekly|digest|brief|request|get the file|download|signal path|release notice/.test(context(form));
  }
  function ensureConsent(form){
    let consent=form.querySelector('input[type="checkbox"][name="marketingConsent"],input[type="checkbox"][name="consent"],input[data-marketing-consent]');
    if(consent){consent.required=true;return consent;}
    const label=document.createElement('label');
    label.className='newsletter-consent';
    consent=document.createElement('input');
    consent.type='checkbox';consent.name='marketingConsent';consent.required=true;consent.dataset.marketingConsent='true';
    const text=document.createElement('span');
    text.textContent=' I agree to receive the Matrix Reprogrammed briefings selected on this form. I can unsubscribe or change preferences at any time.';
    label.appendChild(consent);label.appendChild(text);
    const button=form.querySelector('button[type="submit"],input[type="submit"]');
    if(button)form.insertBefore(label,button);else form.appendChild(label);
    return consent;
  }
  function preferenceControl(form,name){return [...form.querySelectorAll('[name="'+name+'"]')];}
  function preferenceValue(form,name,fallback){
    const controls=preferenceControl(form,name);
    if(!controls.length)return Boolean(fallback);
    return controls.some(control=>(control.type==='checkbox'||control.type==='radio')?control.checked:truthy(control.value));
  }
  function preferenceDefaults(form){
    const hay=context(form);
    let daily=truthy(form.dataset.defaultDaily)||/daily control brief|daily intelligence|daily brief|daily updates/.test(hay);
    let weekly=truthy(form.dataset.defaultWeekly)||/weekly signal|weekly file|weekly digest|signal drop|\\bweekly\\b|\\bdigest\\b/.test(hay);
    let release=truthy(form.dataset.defaultRelease)||/release notice|release notices|public-source drops|file drop|book release/.test(hay);
    if(!daily&&!weekly&&!release){if(/download|get the file|lead magnet|black file/.test(hay))release=true;else weekly=true;}
    return{daily,weekly,release};
  }
  function selectedPreferences(form){
    const defaults=preferenceDefaults(form);
    return{
      daily:preferenceValue(form,'public_daily_brief',preferenceValue(form,'daily',defaults.daily)),
      weekly:preferenceValue(form,'public_weekly_digest',preferenceValue(form,'weekly',defaults.weekly)),
      release:preferenceValue(form,'release_notices',defaults.release)
    };
  }
  async function submit(form,event){
    event.preventDefault();
    const email=emailInput(form);
    const consent=ensureConsent(form);
    const message=status(form);
    const consentGranted=Boolean(consent.checked);
    const preferences=selectedPreferences(form);
    const website=(form.querySelector('[name="website"]')||{}).value||'';
    const body={
      email:String(email&&email.value||'').trim(),
      name:String((form.querySelector('[name="name"],[name="Name"]')||{}).value||'').trim(),
      website,
      source:form.dataset.source||document.title,
      sourcePage:location.pathname,
      path:location.pathname,
      interest:context(form).slice(0,300),
      consent:consentGranted,
      marketingConsent:consentGranted,
      public_daily_brief:preferences.daily,
      daily:preferences.daily,
      public_weekly_digest:preferences.weekly,
      weekly:preferences.weekly,
      release_notices:preferences.release,
      locale:document.documentElement.lang||navigator.language||'en',
      timezone:(Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Paris'),
      wordingVersion:'newsletter-explicit-consent-v3'
    };
    if(!body.email||!/@/.test(body.email)){message.textContent='Enter a valid email first.';return;}
    if(!consentGranted){message.textContent='Please confirm that you agree to receive the selected briefings.';consent.focus();return;}
    if(!preferences.daily&&!preferences.weekly&&!preferences.release){message.textContent='Select at least one briefing or release-notice preference.';return;}
    const submitButton=form.querySelector('button[type="submit"],input[type="submit"]');
    if(submitButton)submitButton.disabled=true;
    message.textContent='Saving your preferences and preparing verification...';
    try{
      const response=await fetch('/newsletter-signup',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
      let data={};try{data=await response.json();}catch{}
      if(!response.ok||!data.ok)throw new Error(data.error||data.message||('Signup failed ('+response.status+')'));
      const verificationRequired=data.verificationRequired!==false;
      message.textContent=verificationRequired&&preferences.daily
        ?'Saved. Check your inbox to verify your email. Once verified, today’s Daily Control Brief will be sent immediately.'
        :verificationRequired?'Saved. Check your inbox to verify your email and activate the selected briefings.':'Saved. Your email preferences are active.';
      form.reset();
      for(const control of form.querySelectorAll('[data-default-checked="true"]'))control.checked=true;
      if(data.downloadUrl)setTimeout(()=>{location.href=data.downloadUrl;},500);
    }catch(error){message.textContent=String(error&&error.message||'Email signup failed. Please try again later.');}
    finally{if(submitButton)submitButton.disabled=false;}
  }
  function boot(){
    document.querySelectorAll('form').forEach(form=>{
      if(!shouldCapture(form)||form.dataset.newsletterCapture==='active')return;
      ensureConsent(form);form.dataset.newsletterCapture='active';form.addEventListener('submit',submit.bind(null,form));
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
`;

fs.writeFileSync(clientPath, client);
const synchronized = [];
if (fs.existsSync(sitePath) && fs.statSync(sitePath).isDirectory()) {
  fs.copyFileSync(clientPath, path.join(sitePath, 'newsletter.js'));
  synchronized.push('_site/newsletter.js');
}

const markers = [
  'public_daily_brief:preferences.daily',
  'public_weekly_digest:preferences.weekly',
  'release_notices:preferences.release',
  'Select at least one briefing or release-notice preference.',
  "wordingVersion:'newsletter-explicit-consent-v3'",
  'Please confirm that you agree to receive the selected briefings.',
  'today’s Daily Control Brief will be sent immediately.'
];
const final = fs.readFileSync(clientPath, 'utf8');
const missing = markers.filter(marker => !final.includes(marker));
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: missing.length === 0,
  generatedAt: new Date().toISOString(),
  runtime: 'newsletter.js',
  synchronized,
  missing,
  consentVersion: 'newsletter-explicit-consent-v3',
  boundary: 'This repair restores only the browser consent and preference payload. It does not send email, alter subscriber records or run the intelligence build.'
}, null, 2)}\n`);
if (missing.length) throw new Error(`Newsletter preference runtime repair failed: ${missing.join('; ')}`);
console.log(`Newsletter preference runtime restored${synchronized.length ? ' and synchronized to Cloudflare output' : ''}.`);
