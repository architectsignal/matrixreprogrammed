const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changes = [];

function replaceRequired(text, before, after, label) {
  if (text.includes(before)) return text.replace(before, after);
  if (text.includes(after)) return text;
  throw new Error(`Membership integration patch could not find ${label}`);
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

const paypal = patchFile('src/worker-paypal-subscriptions.js', text => {
  let next = replaceRequired(
    text,
    "function cookie(request,name='matrix_session'){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const index=part.indexOf('=');if(index>0&&part.slice(0,index).trim()===name)return decodeURIComponent(part.slice(index+1).trim())}return''}",
    "function cookie(request,name=''){const raw=request.headers.get('cookie')||'';const values={};for(const part of raw.split(';')){const index=part.indexOf('=');if(index<=0)continue;const key=part.slice(0,index).trim();if(key&&!Object.prototype.hasOwnProperty.call(values,key))values[key]=decodeURIComponent(part.slice(index+1).trim())}if(name)return values[name]||'';return values.matrix_session_v2||values.matrix_session||''}",
    'the legacy PayPal session-cookie reader'
  );
  next = replaceRequired(
    next,
    "async function config(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await activationState(env);return json({ok:true,authenticated:true,environment:state.environment,currency:'EUR',clientId:state.configured?String(env.PAYPAL_CLIENT_ID):null,configured:state.configured,checkoutEnabled:state.checkoutEnabled,webhookConfigured:Boolean(env.PAYPAL_WEBHOOK_ID),tiers:Object.fromEntries(Object.entries(tiers).map(([key,value])=>[key,{label:value.label,price:value.price,planId:state.plans.find(plan=>plan.tier===key)?.provider_plan_id||null}])),activation:{environmentSwitch:state.environmentSwitch,databaseSwitch:state.databaseSwitch,confirmation:state.confirmation,plansReady:state.plansReady}})}",
    "async function currentSubscriptionForMember(env,memberId){return await first(env.MEMBERS_DB.prepare(`SELECT tier,billing_state,entitlement_active,provider_status,current_period_end,next_billing_at,CASE WHEN entitlement_active=1 OR (entitlement_active IS NULL AND LOWER(provider_status) IN ('active','trialing') AND (current_period_end IS NULL OR datetime(current_period_end)>datetime('now'))) THEN 1 ELSE 0 END AS paid_access FROM paypal_current_subscription_status WHERE member_id=? ORDER BY paid_access DESC,state_updated_at DESC LIMIT 1`).bind(memberId))}\nasync function config(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await activationState(env);const currentSubscription=await currentSubscriptionForMember(env,required.auth.member.id);return json({ok:true,authenticated:true,environment:state.environment,currency:'EUR',clientId:state.configured?String(env.PAYPAL_CLIENT_ID):null,configured:state.configured,checkoutEnabled:state.checkoutEnabled,webhookConfigured:Boolean(env.PAYPAL_WEBHOOK_ID),paidAccess:bool(currentSubscription?.paid_access),currentSubscription:currentSubscription||null,effectiveTier:required.auth.entitlement.effective_tier,billingUrl:'/billing-dashboard.html',tiers:Object.fromEntries(Object.entries(tiers).map(([key,value])=>[key,{label:value.label,price:value.price,planId:state.plans.find(plan=>plan.tier===key)?.provider_plan_id||null}])),activation:{environmentSwitch:state.environmentSwitch,databaseSwitch:state.databaseSwitch,confirmation:state.confirmation,plansReady:state.plansReady}})}",
    'the PayPal member configuration response'
  );
  next = replaceRequired(
    next,
    "async function checkoutIntent(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await activationState(env);if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,error:'PayPal checkout is disabled until activation gates pass'},503);const input=await body(request);const tier=clean(input.tier,40);if(!tiers[tier])return json({ok:false,error:'Unknown membership tier'},400);const plan=state.plans.find(item=>item.tier===tier);if(!plan)return json({ok:false,error:'The selected PayPal plan is unavailable'},409);const current=new Date();const expiresAt=new Date(current.getTime()+30*60*1000).toISOString();await env.MEMBERS_DB.prepare('UPDATE paypal_checkout_intents SET used_at=? WHERE member_id=? AND used_at IS NULL').bind(current.toISOString(),required.auth.member.id).run();const intentId=id('paypal-intent');await env.MEMBERS_DB.prepare('INSERT INTO paypal_checkout_intents (id,member_id,tier,plan_id,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(intentId,required.auth.member.id,tier,plan.provider_plan_id,expiresAt,current.toISOString()).run();await env.MEMBERS_DB.prepare(\"INSERT INTO paypal_checkout_intent_state (checkout_intent_id,environment,status,updated_at,created_at) VALUES (?,?,'created',?,?)\").bind(intentId,state.environment,current.toISOString(),current.toISOString()).run();return json({ok:true,intentId,tier,planId:plan.provider_plan_id,customId:intentId,clientId:String(env.PAYPAL_CLIENT_ID),currency:'EUR',environment:state.environment,expiresAt})}",
    "async function checkoutIntent(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const currentSubscription=await currentSubscriptionForMember(env,required.auth.member.id);if(currentSubscription&&bool(currentSubscription.paid_access))return json({ok:false,error:'An active PayPal membership already exists. Use the billing dashboard to manage or cancel it before starting another subscription.',currentSubscription,billingUrl:'/billing-dashboard.html'},409);const state=await activationState(env);if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,error:'PayPal checkout is disabled until activation gates pass'},503);const input=await body(request);const tier=clean(input.tier,40);if(!tiers[tier])return json({ok:false,error:'Unknown membership tier'},400);const plan=state.plans.find(item=>item.tier===tier);if(!plan)return json({ok:false,error:'The selected PayPal plan is unavailable'},409);const current=new Date();const expiresAt=new Date(current.getTime()+30*60*1000).toISOString();await env.MEMBERS_DB.prepare('UPDATE paypal_checkout_intents SET used_at=? WHERE member_id=? AND used_at IS NULL').bind(current.toISOString(),required.auth.member.id).run();const intentId=id('paypal-intent');await env.MEMBERS_DB.prepare('INSERT INTO paypal_checkout_intents (id,member_id,tier,plan_id,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(intentId,required.auth.member.id,tier,plan.provider_plan_id,expiresAt,current.toISOString()).run();await env.MEMBERS_DB.prepare(\"INSERT INTO paypal_checkout_intent_state (checkout_intent_id,environment,status,updated_at,created_at) VALUES (?,?,'created',?,?)\").bind(intentId,state.environment,current.toISOString(),current.toISOString()).run();return json({ok:true,intentId,tier,planId:plan.provider_plan_id,customId:intentId,clientId:String(env.PAYPAL_CLIENT_ID),currency:'EUR',environment:state.environment,expiresAt})}",
    'the PayPal checkout-intent allocator'
  );
  return next;
});

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
  next = replaceRequired(
    next,
    "      if (!response.ok || !config.configured || !config.clientId) {",
    "      if (config.paidAccess && config.currentSubscription) {\n        systemStatus.className = 'status ok';\n        systemStatus.textContent = 'Your paid membership is active. ';\n        const billingLink = document.createElement('a');\n        billingLink.href = config.billingUrl || 'billing-dashboard.html';\n        billingLink.textContent = 'Manage billing';\n        systemStatus.appendChild(billingLink);\n        setAllPlanMessages('Paid access is already active. Use the billing dashboard to manage or cancel it.');\n        return;\n      }\n      if (!response.ok || !config.configured || !config.clientId) {",
    'the active-membership checkout guard'
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
    "const paid=member.paidAccess===true;$('paid-state').textContent=paid?'Active entitlement':'Free registered access';$('paid-state').className=paid?'good':'warning';$('admin-link').hidden=!member.isAdmin;",
    "const paid=member.paidAccess===true;$('paid-state').textContent=paid?'Active entitlement':'Free registered access';$('paid-state').className=paid?'good':'warning';const membershipAction=$('membership-action');membershipAction.href=paid?'billing-dashboard.html':'membership.html';membershipAction.textContent=paid?'Manage billing':'Manage membership';$('admin-link').hidden=!member.isAdmin;",
    'the dashboard membership action state'
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
  '<a id="admin-link" class="btn alt" href="admin-member-dashboard.html" hidden>Admin dashboard</a>\n        <a id="membership-action" class="btn" href="membership.html">Manage membership</a>\n        <a class="btn alt" href="index.html">Public site</a>',
  'the dashboard membership-management action'
));

const billingDashboard = patchFile('billing-dashboard.js', text => replaceRequired(
  text,
  "fetch(path,{cache:'no-store',headers:",
  "fetch(path,{cache:'no-store',credentials:'include',headers:",
  'the billing-dashboard credential forwarding'
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
  duplicateSubscriptionsBlocked: paypal.includes('An active PayPal membership already exists') && paypal.includes('currentSubscriptionForMember') && paypal.includes('bool(currentSubscription.paid_access)'),
  legacyActiveSubscriptionsBlocked: paypal.includes("LOWER(provider_status) IN ('active','trialing')") && paypal.includes("datetime(current_period_end)>datetime('now')"),
  configReturnsBillingState: paypal.includes("billingUrl:'/billing-dashboard.html'") && paypal.includes('currentSubscription:currentSubscription||null') && paypal.includes('paidAccess:bool(currentSubscription?.paid_access)'),
  protectedAssetsReadCurrentSession: assetGate.includes("cookieValue(request, 'matrix_session_v2') || cookieValue(request, 'matrix_session')"),
  emailAcceptsMembershipConsent: emailLifecycle.includes('input.consent??input.marketingConsent'),
  firstDailyBriefUsesDetailedBuilder: emailLifecycle.includes('const firstBrief=await sendDetailedFirstDailyBrief(request,env,member);') && !emailLifecycle.includes('const firstBrief=await sendFirstDailyBrief(request,env,member);'),
  signupSendsCanonicalConsent: membershipTemplate.includes('consent:marketingConsent,marketingConsent'),
  membershipFetchesIncludeCredentials: membershipTemplate.includes("credentials:'include'"),
  activeMembershipShowsBilling: membershipTemplate.includes("billingLink.textContent = 'Manage billing'"),
  dashboardFetchIncludesCredentials: dashboard.includes("fetch(path,{cache:'no-store',credentials:'include'"),
  dashboardLogoutIncludesCredentials: dashboard.includes("method:'POST',credentials:'include',cache:'no-store'"),
  freeDashboardSkipsPaidWatchlistCall: dashboard.includes("capabilities.includes('member_watchlists')"),
  dashboardHasMembershipAction: dashboardHtml.includes('id="membership-action"'),
  billingDashboardIncludesCredentials: billingDashboard.includes("credentials:'include'"),
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
    dashboardRepair: 'Free members no longer trigger the Intelligence-only watchlist endpoint during initial loading, logout carries credentials explicitly, and membership or billing management is directly reachable.',
    paymentSafetyRepair: 'The server blocks a second checkout for both current state-backed and legacy active PayPal entitlements, and the member sees a Manage billing path instead of another subscribe button.',
    recoveryRepair: 'A verified email subscriber is given clear routes to email preferences and secure member login.'
  }, null, 2)
);

console.log(`Cloudflare member login, PayPal, protected assets and newsletter integration patched: ${changes.length ? changes.join(', ') : 'already current'}`);
