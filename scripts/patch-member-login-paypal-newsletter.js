const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changes = [];

function replaceRequired(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) {
    throw new Error(`Membership integration patch could not find ${label}`);
  }
  return text.replace(before, after);
}

function patchFile(relativePath, transform) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) throw new Error(`Membership integration file missing: ${relativePath}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changes.push(relativePath);
  }
  return after;
}

const paypal = patchFile('src/worker-paypal-subscriptions.js', text => replaceRequired(
  text,
  "function cookie(request,name='matrix_session'){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const index=part.indexOf('=');if(index>0&&part.slice(0,index).trim()===name)return decodeURIComponent(part.slice(index+1).trim())}return''}",
  "function cookie(request,name=''){const raw=request.headers.get('cookie')||'';const values={};for(const part of raw.split(';')){const index=part.indexOf('=');if(index<=0)continue;const key=part.slice(0,index).trim();if(key&&!Object.prototype.hasOwnProperty.call(values,key))values[key]=decodeURIComponent(part.slice(index+1).trim())}if(name)return values[name]||'';return values.matrix_session_v2||values.matrix_session||''}",
  'the legacy PayPal session-cookie reader'
));

const assetGate = patchFile('src/worker-access-gate.js', text => replaceRequired(
  text,
  "  const token = cookieValue(request, 'matrix_session');",
  "  const token = cookieValue(request, 'matrix_session_v2') || cookieValue(request, 'matrix_session');",
  'the protected-asset legacy session-cookie reader'
));

const emailLifecycle = patchFile('src/worker-email-lifecycle.js', text => {
  let next = replaceRequired(
    text,
    "if(!bool(input.consent,false))return json({ok:false,error:'Explicit email consent is required'},400);",
    "if(!bool(input.consent??input.marketingConsent,false))return json({ok:false,error:'Explicit email consent is required'},400);",
    'the email consent check'
  );
  next = replaceRequired(
    next,
    "const firstBrief=await sendFirstDailyBrief(request,env,member);",
    "const firstBrief=await sendDetailedFirstDailyBrief(request,env,member);",
    'the basic first-daily-brief call'
  );
  return next;
});

const membershipTemplate = patchFile('scripts/templates/membership-auth/membership.template', text => {
  let next = text;
  next = replaceRequired(
    next,
    "method: 'POST', headers: {'content-type':'application/json'},",
    "method: 'POST', credentials:'include', cache:'no-store', headers: {'content-type':'application/json'},",
    'membership signup fetch options'
  );
  next = replaceRequired(
    next,
    "body: JSON.stringify({email,name,marketingConsent,consentVersion:'membership-consent-v1'",
    "body: JSON.stringify({email,name,consent:marketingConsent,marketingConsent,consentVersion:'membership-consent-v1'",
    'membership signup consent payload'
  );
  next = replaceRequired(
    next,
    "const response = await fetch(url, {method:'POST', headers:{'content-type':'application/json',accept:'application/json'}, body:JSON.stringify(body)});",
    "const response = await fetch(url, {method:'POST', credentials:'include', cache:'no-store', headers:{'content-type':'application/json',accept:'application/json'}, body:JSON.stringify(body)});",
    'PayPal POST credential forwarding'
  );
  next = replaceRequired(
    next,
    "const response = await fetch('/api/paypal/config', {headers:{accept:'application/json'},cache:'no-store'});",
    "const response = await fetch('/api/paypal/config', {credentials:'include',headers:{accept:'application/json'},cache:'no-store'});",
    'PayPal config credential forwarding'
  );
  return next;
});

const dashboard = patchFile('member-dashboard-app.js', text => {
  let next = replaceRequired(
    text,
    "fetch(path,{cache:'no-store',headers:",
    "fetch(path,{cache:'no-store',credentials:'include',headers:",
    'member dashboard credential forwarding'
  );
  next = replaceRequired(
    next,
    "async function load(){try{setStatus('Loading your entitlement-controlled workspace…');state.dashboard=await api('/api/member/dashboard');renderAccount();$('dashboard-content').hidden=false;await Promise.all([loadSessions(),loadSaved(),loadFollows(),loadWatchlists(),loadArchive(),loadDownloads()]);setStatus('Your account and entitlement state are current.','good')}catch(error){setStatus(error.message||'The dashboard could not be loaded.','danger')}}",
    "async function load(){try{setStatus('Loading your entitlement-controlled workspace…');state.dashboard=await api('/api/member/dashboard');renderAccount();$('dashboard-content').hidden=false;const member=state.dashboard.member||{};const capabilities=Array.isArray(member.capabilities)?member.capabilities:[];const canWatch=member.isAdmin===true||capabilities.includes('member_watchlists');$('watch-form').hidden=!canWatch;if(!canWatch)empty($('watch-list'),'Intelligence membership unlocks watchlists.');const tasks=[loadSessions(),loadSaved(),loadFollows(),loadArchive(),loadDownloads()];if(canWatch)tasks.push(loadWatchlists());await Promise.all(tasks);setStatus('Your account and entitlement state are current.','good')}catch(error){setStatus(error.message||'The dashboard could not be loaded.','danger')}}",
    'free-member watchlist gating'
  );
  next = replaceRequired(
    next,
    "await fetch('/api/auth/logout',{method:'POST'}).catch(()=>null);",
    "await fetch('/api/auth/logout',{method:'POST',credentials:'include',cache:'no-store'}).catch(()=>null);",
    'member logout credential forwarding'
  );
  return next;
});

const dashboardHtml = patchFile('member-dashboard.html', text => replaceRequired(
  text,
  '<a id="admin-link" class="btn alt" href="admin-member-dashboard.html" hidden>Admin dashboard</a>\n        <a class="btn alt" href="index.html">Public site</a>',
  '<a id="admin-link" class="btn alt" href="admin-member-dashboard.html" hidden>Admin dashboard</a>\n        <a class="btn" href="membership.html">Manage membership</a>\n        <a class="btn alt" href="index.html">Public site</a>',
  'the dashboard membership-management action'
));

const emailStatus = patchFile('email-status.html', text => {
  let next = replaceRequired(
    text,
    '<p><a class="btn" id="dashboard-link" href="subscriber-dashboard.html" hidden>Open subscriber dashboard</a></p>\n        <p><a class="btn alt" href="newsletter.html">Return to newsletter</a></p>',
    '<p><a class="btn" id="dashboard-link" href="subscriber-dashboard.html" hidden>Manage email preferences</a></p>\n        <p><a class="btn alt" id="member-login-link" href="member-login.html" hidden>Open member login</a></p>\n        <p><a class="btn alt" href="newsletter.html">Return to newsletter</a></p>',
    'the verified-email recovery actions'
  );
  next = replaceRequired(
    next,
    "const dashboard=document.getElementById('dashboard-link');\n    const token=params.get('token');",
    "const dashboard=document.getElementById('dashboard-link');\n    const memberLogin=document.getElementById('member-login-link');\n    const token=params.get('token');",
    'the member-login status reference'
  );
  next = replaceRequired(
    next,
    "if(token){dashboard.href='subscriber-dashboard.html?token='+encodeURIComponent(token);dashboard.hidden=false;sessionStorage.setItem('matrixEmailPreferenceToken',token)}",
    "if(token){dashboard.href='subscriber-dashboard.html?token='+encodeURIComponent(token);dashboard.hidden=false;sessionStorage.setItem('matrixEmailPreferenceToken',token)}memberLogin.hidden=false",
    'the verified-email member-login action'
  );
  return next;
});

const checks = {
  cloudflareProductionWorker: fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8').includes('main = "src/worker-production.js"'),
  paypalReadsCurrentSession: paypal.includes('values.matrix_session_v2||values.matrix_session'),
  protectedAssetsReadCurrentSession: assetGate.includes("cookieValue(request, 'matrix_session_v2') || cookieValue(request, 'matrix_session')"),
  emailAcceptsMembershipConsent: emailLifecycle.includes('input.consent??input.marketingConsent'),
  firstDailyBriefUsesDetailedBuilder: emailLifecycle.includes('const firstBrief=await sendDetailedFirstDailyBrief(request,env,member);'),
  signupSendsCanonicalConsent: membershipTemplate.includes('consent:marketingConsent,marketingConsent'),
  membershipFetchesIncludeCredentials: membershipTemplate.includes("credentials:'include'"),
  dashboardFetchIncludesCredentials: dashboard.includes("fetch(path,{cache:'no-store',credentials:'include'"),
  dashboardLogoutIncludesCredentials: dashboard.includes("method:'POST',credentials:'include',cache:'no-store'"),
  freeDashboardSkipsPaidWatchlistCall: dashboard.includes("capabilities.includes('member_watchlists')"),
  dashboardHasMembershipAction: dashboardHtml.includes('Manage membership'),
  verifiedEmailHasMemberLoginAction: emailStatus.includes('Open member login')
};

if (Object.values(checks).some(value => value !== true)) {
  throw new Error(`Membership integration verification failed: ${JSON.stringify(checks)}`);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'downloads', 'member-login-paypal-newsletter-patch.json'),
  JSON.stringify({
    ok: true,
    generatedAt: new Date().toISOString(),
    platform: 'Cloudflare Worker + D1 + Cloudflare Assets',
    changes,
    checks,
    rootCause: 'Passwordless login writes matrix_session_v2 while the PayPal worker and protected-asset gate read only matrix_session.',
    newsletterRepair: 'Membership signup now sends canonical consent, the email lifecycle accepts the compatible alias, and the first selected daily brief uses the detailed intelligence builder with its safe fallback.',
    dashboardRepair: 'Free members no longer trigger the Intelligence-only watchlist endpoint during initial loading, logout carries credentials explicitly, and membership management is directly reachable.',
    recoveryRepair: 'A verified email subscriber is given clear routes to email preferences and secure member login.'
  }, null, 2)
);

console.log(`Cloudflare member login, PayPal, protected assets and newsletter integration patched: ${changes.length ? changes.join(', ') : 'already current'}`);
