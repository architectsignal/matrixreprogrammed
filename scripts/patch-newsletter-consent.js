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
  function context(form){return [document.title,location.pathname,form.getAttribute('name'),form.id,form.className,form.textContent].join(' ').toLowerCase()}
  function emailInput(form){return form.querySelector('input[type="email"],input[name="email"],input[name="Email"]')}
  function status(form){let s=form.querySelector('.form-status,.newsletter-status');if(!s){s=document.createElement('p');s.className='form-status newsletter-status';form.appendChild(s)}return s}
  function shouldCapture(form){const email=emailInput(form);if(!email)return false;const hay=context(form);return /newsletter|black file|opt.?in|lead magnet|weekly|digest|brief|request|get the file|download|signal path/.test(hay)}
  function explicitBool(form,names){for(const name of names){const field=form.querySelector('[name="'+name+'"]');if(!field)continue;if(field.type==='checkbox')return Boolean(field.checked);const raw=String(field.value||'').trim().toLowerCase();return ['1','true','yes','on'].includes(raw)}return null}
  function selectedPreferences(form){
    const hay=context(form);
    const explicitDaily=explicitBool(form,['public_daily_brief','daily']);
    const explicitWeekly=explicitBool(form,['public_weekly_digest','weekly']);
    const explicitRelease=explicitBool(form,['release_notices']);
    const daily=explicitDaily===null?/daily control brief|daily brief|daily intelligence/.test(hay):explicitDaily;
    const weekly=explicitWeekly===null?/weekly signal drop|weekly digest|weekly brief/.test(hay):explicitWeekly;
    const releaseNotices=explicitRelease===null?/release notice|release notices|public briefing|reports and updates/.test(hay):explicitRelease;
    return{daily,weekly,releaseNotices}
  }
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
    text.textContent=' I agree to receive the Matrix Reprogrammed briefings selected on this form. I can unsubscribe or change preferences at any time.';
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
    const selected=selectedPreferences(form);
    const body={
      email:email.value,
      name:(form.querySelector('[name="name"],[name="Name"]')||{}).value||'',
      source:document.title,
      sourcePage:location.pathname,
      path:location.pathname,
      interest:context(form).slice(0,300),
      consent:consentGranted,
      marketingConsent:consentGranted,
      public_daily_brief:selected.daily,
      daily:selected.daily,
      public_weekly_digest:selected.weekly,
      weekly:selected.weekly,
      release_notices:selected.releaseNotices,
      wordingVersion:'newsletter-explicit-consent-v3'
    };
    if(!body.email||!/@/.test(body.email)){s.textContent='Enter a valid email first.';return}
    if(!consentGranted){s.textContent='Please confirm that you agree to receive email reports and updates. This activates the selected email briefings.';consent.focus();return}
    if(!selected.daily&&!selected.weekly&&!selected.releaseNotices){s.textContent='This form does not identify a briefing preference. Please use the newsletter page.';return}
    s.textContent='Saving your email and preparing verification...';
    try{
      const res=await fetch('/newsletter-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await res.json();
      if(!data.ok)throw new Error(data.error||'Signup failed');
      if(selected.daily)s.textContent='Saved. Check your inbox to verify your email. Once verified, today’s Daily Control Brief will be sent immediately.';
      else s.textContent='Saved. Check your inbox to verify your email and activate the selected briefings.';
      form.reset();
      if(data.downloadUrl)setTimeout(()=>{location.href=data.downloadUrl},500)
    }catch(err){s.textContent='Email signup failed. Please try again later.'}
  }
  function boot(){document.querySelectorAll('form').forEach(form=>{if(!shouldCapture(form)||form.dataset.newsletterCapture==='active')return;ensureConsent(form);form.dataset.newsletterCapture='active';form.addEventListener('submit',submit.bind(null,form));})}
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
  runtimeConsentGate: finalClient.includes('const consentGranted=Boolean(consent.checked)') && finalClient.includes('selected email briefings'),
  truthfulPayload: finalClient.includes('public_daily_brief:selected.daily') && finalClient.includes('public_weekly_digest:selected.weekly'),
  dailyVerificationMessage: finalClient.includes('today’s Daily Control Brief will be sent immediately.'),
  noUniversalWeeklyDefault: !finalClient.includes('public_weekly_digest:true') && !finalClient.includes('weekly:true')
};
const ok = Object.values(checks).every(Boolean);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'newsletter-consent-patch.json'), JSON.stringify({
  ok,
  generatedAt: new Date().toISOString(),
  checks,
  storage: 'Cloudflare D1 MEMBERS_DB',
  consentVersion: 'newsletter-explicit-consent-v3'
}, null, 2));
if (!ok) throw new Error(`Newsletter consent self-heal failed: ${JSON.stringify(checks)}`);
console.log('Newsletter consent and form-specific Daily / Weekly preferences applied.');

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
