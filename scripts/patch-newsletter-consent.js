const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const pagePath = path.join(root, 'newsletter.html');
const clientPath = path.join(root, 'newsletter.js');
if (!fs.existsSync(pagePath)) throw new Error('newsletter.html not found');

function runRequired(label, script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, encoding: 'utf8', stdio: 'pipe', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status || 1}`);
}

const consentLabel = `<label class="newsletter-consent">
            <input type="checkbox" name="marketingConsent" data-marketing-consent required>
            <span>I agree to receive the Matrix Reprogrammed briefings selected on this form. I can unsubscribe or change preferences at any time.</span>
          </label>`;
const truthfulStatus = '<p class="form-status newsletter-status">Your subscription is stored in the protected member database. Verify your email to activate the briefings named on this form.</p>';

let html = fs.readFileSync(pagePath, 'utf8');
const formMatch = html.match(/<form\b[^>]*(?:data-newsletter-form|id=["']newsletter-form["'])[^>]*>[\s\S]*?<\/form>/i);
if (!formMatch) throw new Error('Canonical newsletter form not found');
let form = formMatch[0];

form = form.replace(/<label\b[^>]*class=["'][^"']*newsletter-consent[^"']*["'][^>]*>[\s\S]*?<\/label>/gi, '');
form = form.replace(/<input\b[^>]*(?:name=["']marketingConsent["']|data-marketing-consent)[^>]*>/gi, '');
const submitButton = form.match(/<(?:button|input)\b[^>]*type=["']submit["'][^>]*>(?:[\s\S]*?<\/button>)?/i);
if (!submitButton) throw new Error('Newsletter submit control not found');
form = form.replace(submitButton[0], `${consentLabel}\n          ${submitButton[0]}`);

if (/<p\b[^>]*class=["'][^"']*(?:form-status|newsletter-status)[^"']*["'][^>]*>[\s\S]*?<\/p>/i.test(form)) {
  form = form.replace(/<p\b[^>]*class=["'][^"']*(?:form-status|newsletter-status)[^"']*["'][^>]*>[\s\S]*?<\/p>/i, truthfulStatus);
} else {
  form = form.replace(/<\/form>/i, `  ${truthfulStatus}\n        </form>`);
}
html = html.replace(formMatch[0], form);

if (!html.includes('<script src="newsletter.js"></script>')) {
  html = html.replace(/<\/body>/i, '  <script src="newsletter.js"></script>\n</body>');
}
fs.writeFileSync(pagePath, html);

const client = `(function(){
  'use strict';

  function context(form){
    return [
      document.title,
      location.pathname,
      form.getAttribute('name'),
      form.id,
      form.className,
      form.dataset.source,
      form.dataset.tags,
      form.textContent
    ].join(' ').toLowerCase();
  }

  function emailInput(form){
    return form.querySelector('input[type="email"],input[name="email"],input[name="Email"]');
  }

  function status(form){
    let node=form.querySelector('.form-status,.newsletter-status,[data-newsletter-status]');
    if(!node){
      node=document.createElement('p');
      node.className='form-status newsletter-status';
      form.appendChild(node);
    }
    return node;
  }

  function truthy(value){
    return ['1','true','yes','on','selected'].includes(String(value||'').trim().toLowerCase());
  }

  function shouldCapture(form){
    const email=emailInput(form);
    if(!email)return false;
    const hay=context(form);
    return /newsletter|black file|opt.?in|lead magnet|weekly|digest|brief|request|get the file|download|signal path|release notice/.test(hay);
  }

  function ensureConsent(form){
    let consent=form.querySelector('input[type="checkbox"][name="marketingConsent"],input[type="checkbox"][name="consent"],input[data-marketing-consent]');
    if(consent){consent.required=true;return consent;}
    const label=document.createElement('label');
    label.className='newsletter-consent';
    consent=document.createElement('input');
    consent.type='checkbox';
    consent.name='marketingConsent';
    consent.required=true;
    consent.dataset.marketingConsent='true';
    const text=document.createElement('span');
    text.textContent=' I agree to receive the Matrix Reprogrammed briefings selected on this form. I can unsubscribe or change preferences at any time.';
    label.appendChild(consent);
    label.appendChild(text);
    const button=form.querySelector('button[type="submit"],input[type="submit"]');
    if(button)form.insertBefore(label,button);else form.appendChild(label);
    return consent;
  }

  function preferenceControl(form,name){
    return [...form.querySelectorAll('[name="'+name+'"]')];
  }

  function preferenceValue(form,name,fallback){
    const controls=preferenceControl(form,name);
    if(!controls.length)return Boolean(fallback);
    return controls.some(control=>{
      if(control.type==='checkbox'||control.type==='radio')return control.checked;
      return truthy(control.value);
    });
  }

  function preferenceDefaults(form){
    const hay=context(form);
    const explicitDaily=truthy(form.dataset.defaultDaily);
    const explicitWeekly=truthy(form.dataset.defaultWeekly);
    const explicitRelease=truthy(form.dataset.defaultRelease);
    let daily=explicitDaily||/daily control brief|daily intelligence|daily brief|daily updates/.test(hay);
    let weekly=explicitWeekly||/weekly signal|weekly file|weekly digest|signal drop|\bweekly\b|\bdigest\b/.test(hay);
    let release=explicitRelease||/release notice|release notices|public-source drops|file drop|book release/.test(hay);
    if(!daily&&!weekly&&!release){
      if(/download|get the file|lead magnet|black file/.test(hay))release=true;
      else weekly=true;
    }
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
      const response=await fetch('/newsletter-signup',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(body)
      });
      let data={};
      try{data=await response.json();}catch{}
      if(!response.ok||!data.ok)throw new Error(data.error||data.message||('Signup failed ('+response.status+')'));
      const verificationRequired=data.verificationRequired!==false;
      message.textContent=verificationRequired&&preferences.daily
        ?'Saved. Check your inbox to verify your email. Once verified, today’s Daily Control Brief will be sent immediately.'
        :verificationRequired
          ?'Saved. Check your inbox to verify your email and activate the selected briefings.'
          :'Saved. Your email preferences are active.';
      form.reset();
      for(const control of form.querySelectorAll('[data-default-checked="true"]'))control.checked=true;
      if(data.downloadUrl)setTimeout(()=>{location.href=data.downloadUrl;},500);
    }catch(error){
      message.textContent=String(error&&error.message||'Email signup failed. Please try again later.');
    }finally{
      if(submitButton)submitButton.disabled=false;
    }
  }

  function boot(){
    document.querySelectorAll('form').forEach(form=>{
      if(!shouldCapture(form)||form.dataset.newsletterCapture==='active')return;
      ensureConsent(form);
      form.dataset.newsletterCapture='active';
      form.addEventListener('submit',submit.bind(null,form));
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
`;
fs.writeFileSync(clientPath, client);

const finalHtml = fs.readFileSync(pagePath, 'utf8');
const finalClient = fs.readFileSync(clientPath, 'utf8');
const checks = {
  oneConsentCheckbox: (finalHtml.match(/data-marketing-consent/g) || []).length === 1,
  requiredConsent: /data-marketing-consent[^>]*required|required[^>]*data-marketing-consent/.test(finalHtml),
  truthfulStorageCopy: finalHtml.includes('protected member database') && finalHtml.includes('briefings named on this form'),
  runtimeConsentGate: finalClient.includes('const consentGranted=Boolean(consent.checked);') && finalClient.includes('Please confirm that you agree to receive the selected briefings.'),
  truthfulPayload: finalClient.includes('public_daily_brief:preferences.daily') && finalClient.includes('public_weekly_digest:preferences.weekly') && finalClient.includes('release_notices:preferences.release'),
  explicitPreferenceGate: finalClient.includes('Select at least one briefing or release-notice preference.'),
  dailyVerificationMessage: finalClient.includes('today’s Daily Control Brief will be sent immediately.'),
  noUniversalWeeklyDefault: !finalClient.includes('public_weekly_digest:true') && !finalClient.includes('weekly:true'),
  serverErrorsVisible: finalClient.includes("throw new Error(data.error||data.message||('Signup failed ('+response.status+')'))")
};
const ok = Object.values(checks).every(Boolean);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'newsletter-consent-patch.json'), JSON.stringify({
  ok,
  generatedAt: new Date().toISOString(),
  checks,
  storage: 'Cloudflare D1 MEMBERS_DB',
  consentVersion: 'newsletter-explicit-consent-v3',
  sharedRuntime: 'daily-weekly-release-preferences-v3'
}, null, 2));
if (!ok) throw new Error(`Newsletter consent self-heal failed: ${JSON.stringify(checks)}`);
console.log('Newsletter consent and shared Daily / Weekly / release preference runtime applied.');

// This script is the final self-heal called by every Cloudflare build. Rebuild the
// authoritative current intelligence and mission surfaces here so older generators
// cannot overwrite fresh feeds, named actors, compact clocks or newsletter delivery.
runRequired('Final authoritative current-intelligence refresh', 'scripts/finalize-current-intelligence.js');
runRequired('Daily Control Brief lifecycle patch', 'scripts/patch-daily-control-brief-delivery.js');
runRequired('Final Atlas Layers build', 'scripts/build-atlas-layers.js');
runRequired('Final migration country grid', 'scripts/build-migration-crime-grid.js');
runRequired('Final compact mission timer synthesis', 'scripts/build-clock-wall.js');
runRequired('Final mission surface reconciliation', 'scripts/patch-final-mission-surfaces.js');
runRequired('AI speculative conclusions integrity pass', 'scripts/patch-ai-speculative-conclusions.js');
runRequired('Living intelligence regression test', 'scripts/living-intelligence-regression-test.js');
runRequired('Final Search V3 deployment compaction', 'scripts/build-search-v3-runtime.js');

// Force the graph projector to execute in this exact process after every graph/search
// test and immediately before build-cloudflare-output.js walks the source tree.
const graphModule = require.resolve('./patch-cloudflare-oversized-graph-contract.js');
delete require.cache[graphModule];
require(graphModule);
console.log('Final Cloudflare self-heal complete: consent runtime, structured brief, mission surfaces, Search V3 and compact graph projection are staged.');
