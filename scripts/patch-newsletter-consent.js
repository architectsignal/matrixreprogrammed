const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pagePath = path.join(root, 'newsletter.html');
const clientPath = path.join(root, 'newsletter.js');
if (!fs.existsSync(pagePath)) throw new Error('newsletter.html not found');

const consentLabel = `<label class="newsletter-consent">
            <input type="checkbox" name="marketingConsent" data-marketing-consent required>
            <span>I agree to receive Matrix Reprogrammed reports and updates by email. I can unsubscribe or change preferences at any time.</span>
          </label>`;
const truthfulStatus = '<p class="form-status newsletter-status">Your subscription is stored in the protected member database. Verify your email to activate reports, then manage preferences or unsubscribe at any time.</p>';

let html = fs.readFileSync(pagePath, 'utf8');
const formMatch = html.match(/<form\b[^>]*(?:data-newsletter-form|id=["']newsletter-form["'])[^>]*>[\s\S]*?<\/form>/i);
if (!formMatch) throw new Error('Canonical newsletter form not found');
let form = formMatch[0];

// Remove any generated or legacy marketing-consent fragments before adding the
// canonical explicit checkbox exactly once.
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
`;
fs.writeFileSync(clientPath, client);

const finalHtml = fs.readFileSync(pagePath, 'utf8');
const finalClient = fs.readFileSync(clientPath, 'utf8');
const checks = {
  oneConsentCheckbox: (finalHtml.match(/data-marketing-consent/g) || []).length === 1,
  requiredConsent: /data-marketing-consent[^>]*required|required[^>]*data-marketing-consent/.test(finalHtml),
  truthfulStorageCopy: finalHtml.includes('protected member database') && finalHtml.includes('manage preferences or unsubscribe'),
  runtimeConsentGate: finalClient.includes('const consentGranted=Boolean(consent.checked)') && finalClient.includes('Please confirm that you agree to receive email reports and updates.'),
  truthfulPayload: finalClient.includes('consent:consentGranted') && finalClient.includes('marketingConsent:consentGranted'),
  verificationMessage: finalClient.includes('Check your inbox to verify your email and activate reports.')
};
const ok = Object.values(checks).every(Boolean);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'newsletter-consent-patch.json'), JSON.stringify({
  ok,
  generatedAt: new Date().toISOString(),
  checks,
  storage: 'Cloudflare D1 MEMBERS_DB',
  consentVersion: 'newsletter-explicit-consent-v2'
}, null, 2));
if (!ok) throw new Error(`Newsletter consent self-heal failed: ${JSON.stringify(checks)}`);
console.log('Newsletter explicit consent, verification and preference wording applied.');
